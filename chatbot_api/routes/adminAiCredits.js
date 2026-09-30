/**
 * Super Admin → AI Credits (utils/aiCredits/*): the platform pool, credit
 * rates, add-on catalogue, usage / ledger / purchases reporting (server-side
 * filters, paged), per-account adjustments and refunds. Super Admin only.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import {
  getCreditSettings, saveCreditSettings, adjustPlatformPool, adjustAccountCredits, refundAddonPurchase,
  getCreditSummary, AiCreditError, invalidateAiCreditPlan,
} from "../utils/aiCredits/service.js";
import { PROVIDERS } from "../utils/aiProviders/registry.js";

const router = express.Router();
router.use("/admin/ai-credits", authMiddleware, roleMiddleware("ADMIN"));

function fail(res, err, label) {
  if (err instanceof AiCreditError || err.status) return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
  console.error(`[Admin AI credits] ${label}:`, err);
  return res.status(500).json({ success: false, message: "Server error" });
}
function paging(q, max = 100) {
  const pageSize = Math.min(max, Math.max(1, Number(q.pageSize) || 25));
  const page = Math.max(1, Number(q.page) || 1);
  return { pageSize, page, offset: (page - 1) * pageSize };
}
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
function dateRange(q, where, params, column) {
  if (isDay(q.from)) { where.push(`${column} >= ?`); params.push(q.from); }
  if (isDay(q.to)) { where.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`); params.push(q.to); }
}
const idParam = (v) => (/^\d+$/.test(String(v || "")) ? Number(v) : null);

// ─── Overview ────────────────────────────────────────────────────────────────
router.get("/admin/ai-credits/overview", async (req, res) => {
  try {
    const where = ["1=1"]; const params = [];
    dateRange(req.query, where, params, "u.created_at");
    const w = where.join(" AND ");
    const [[pool0]] = await pool.query("SELECT balance, held, total_added, total_used, updated_at FROM ai_platform_pool WHERE id = 1");
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(u.credits),0) AS credits, COALESCE(SUM(u.total_tokens),0) AS tokens,
              COALESCE(SUM(u.credits_purchased),0) AS fromPurchased, COALESCE(SUM(u.uncovered),0) AS uncovered
         FROM ai_usage u WHERE ${w}`, params);
    const [byPackage] = await pool.query(
      `SELECT u.package_id AS id, COALESCE(p.name, 'No plan') AS name, COUNT(*) AS calls, SUM(u.credits) AS credits
         FROM ai_usage u LEFT JOIN packages p ON p.id = u.package_id WHERE ${w}
        GROUP BY u.package_id, p.name ORDER BY credits DESC LIMIT 20`, params);
    const [byReseller] = await pool.query(
      `SELECT r.id, r.name, COUNT(*) AS calls, SUM(u.credits) AS credits, COUNT(DISTINCT u.agency_id) AS accounts
         FROM ai_usage u
         JOIN agencies a ON a.id = u.agency_id
         JOIN agencies r ON r.id = COALESCE(u.reseller_id, IF(a.account_type = 'RESELLER', a.id, NULL))
        WHERE ${w} GROUP BY r.id, r.name ORDER BY credits DESC LIMIT 20`, params);
    const [byAccount] = await pool.query(
      `SELECT a.id, a.name, a.account_type AS accountType, COUNT(*) AS calls, SUM(u.credits) AS credits
         FROM ai_usage u JOIN agencies a ON a.id = u.agency_id WHERE ${w}
        GROUP BY a.id, a.name, a.account_type ORDER BY credits DESC LIMIT 20`, params);
    const [byFeature] = await pool.query(
      `SELECT u.feature, COUNT(*) AS calls, SUM(u.credits) AS credits FROM ai_usage u WHERE ${w} GROUP BY u.feature ORDER BY credits DESC`, params);
    const pWhere = ["status IN ('PAID','REFUNDED')"]; const pParams = [];
    dateRange(req.query, pWhere, pParams, "paid_at");
    const [purchases] = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(credits),0) AS credits, currency, COALESCE(SUM(price),0) AS revenue
         FROM ai_credit_purchases WHERE ${pWhere.join(" AND ")} GROUP BY currency`, pParams);
    const [[outstanding]] = await pool.query("SELECT COALESCE(SUM(purchased_balance),0) AS purchasedOutstanding FROM ai_credit_wallets");
    const settings = await getCreditSettings();
    const num = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v])));
    return res.json({
      success: true,
      pool: {
        balance: Number(pool0?.balance || 0), held: Number(pool0?.held || 0), available: Math.max(0, Number(pool0?.balance || 0) - Number(pool0?.held || 0)),
        totalAdded: Number(pool0?.total_added || 0), totalUsed: Number(pool0?.total_used || 0), low: Number(pool0?.balance || 0) < settings.lowPlatformBalanceWarning,
      },
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v)])),
      purchasedOutstanding: Number(outstanding.purchasedOutstanding),
      byPackage: num(byPackage), byReseller: num(byReseller), byAccount: num(byAccount), byFeature: num(byFeature),
      purchases: num(purchases),
    });
  } catch (err) {
    return fail(res, err, "overview");
  }
});

router.post("/admin/ai-credits/platform", async (req, res) => {
  try {
    const result = await adjustPlatformPool({ amount: req.body?.amount, note: String(req.body?.note || "").slice(0, 300), adminUserId: req.user.id });
    return res.json({ success: true, ...result, message: "Platform credits updated" });
  } catch (err) {
    return fail(res, err, "platform");
  }
});

// ─── Settings (rates, consumption order) ─────────────────────────────────────
router.get("/admin/ai-credits/settings", async (req, res) => {
  try {
    return res.json({
      success: true,
      settings: await getCreditSettings(),
      providers: Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, models: p.models })),
    });
  } catch (err) {
    return fail(res, err, "settings");
  }
});
router.put("/admin/ai-credits/settings", async (req, res) => {
  try {
    const settings = await saveCreditSettings(req.body?.settings || {});
    return res.json({ success: true, settings, message: "Saved" });
  } catch (err) {
    return fail(res, err, "save settings");
  }
});

// ─── Add-ons ─────────────────────────────────────────────────────────────────
function cleanAddon(body) {
  const name = String(body?.name || "").trim().slice(0, 120);
  if (!name) throw new AiCreditError("Give the add-on a name", { status: 400, code: "BAD_ADDON" });
  const credits = Math.floor(Number(body?.credits));
  if (!(credits > 0) || credits > 1e12) throw new AiCreditError("Credits must be a whole number above 0", { status: 400, code: "BAD_ADDON" });
  const price = Math.round(Number(body?.price) * 100) / 100;
  if (!(price >= 0) || price > 1e9) throw new AiCreditError("Enter a valid price", { status: 400, code: "BAD_ADDON" });
  const currency = String(body?.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new AiCreditError("Currency must be a 3-letter code, e.g. USD", { status: 400, code: "BAD_ADDON" });
  return {
    name, credits, price, currency,
    description: String(body?.description || "").trim().slice(0, 500) || null,
    sortOrder: Math.trunc(Number(body?.sortOrder) || 0),
    isActive: body?.isActive === undefined ? 1 : body.isActive ? 1 : 0,
  };
}

router.get("/admin/ai-credits/addons", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, (SELECT COUNT(*) FROM ai_credit_purchases p WHERE p.addon_id = a.id AND p.status = 'PAID') AS sold
         FROM ai_credit_addons a WHERE a.deleted_at IS NULL ORDER BY a.sort_order, a.credits`
    );
    return res.json({ success: true, addons: rows.map((r) => ({ ...r, credits: Number(r.credits), price: Number(r.price), sold: Number(r.sold), expiry: "NEVER" })) });
  } catch (err) {
    return fail(res, err, "addons");
  }
});
router.post("/admin/ai-credits/addons", async (req, res) => {
  try {
    const a = cleanAddon(req.body);
    const [ins] = await pool.query(
      "INSERT INTO ai_credit_addons (name, description, credits, price, currency, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [a.name, a.description, a.credits, a.price, a.currency, a.isActive, a.sortOrder]
    );
    return res.status(201).json({ success: true, id: ins.insertId, message: "Add-on created" });
  } catch (err) {
    return fail(res, err, "create addon");
  }
});
router.put("/admin/ai-credits/addons/:id", async (req, res) => {
  try {
    const a = cleanAddon(req.body);
    // Existing purchases keep what they bought (name, credits, price are copied onto each purchase).
    const [r] = await pool.query(
      "UPDATE ai_credit_addons SET name = ?, description = ?, credits = ?, price = ?, currency = ?, is_active = ?, sort_order = ? WHERE id = ? AND deleted_at IS NULL",
      [a.name, a.description, a.credits, a.price, a.currency, a.isActive, a.sortOrder, idParam(req.params.id)]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Add-on not found" });
    return res.json({ success: true, message: "Saved" });
  } catch (err) {
    return fail(res, err, "update addon");
  }
});
router.patch("/admin/ai-credits/addons/:id/active", async (req, res) => {
  try {
    const [r] = await pool.query("UPDATE ai_credit_addons SET is_active = ? WHERE id = ? AND deleted_at IS NULL", [req.body?.isActive ? 1 : 0, idParam(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Add-on not found" });
    return res.json({ success: true });
  } catch (err) {
    return fail(res, err, "toggle addon");
  }
});
// Soft delete: gone from every list; past purchases still show what was bought.
router.delete("/admin/ai-credits/addons/:id", async (req, res) => {
  try {
    const [r] = await pool.query("UPDATE ai_credit_addons SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND deleted_at IS NULL", [idParam(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Add-on not found" });
    return res.json({ success: true, message: "Add-on removed" });
  } catch (err) {
    return fail(res, err, "delete addon");
  }
});

// ─── Usage history (filters + paging, server side) ───────────────────────────
router.get("/admin/ai-credits/usage", async (req, res) => {
  try {
    const q = req.query;
    const { pageSize, page, offset } = paging(q);
    const where = ["1=1"]; const params = [];
    dateRange(q, where, params, "u.created_at");
    const eq = (col, v) => { const id = idParam(v); if (id) { where.push(`${col} = ?`); params.push(id); } };
    eq("u.agency_id", q.agencyId);
    eq("u.reseller_id", q.resellerId);
    eq("u.user_id", q.userId);
    eq("u.package_id", q.packageId);
    eq("u.integration_id", q.integrationId);
    eq("u.agent_id", q.agentId);
    for (const [col, v] of [["u.provider", q.provider], ["u.model", q.model], ["u.feature", q.feature]]) {
      if (v) { where.push(`${col} = ?`); params.push(String(v).slice(0, 100)); }
    }
    const w = where.join(" AND ");
    const [[agg]] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(u.credits),0) AS credits, COALESCE(SUM(u.input_tokens),0) AS inputTokens, COALESCE(SUM(u.output_tokens),0) AS outputTokens
         FROM ai_usage u WHERE ${w}`, params);
    const [rows] = await pool.query(
      `SELECT u.id, u.created_at, u.agency_id, a.name AS account_name, a.account_type, u.reseller_id, r.name AS reseller_name,
              u.user_id, us.name AS user_name, u.package_id, p.name AS package_name, u.feature, u.provider, u.model,
              u.input_tokens, u.output_tokens, u.total_tokens, u.estimated, u.credits, u.credits_package, u.credits_purchased, u.uncovered,
              u.integration_id, i.name AS bot_name, u.agent_id, ag.name AS agent_name
         FROM ai_usage u
         LEFT JOIN agencies a ON a.id = u.agency_id
         LEFT JOIN agencies r ON r.id = u.reseller_id
         LEFT JOIN users us ON us.id = u.user_id
         LEFT JOIN packages p ON p.id = u.package_id
         LEFT JOIN integrations i ON i.id = u.integration_id
         LEFT JOIN ai_agents ag ON ag.id = u.agent_id
        WHERE ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return res.json({ success: true, page, pageSize, total: Number(agg.total), sums: { credits: Number(agg.credits), inputTokens: Number(agg.inputTokens), outputTokens: Number(agg.outputTokens) }, usage: rows });
  } catch (err) {
    return fail(res, err, "usage");
  }
});

// Values for the usage filters (small lists; accounts are searched separately).
router.get("/admin/ai-credits/filters", async (req, res) => {
  try {
    const [packages] = await pool.query("SELECT id, name, type FROM packages ORDER BY type, name");
    const [resellers] = await pool.query("SELECT id, name FROM agencies WHERE account_type = 'RESELLER' ORDER BY name LIMIT 500");
    const [models] = await pool.query("SELECT DISTINCT provider, model FROM ai_usage WHERE provider IS NOT NULL ORDER BY provider, model LIMIT 200");
    const [features] = await pool.query("SELECT DISTINCT feature FROM ai_usage ORDER BY feature LIMIT 100");
    return res.json({ success: true, packages, resellers, models, features: features.map((f) => f.feature) });
  } catch (err) {
    return fail(res, err, "filters");
  }
});

router.get("/admin/ai-credits/accounts", async (req, res) => {
  try {
    const term = String(req.query.q || "").trim().slice(0, 100);
    const params = [];
    let where = "a.account_type <> 'PLATFORM'";
    if (term) {
      where += " AND (a.name LIKE ? OR a.id = ? OR EXISTS (SELECT 1 FROM users u WHERE u.id = a.owner_id AND u.email LIKE ?))";
      params.push(`%${term}%`, Number(term) || 0, `%${term}%`);
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.name, a.account_type AS accountType, a.parent_agency_id AS resellerId, w.purchased_balance AS purchasedBalance, w.lifetime_used AS lifetimeUsed
         FROM agencies a LEFT JOIN ai_credit_wallets w ON w.agency_id = a.id WHERE ${where} ORDER BY a.name LIMIT 25`, params);
    return res.json({ success: true, accounts: rows });
  } catch (err) {
    return fail(res, err, "accounts");
  }
});

router.get("/admin/ai-credits/accounts/:agencyId", async (req, res) => {
  try {
    const agencyId = idParam(req.params.agencyId);
    const [[a]] = await pool.query("SELECT id, name, account_type FROM agencies WHERE id = ?", [agencyId]);
    if (!a) return res.status(404).json({ success: false, message: "Account not found" });
    invalidateAiCreditPlan(agencyId);
    return res.json({ success: true, account: { id: a.id, name: a.name, accountType: a.account_type }, summary: await getCreditSummary(agencyId) });
  } catch (err) {
    return fail(res, err, "account");
  }
});

router.post("/admin/ai-credits/accounts/:agencyId/adjust", async (req, res) => {
  try {
    const agencyId = idParam(req.params.agencyId);
    const [[a]] = await pool.query("SELECT id FROM agencies WHERE id = ?", [agencyId]);
    if (!a) return res.status(404).json({ success: false, message: "Account not found" });
    const note = String(req.body?.note || "").trim().slice(0, 300);
    if (!note) return res.status(400).json({ success: false, message: "Add a note — it is kept in the ledger" });
    const result = await adjustAccountCredits({ agencyId, bucket: req.body?.bucket, amount: req.body?.amount, note, adminUserId: req.user.id });
    return res.json({ success: true, ...result, message: "Credits adjusted" });
  } catch (err) {
    return fail(res, err, "adjust");
  }
});

// ─── Ledger + purchases ──────────────────────────────────────────────────────
router.get("/admin/ai-credits/transactions", async (req, res) => {
  try {
    const q = req.query;
    const { pageSize, page, offset } = paging(q);
    const where = ["1=1"]; const params = [];
    if (["ACCOUNT", "PLATFORM"].includes(q.scope)) { where.push("t.scope = ?"); params.push(q.scope); }
    if (idParam(q.agencyId)) { where.push("t.agency_id = ?"); params.push(idParam(q.agencyId)); }
    if (q.type) { where.push("t.type = ?"); params.push(String(q.type).slice(0, 40)); }
    if (["PACKAGE", "PURCHASED", "PLATFORM"].includes(q.bucket)) { where.push("t.bucket = ?"); params.push(q.bucket); }
    // AI_USAGE rows are most of the ledger; hide them unless asked (usage has its own tab).
    if (q.includeUsage !== "1" && !q.type) where.push("t.type <> 'AI_USAGE'");
    dateRange(q, where, params, "t.created_at");
    const w = where.join(" AND ");
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ai_credit_transactions t WHERE ${w}`, params);
    const [rows] = await pool.query(
      `SELECT t.*, a.name AS account_name, us.name AS user_name
         FROM ai_credit_transactions t LEFT JOIN agencies a ON a.id = t.agency_id LEFT JOIN users us ON us.id = t.user_id
        WHERE ${w} ORDER BY t.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    return res.json({ success: true, page, pageSize, total: Number(total), transactions: rows });
  } catch (err) {
    return fail(res, err, "transactions");
  }
});

router.get("/admin/ai-credits/purchases", async (req, res) => {
  try {
    const q = req.query;
    const { pageSize, page, offset } = paging(q);
    const where = ["1=1"]; const params = [];
    if (["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"].includes(q.status)) { where.push("p.status = ?"); params.push(q.status); }
    if (idParam(q.agencyId)) { where.push("p.agency_id = ?"); params.push(idParam(q.agencyId)); }
    dateRange(q, where, params, "p.created_at");
    const w = where.join(" AND ");
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ai_credit_purchases p WHERE ${w}`, params);
    const [rows] = await pool.query(
      `SELECT p.id, p.agency_id, a.name AS account_name, a.account_type, us.name AS user_name, p.addon_name, p.credits, p.price, p.currency,
              p.charged_amount, p.charged_currency, p.provider, p.status, p.gateway_ref, p.refunded_credits, p.created_at, p.paid_at
         FROM ai_credit_purchases p LEFT JOIN agencies a ON a.id = p.agency_id LEFT JOIN users us ON us.id = p.user_id
        WHERE ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    return res.json({ success: true, page, pageSize, total: Number(total), purchases: rows });
  } catch (err) {
    return fail(res, err, "purchases");
  }
});

// Takes back the purchase's unused credits and marks it refunded. The money itself is refunded in the gateway.
router.post("/admin/ai-credits/purchases/:id/refund", async (req, res) => {
  try {
    const result = await refundAddonPurchase({ purchaseId: idParam(req.params.id), adminUserId: req.user.id, note: String(req.body?.note || "").slice(0, 300) });
    return res.json({ success: true, ...result, message: `Refunded — ${Number(result.takenBack).toLocaleString("en-US")} unused credits taken back` });
  } catch (err) {
    return fail(res, err, "refund");
  }
});

export default router;
