import pool from "../db.js";

// ─── USAGE HELPERS (shared by every entitlement-resolution path) ────────────
async function getUsageForAgency(agencyId) {
  let usedBotAccounts = 0;
  let usedSubscribers = 0;
  let usedTeamMembers = 0;
  let channelCounts = {};
  if (!agencyId) return { usedBotAccounts, usedSubscribers, usedTeamMembers, channelCounts };

  const [botRows] = await pool.query(
    "SELECT platform, COUNT(*) as count FROM integrations WHERE agency_id = ? AND is_active = 1 GROUP BY platform",
    [agencyId]
  );
  for (const b of botRows) {
    channelCounts[b.platform] = Number(b.count);
    usedBotAccounts += Number(b.count);
  }

  const [[{ totalContacts }]] = await pool.query(
    "SELECT COUNT(*) as totalContacts FROM contacts WHERE agency_id = ?",
    [agencyId]
  );
  usedSubscribers = Number(totalContacts || 0);

  const [[{ totalAgents }]] = await pool.query(
    "SELECT COUNT(DISTINCT id) as totalAgents FROM agent_profiles WHERE agency_id = ?",
    [agencyId]
  );
  usedTeamMembers = Number(totalAgents || 0);

  return { usedBotAccounts, usedSubscribers, usedTeamMembers, channelCounts };
}

// Sums the same usage counters across a whole set of agency ids in one pass
// (used for reseller-pool usage — self + every RESELLER_CUSTOMER child).
async function getUsageAcrossAgencies(agencyIds) {
  if (!agencyIds.length) return { usedBotAccounts: 0, usedSubscribers: 0, usedTeamMembers: 0 };
  const [[bot]] = await pool.query(
    `SELECT COUNT(*) as c FROM integrations WHERE agency_id IN (?) AND is_active = 1`,
    [agencyIds]
  );
  const [[sub]] = await pool.query(`SELECT COUNT(*) as c FROM contacts WHERE agency_id IN (?)`, [agencyIds]);
  const [[team]] = await pool.query(
    `SELECT COUNT(DISTINCT id) as c FROM agent_profiles WHERE agency_id IN (?)`,
    [agencyIds]
  );
  return { usedBotAccounts: Number(bot.c || 0), usedSubscribers: Number(sub.c || 0), usedTeamMembers: Number(team.c || 0) };
}

// ─── RESELLER-CUSTOMER PACKAGE RESOLUTION ────────────────────────────────────
// A RESELLER_CUSTOMER's package comes entirely from the reseller's OWN
// agency_packages/agency_client_subscriptions — a separate plan definition
// from the platform's packages table (see the approved SaaS hierarchy plan
// §7). This is the "individual ceiling" tier; the reseller's own platform
// package (via subscriptions/packages) supplies the separate "pool ceiling"
// tier, applied in assertLimit below.
async function getResellerCustomerEntitlements(agencyId) {
  const [subRows] = await pool.query(
    `SELECT p.* FROM agency_client_subscriptions acs
     JOIN agency_packages p ON p.id = acs.package_id
     WHERE acs.client_agency_id = ? AND acs.status = 'ACTIVE'
     ORDER BY acs.id DESC LIMIT 1`,
    [agencyId]
  );
  const usage = await getUsageForAgency(agencyId);
  const pkg = subRows[0];

  if (!pkg) {
    // No plan assigned yet by the reseller — unlimited at THIS tier; the
    // reseller's own pool ceiling (assertLimit's pool-tier check) still applies.
    return {
      package: { id: 0, name: "Unassigned (reseller pool applies)", type: "RESELLER_CUSTOMER", slug: "unassigned", price: 0, billingCycle: "monthly" },
      limits: { maxBotAccounts: null, maxSubscribers: null, maxTeamMembers: null, maxMonthlyMessages: null },
      usage,
      enabledModules: getFallbackUnlimitedEntitlements().enabledModules,
      modulesMap: {},
    };
  }

  return {
    package: { id: pkg.id, name: pkg.name, slug: pkg.slug, type: "RESELLER_CUSTOMER", price: Number(pkg.price), billingCycle: pkg.billing_cycle },
    limits: {
      maxBotAccounts: pkg.max_bot_accounts === null ? null : Number(pkg.max_bot_accounts),
      maxSubscribers: pkg.max_subscribers === null ? null : Number(pkg.max_subscribers),
      maxTeamMembers: pkg.max_team_members === null ? null : Number(pkg.max_team_members),
      maxMonthlyMessages: pkg.max_monthly_messages === null ? null : Number(pkg.max_monthly_messages),
    },
    usage,
    // agency_packages has no module matrix of its own (yet) — features
    // default to the same fallback set every unlimited account gets, since
    // per-module gating for reseller-defined plans is a future extension
    // (features_summary JSON is available on the row for display purposes).
    enabledModules: getFallbackUnlimitedEntitlements().enabledModules,
    modulesMap: {},
  };
}

