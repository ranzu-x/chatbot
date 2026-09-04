import pool from "../db.js";

// ─── GET COMPREHENSIVE AGENCY / USER ENTITLEMENTS & USAGE ───────────────────
export async function getAgencyEntitlements(agencyId, userId = null) {
  try {
    if (!agencyId && !userId) {
      return getFallbackUnlimitedEntitlements();
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
        if (uRows[0].role === "AGENT") targetType = "TEAM_MEMBER";
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
    let usedBotAccounts = 0;
    let usedSubscribers = 0;
    let usedTeamMembers = 0;
    let channelCounts = {};

    if (agencyId) {
      // Count connected bots
      const [botRows] = await pool.query(
        "SELECT platform, COUNT(*) as count FROM integrations WHERE agency_id = ? AND is_active = 1 GROUP BY platform",
        [agencyId]
      );
      for (const b of botRows) {
        channelCounts[b.platform] = Number(b.count);
        usedBotAccounts += Number(b.count);
      }

      // Count subscribers / contacts
      const [[{ totalContacts }]] = await pool.query(
        "SELECT COUNT(*) as totalContacts FROM contacts WHERE agency_id = ?",
        [agencyId]
      );
      usedSubscribers = Number(totalContacts || 0);

      // Count team members / agents (avoid double-counting members that match both conditions)
      const [[{ totalAgents }]] = await pool.query(
        "SELECT COUNT(DISTINCT id) as totalAgents FROM agent_profiles WHERE agency_id = ?",
        [agencyId]
      );
      usedTeamMembers = Number(totalAgents || 0);
    } else if (userId) {
      // Count team members for direct End User accounts
      const [[{ totalAgents }]] = await pool.query(
        "SELECT COUNT(*) as totalAgents FROM agent_profiles WHERE owner_user_id = ?",
        [userId]
      );
      usedTeamMembers = Number(totalAgents || 0);
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
      usage: {
        usedBotAccounts,
        usedSubscribers,
        usedTeamMembers,
        channelCounts,
      },
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
