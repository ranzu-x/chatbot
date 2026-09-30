/**
 * AI Credits for a workspace (My Account → AI Credits; utils/aiCredits/*).
 * Everything is scoped from req.tenant — an id from the client is never used
 * to pick the workspace, and nothing here lets a client set a balance.
 *
 * Mounted with the public routers in index.js: the gateway IPN below is
 * anonymous (verified with the gateway itself); every other path uses
 * authMiddleware on its own.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { getCreditSummary, AiCreditError } from "../utils/aiCredits/service.js";
import {
  listActiveAddons, gatewaysForCurrency, startAddonCheckout, confirmStripePurchase, completeFromGatewayIpn,
} from "../utils/aiCredits/purchases.js";

const router = express.Router();
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const agencyOf = (req) => req.tenant?.agencyId ?? req.user?.agencyId;
const isOwner = (req) => req.user?.role === "RESELLER" || req.user?.role === "ADMIN";

function paging(q, max = 100) {
  const pageSize = Math.min(max, Math.max(1, Number(q.pageSize) || 25));
  const page = Math.max(1, Number(q.page) || 1);
  return { pageSize, page, offset: (page - 1) * pageSize };
}
const dateRange = (q, where, params, column) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.from || ""))) { where.push(`${column} >= ?`); params.push(q.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to || ""))) { where.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`); params.push(q.to); }
};
function fail(res, err, label) {
  if (err instanceof AiCreditError || err.status) return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
  console.error(`[AI credits] ${label}:`, err);
  return res.status(500).json({ success: false, message: "Server error" });
}

// ─── Balances + what can be bought ───────────────────────────────────────────
router.get("/ai-credits/summary", authMiddleware, async (req, res) => {
  try {
    const summary = await getCreditSummary(agencyOf(req));
    const canBuy = summary.canPurchase && isOwner(req);
    let addons = [];
    if (canBuy) {
      addons = await listActiveAddons();
      for (const a of addons) a.gateways = await gatewaysForCurrency(a.currency);
    }
    const { platformAvailable, ...mine } = summary;
    return res.json({ success: true, summary: { ...mine, aiAvailable: platformAvailable > 0 }, canBuy, addons });
  } catch (err) {
    return fail(res, err, "summary");
  }
});

router.get("/ai-credits/transactions", authMiddleware, async (req, res) => {
  try {
    const { pageSize, page, offset } = paging(req.query);
    const where = ["scope = 'ACCOUNT'", "agency_id = ?"];
    const params = [agencyOf(req)];
    if (req.query.type) { where.push("type = ?"); params.push(String(req.query.type)); }
    if (["PACKAGE", "PURCHASED"].includes(req.query.bucket)) { where.push("bucket = ?"); params.push(req.query.bucket); }
    dateRange(req.query, where, params, "created_at");
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ai_credit_transactions WHERE ${where.join(" AND ")}`, params);
    const [rows] = await pool.query(
      `SELECT id, type, bucket, amount, balance_before, balance_after, source, purchase_id, usage_id, metadata, created_at
         FROM ai_credit_transactions WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return res.json({ success: true, total: Number(total), page, pageSize, transactions: rows });
  } catch (err) {
    return fail(res, err, "transactions");
  }
});

router.get("/ai-credits/usage", authMiddleware, async (req, res) => {
  try {
    const { pageSize, page, offset } = paging(req.query);
    const where = ["u.agency_id = ?"];
    const params = [agencyOf(req)];
    if (req.query.feature) { where.push("u.feature = ?"); params.push(String(req.query.feature)); }
    dateRange(req.query, where, params, "u.created_at");
    const [[{ total, credits }]] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(u.credits), 0) AS credits FROM ai_usage u WHERE ${where.join(" AND ")}`, params
    );
    const [rows] = await pool.query(
      `SELECT u.id, u.created_at, u.feature, u.provider, u.model, u.input_tokens, u.output_tokens, u.total_tokens, u.estimated,
              u.credits, u.credits_package, u.credits_purchased, i.name AS bot_name, ag.name AS agent_name, us.name AS user_name
         FROM ai_usage u
         LEFT JOIN integrations i ON i.id = u.integration_id AND i.agency_id = u.agency_id
         LEFT JOIN ai_agents ag ON ag.id = u.agent_id AND ag.agency_id = u.agency_id
         LEFT JOIN users us ON us.id = u.user_id
        WHERE ${where.join(" AND ")} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return res.json({ success: true, total: Number(total), credits: Number(credits), page, pageSize, usage: rows });
  } catch (err) {
    return fail(res, err, "usage");
  }
});

router.get("/ai-credits/purchases", authMiddleware, async (req, res) => {
  try {
    const { pageSize, page, offset } = paging(req.query, 50);
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM ai_credit_purchases WHERE agency_id = ? AND status <> 'CANCELLED'", [agencyOf(req)]);
    const [rows] = await pool.query(
      `SELECT id, addon_name, credits, price, currency, charged_amount, charged_currency, provider, status, refunded_credits, created_at, paid_at
         FROM ai_credit_purchases WHERE agency_id = ? AND status <> 'CANCELLED' ORDER BY id DESC LIMIT ? OFFSET ?`,
      [agencyOf(req), pageSize, offset]
    );
    return res.json({ success: true, total: Number(total), page, pageSize, purchases: rows });
  } catch (err) {
    return fail(res, err, "purchases");
  }
});

// ─── Buying ──────────────────────────────────────────────────────────────────
// Owner only; the pack, price and credits come from the server, never the body.
router.post("/ai-credits/checkout", authMiddleware, async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ success: false, message: "Only the account owner can buy AI credits", code: "OWNER_ONLY" });
    const result = await startAddonCheckout({
      agencyId: agencyOf(req), userId: req.user.id, userEmail: req.user.email, userName: req.user.name,
      addonId: Number(req.body?.addonId), provider: req.body?.provider,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "checkout");
  }
});

// Return page after Stripe: re-checks the session with Stripe; the browser's "success" is never trusted.
router.post("/ai-credits/purchases/:id/confirm", authMiddleware, async (req, res) => {
  try {
    const result = await confirmStripePurchase({ agencyId: agencyOf(req), purchaseId: Number(req.params.id), sessionId: req.body?.sessionId });
    return res.json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "confirm");
  }
});

// ─── BDT gateways: browser return (display only) + trusted IPN ───────────────
for (const outcome of ["success", "fail", "cancel"]) {
  router.all(`/ai-credits/checkout/:provider/${outcome}`, (req, res) => {
    res.redirect(`${frontendBase()}/ai-credits?payment=${outcome}`);
  });
}

router.post("/ai-credits/checkout/:provider/ipn", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const result = await completeFromGatewayIpn(req.params.provider, req.body || {});
    if (!result.credited && !["already_credited"].includes(result.reason)) {
      console.warn(`[AI credits IPN] ${req.params.provider}: ${result.reason}`);
      return res.status(result.reason === "not_valid" || result.reason === "amount_mismatch" ? 400 : 200).send(result.reason);
    }
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[AI credits IPN] error:", err);
    return res.status(500).send("Error");
  }
});

export default router;