// ─── GET COMPREHENSIVE AGENCY / USER ENTITLEMENTS & USAGE ───────────────────
export async function getAgencyEntitlements(agencyId, userId = null) {
  try {
    if (!agencyId && !userId) {
      return getFallbackUnlimitedEntitlements();
    }

    if (agencyId) {
      const [[agencyRow]] = await pool.query("SELECT account_type FROM agencies WHERE id = ?", [agencyId]);
      if (agencyRow?.account_type === "RESELLER_CUSTOMER") {
        return await getResellerCustomerEntitlements(agencyId);
      }
    }

    // 1. Resolve Package ID
    let packageId = null;
    let targetType = "AGENCY";

    if (agencyId) {
      const [agRows] = await pool.query(
        `SELECT a.package_id, a.id as agency_id, a.name as agency_name,
                s.package_id as sub_package_id, s.status as sub_status, s.expires_at
         FROM agencies a
         LEFT JOIN subscriptions s ON s.agency_id = a.id AND s.status = 'ACTIVE'
         WHERE a.id = ? LIMIT 1`,
        [agencyId]
      );
      if (agRows.length) {
        packageId = agRows[0].sub_package_id || agRows[0].package_id;
      }
    }

    if (!packageId && userId) {
      const [uRows] = await pool.query(
        `SELECT u.package_id, u.id as user_id, u.role,
                s.package_id as sub_package_id, s.status as sub_status
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'ACTIVE'
         WHERE u.id = ? LIMIT 1`,
        [userId]
      );
      if (uRows.length) {
        packageId = uRows[0].sub_package_id || uRows[0].package_id;
        if (uRows[0].role === "USER") targetType = "TEAM_MEMBER";
        else if (uRows[0].role !== "ADMIN") targetType = "END_USER";
      }
    }

    // Fallback to default active package if unassigned
    let pkg = null;
    if (packageId) {
      const [pkgRows] = await pool.query("SELECT * FROM packages WHERE id = ? LIMIT 1", [packageId]);
      if (pkgRows.length) pkg = pkgRows[0];
    }

    if (!pkg) {
      const [defaultPkgRows] = await pool.query(
        "SELECT * FROM packages WHERE is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1"
      );
      if (defaultPkgRows.length) pkg = defaultPkgRows[0];
    }

    if (!pkg) {
      return getFallbackUnlimitedEntitlements();
    }

    // 2. Fetch Module Configurations for this Package
    const [moduleRows] = await pool.query(
      `SELECT pm.module_key, pm.is_enabled, pm.limits_json,
              m.display_name, m.module_type, m.category, m.description, m.icon
       FROM package_modules pm
       JOIN modules m ON m.key = pm.module_key
       WHERE pm.package_id = ? AND m.is_active = 1`,
      [pkg.id]
    );

    const enabledModules = [];
    const modulesMap = {};

    for (const r of moduleRows) {
      let limits = {};
      try {
        limits = typeof r.limits_json === "string" ? JSON.parse(r.limits_json || "{}") : r.limits_json || {};
      } catch {
        limits = {};
      }

      modulesMap[r.module_key] = {
        key: r.module_key,
        displayName: r.display_name,
        moduleType: r.module_type,
        category: r.category,
        isEnabled: Boolean(r.is_enabled),
        limits,
      };

      if (r.is_enabled) {
        enabledModules.push(r.module_key);
      }
    }

    // 3. Real-Time Usage Tracking
    let usage = { usedBotAccounts: 0, usedSubscribers: 0, usedTeamMembers: 0, channelCounts: {} };
    if (agencyId) {
      usage = await getUsageForAgency(agencyId);
    } else if (userId) {
      const [[{ totalAgents }]] = await pool.query(
        "SELECT COUNT(*) as totalAgents FROM agent_profiles WHERE owner_user_id = ?",
        [userId]
      );
      usage.usedTeamMembers = Number(totalAgents || 0);
    }

    return {
      package: {
        id: pkg.id,
        name: pkg.name,
        slug: pkg.slug,
        type: pkg.type,
        price: Number(pkg.price),
        billingCycle: pkg.billing_cycle,
      },
      limits: {
        maxBotAccounts: pkg.max_bot_accounts === null ? null : Number(pkg.max_bot_accounts),
        maxSubscribers: pkg.max_subscribers === null ? null : Number(pkg.max_subscribers),
        maxTeamMembers: pkg.max_team_members === null ? null : Number(pkg.max_team_members),
        maxMonthlyMessages: pkg.max_monthly_messages === null ? null : Number(pkg.max_monthly_messages),
      },
      usage,
      enabledModules,
      modulesMap,
    };
  } catch (err) {
    console.error("Entitlements resolution error:", err);
    return getFallbackUnlimitedEntitlements();
  }
}

function getFallbackUnlimitedEntitlements() {
  return {
    package: { id: 0, name: "Full Access", type: "AGENCY", slug: "full-access", price: 0, billingCycle: "lifetime" },
    limits: { maxBotAccounts: null, maxSubscribers: null, maxTeamMembers: null, maxMonthlyMessages: null },
    usage: { usedBotAccounts: 0, usedSubscribers: 0, usedTeamMembers: 0, channelCounts: {} },
    enabledModules: [
      "channel_whatsapp", "channel_facebook", "channel_instagram", "channel_telegram", "channel_webchat", "channel_tiktok",
      "feature_live_chat", "feature_subscribers", "feature_bot_manager", "feature_comment_automation",
      "feature_broadcasts", "feature_sequences", "feature_ai_agent", "feature_custom_domain",
      "feature_appointments"
    ],
    modulesMap: {},
  };
}

// ─── RESELLER POOL (shared-usage-pool) ENFORCEMENT ───────────────────────────
// Per the approved SaaS hierarchy plan (§7): a reseller's own platform
// package defines a POOL ceiling shared across the reseller's own usage AND
// every one of its RESELLER_CUSTOMER children's usage combined — checked
// against REAL usage, not against what the reseller has handed out on paper
// via agency_packages. A RESELLER_CUSTOMER's individual agency_packages
// ceiling (handled by getResellerCustomerEntitlements above) is a SEPARATE,
// ADDITIONAL check — both must pass.
const POOLABLE_LIMITS = new Set(["max_bot_accounts", "max_subscribers", "max_team_members"]);

async function getPoolAgencyIds(resellerAgencyId) {
  const [rows] = await pool.query(
    "SELECT id FROM agencies WHERE id = ? OR (parent_agency_id = ? AND account_type = 'RESELLER_CUSTOMER')",
    [resellerAgencyId, resellerAgencyId]
  );
  return rows.map((r) => r.id);
}

async function assertResellerPoolLimit(resellerAgencyId, limitType, increment) {
  if (!POOLABLE_LIMITS.has(limitType)) return;
  const rootEntitlements = await getAgencyEntitlements(resellerAgencyId, null);
  const poolLimitByType = {
    max_bot_accounts: rootEntitlements.limits.maxBotAccounts,
    max_subscribers: rootEntitlements.limits.maxSubscribers,
    max_team_members: rootEntitlements.limits.maxTeamMembers,
  };
  const poolLimit = poolLimitByType[limitType];
  if (poolLimit === null || poolLimit === undefined) return; // unlimited pool

  const agencyIds = await getPoolAgencyIds(resellerAgencyId);
  const usage = await getUsageAcrossAgencies(agencyIds);
  const usedByType = {
    max_bot_accounts: usage.usedBotAccounts,
    max_subscribers: usage.usedSubscribers,
    max_team_members: usage.usedTeamMembers,
  };
  const used = usedByType[limitType] ?? 0;

  if (used + increment > poolLimit) {
    const err = new Error(
      `Your reseller's shared plan limit has been reached (${used}/${poolLimit} used across every customer combined). Every customer under this reseller is blocked from adding more until the reseller upgrades its plan.`
    );
    err.status = 403;
    err.code = "RESELLER_POOL_LIMIT_EXCEEDED";
    throw err;
  }
}

// ─── ASSERTION: CHECK MODULE ACCESS ──────────────────────────────────────────
export async function assertModuleAccess(agencyId, moduleKey, userId = null) {
  const entitlements = await getAgencyEntitlements(agencyId, userId);
  const isEnabled = entitlements.enabledModules.includes(moduleKey);

  if (!isEnabled) {
    const error = new Error(
      `Access denied: The "${moduleKey}" module is not included in your current ${entitlements.package.name} plan. Please upgrade your package to unlock this feature.`
    );
    error.status = 403;
    error.code = "MODULE_DISABLED";
    error.moduleKey = moduleKey;
    throw error;
  }
  return true;
}

// ─── ASSERTION: CHECK USAGE CAPACITY LIMITS ──────────────────────────────────
export async function assertLimit(agencyId, limitType, increment = 1, userId = null) {
  // "How many customers can a reseller create" is checked entirely against
  // the reseller's OWN platform package's reseller_management module limit
  // — it has no individual/pool split (a reseller doesn't have a "parent"
  // pool above it other than the platform, which isn't itself limited here).
  if (limitType === "max_reseller_customers") {
    const entitlements = await getAgencyEntitlements(agencyId, userId);
    const maxCustomers = entitlements.modulesMap?.reseller_management?.limits?.maxResellerCustomers;
    if (maxCustomers === undefined || maxCustomers === null) return true; // unlimited / not configured
    const [[{ c }]] = await pool.query(
      "SELECT COUNT(*) as c FROM agencies WHERE parent_agency_id = ? AND account_type = 'RESELLER_CUSTOMER'",
      [agencyId]
    );
    if (Number(c) + increment > Number(maxCustomers)) {
      const err = new Error(`Customer limit reached: Your reseller plan allows up to ${maxCustomers} customers. Currently at ${c}. Please upgrade your reseller plan.`);
      err.status = 403;
      err.code = "LIMIT_EXCEEDED";
      throw err;
    }
    return true;
  }

  // Tier 1: this account's own (individual) entitlements — unchanged
  // behavior for DIRECT_CUSTOMER/RESELLER/PLATFORM; for a RESELLER_CUSTOMER
  // this now resolves against the reseller's own agency_packages plan
  // (see getResellerCustomerEntitlements) instead of the platform packages
  // table.
  const entitlements = await getAgencyEntitlements(agencyId, userId);
  const { limits, usage, package: pkg } = entitlements;

  if (limitType === "max_bot_accounts" && limits.maxBotAccounts !== null) {
    if (usage.usedBotAccounts + increment > limits.maxBotAccounts) {
      const err = new Error(
        `Bot accounts limit reached: Your current plan (${pkg.name}) allows a maximum of ${limits.maxBotAccounts} connected bot channels. Currently using ${usage.usedBotAccounts}. Please upgrade your package.`
      );
      err.status = 403;
      err.code = "LIMIT_EXCEEDED";
      throw err;
    }
  }

  if (limitType === "max_subscribers" && limits.maxSubscribers !== null) {
    if (usage.usedSubscribers + increment > limits.maxSubscribers) {
      const err = new Error(
        `Subscriber limit reached: Your current plan allows up to ${limits.maxSubscribers} contacts. Currently at ${usage.usedSubscribers}. Please upgrade your package to continue receiving new subscribers.`
      );
      err.status = 403;
      err.code = "LIMIT_EXCEEDED";
      throw err;
    }
  }

  if (limitType === "max_team_members" && limits.maxTeamMembers !== null) {
    if (usage.usedTeamMembers + increment > limits.maxTeamMembers) {
      const err = new Error(
        `Team member limit reached: Your current plan allows up to ${limits.maxTeamMembers} agents. Currently using ${usage.usedTeamMembers}. Please upgrade your package to invite more agents.`
      );
      err.status = 403;
      err.code = "LIMIT_EXCEEDED";
      throw err;
    }
  }

  // Tier 2: reseller shared-usage pool — an ADDITIONAL ceiling for
  // RESELLER and RESELLER_CUSTOMER accounts, checked against real combined
  // usage across the whole tree (see assertResellerPoolLimit above).
  if (agencyId && POOLABLE_LIMITS.has(limitType)) {
    const [[agencyRow]] = await pool.query("SELECT account_type, parent_agency_id FROM agencies WHERE id = ?", [agencyId]);
    if (agencyRow?.account_type === "RESELLER") {
      await assertResellerPoolLimit(agencyId, limitType, increment);
    } else if (agencyRow?.account_type === "RESELLER_CUSTOMER" && agencyRow.parent_agency_id) {
      await assertResellerPoolLimit(agencyRow.parent_agency_id, limitType, increment);
    }
  }

  return true;
}

// ─── EXPRESS MIDDLEWARE HELPERS ──────────────────────────────────────────────
export function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const agencyId = req.user?.agencyId || req.agencyId;
      const userId = req.user?.id;
      await assertModuleAccess(agencyId, moduleKey, userId);
      next();
    } catch (err) {
      return res.status(err.status || 403).json({
        success: false,
        message: err.message,
        code: err.code || "FORBIDDEN",
        moduleKey: err.moduleKey,
      });
    }
  };
}

export function requireLimit(limitType, increment = 1) {
  return async (req, res, next) => {
    try {
      const agencyId = req.user?.agencyId || req.agencyId;
      const userId = req.user?.id;
      await assertLimit(agencyId, limitType, increment, userId);
      next();
    } catch (err) {
      return res.status(err.status || 403).json({
        success: false,
        message: err.message,
        code: err.code || "FORBIDDEN",
      });
    }
  };
}
