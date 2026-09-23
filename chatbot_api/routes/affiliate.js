/**
 * Affiliate System — Super Admin tenant only.
 *
 * Tenant-side (`/affiliate/*`): any eligible tenant (agencies.account_type
 * DIRECT_CUSTOMER or RESELLER — never RESELLER_CUSTOMER, see
 * utils/affiliateCommission.js) manages its own referral link, referrals
 * and commission ledger.
 *
 * Admin-side (`/admin/affiliates/*`, ADMIN role only): the Super Admin
 * sees every affiliate platform-wide and records manual payouts. See
 * CLAUDE.md / migrate_affiliate_system.js for the design.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import {
  isEligibleAccountType,
  getOrCreateAffiliate,
  getAffiliateStats,
} from "../utils/affiliateCommission.js";

const router = express.Router();

const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

function referralUrl(code) {
  return `${frontendBase()}/pricing?ref=${encodeURIComponent(code)}`;
}

// ─── Tenant-side ──────────────────────────────────────────────────────────
router.use("/affiliate", authMiddleware);

function requireEligibleTenant(req, res, next) {
  const accountType = req.tenant?.accountType || req.user?.accountType;
  if (!isEligibleAccountType(accountType)) {
    return res.status(403).json({ success: false, message: "The affiliate program is only available to accounts signed up directly under the platform." });
  }
  next();
}

// Own affiliate profile — lazily created on first visit.
router.get("/affiliate/me", requireEligibleTenant, async (req, res) => {
  try {
    const agencyId = req.tenant?.agencyId || req.user?.agencyId;
    if (!agencyId) {
      return res.status(400).json({ success: false, message: "Workspace required" });
    }
    const affiliate = await getOrCreateAffiliate(agencyId);
    const stats = await getAffiliateStats(affiliate.id);
    return res.json({
      success: true,
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        status: affiliate.status,
        commissionRate: Number(affiliate.commission_rate),
        referralUrl: referralUrl(affiliate.code),
        createdAt: affiliate.created_at,
      },
      stats,
    });
  } catch (err) {
    console.error("GET /affiliate/me error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Tenants this affiliate has referred, with what each has earned so far.
router.get("/affiliate/me/referrals", requireEligibleTenant, async (req, res) => {
  try {
    const agencyId = req.tenant?.agencyId || req.user?.agencyId;
    if (!agencyId) {
      return res.status(400).json({ success: false, message: "Workspace required" });
    }
    const affiliate = await getOrCreateAffiliate(agencyId);
    const [rows] = await pool.query(
      `SELECT
         a.id, a.name, a.account_type, a.is_active, a.created_at,
         COALESCE(SUM(ac.revenue_amount), 0) AS totalRevenue,
         COALESCE(SUM(CASE WHEN ac.status != 'VOID' THEN ac.commission_amount ELSE 0 END), 0) AS totalCommission
       FROM agencies a
       LEFT JOIN affiliate_commissions ac ON ac.referred_agency_id = a.id
       WHERE a.affiliate_id = ?
       GROUP BY a.id, a.name, a.account_type, a.is_active, a.created_at
       ORDER BY a.created_at DESC`,
      [affiliate.id]
    );
    return res.json({
      success: true,
      referrals: rows.map((r) => ({ ...r, totalRevenue: Number(r.totalRevenue), totalCommission: Number(r.totalCommission) })),
    });
  } catch (err) {
    console.error("GET /affiliate/me/referrals error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// This affiliate's commission ledger, paginated.
router.get("/affiliate/me/commissions", requireEligibleTenant, async (req, res) => {
  try {
    const agencyId = req.tenant?.agencyId || req.user?.agencyId;
    if (!agencyId) {
      return res.status(400).json({ success: false, message: "Workspace required" });
    }
    const affiliate = await getOrCreateAffiliate(agencyId);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM affiliate_commissions WHERE affiliate_id = ?", [affiliate.id]);
    const [rows] = await pool.query(
      `SELECT ac.*, a.name AS referredAgencyName
       FROM affiliate_commissions ac
       JOIN agencies a ON a.id = ac.referred_agency_id
       WHERE ac.affiliate_id = ?
       ORDER BY ac.created_at DESC
       LIMIT ? OFFSET ?`,
      [affiliate.id, limit, offset]
    );
    return res.json({ success: true, commissions: rows, pagination: { page, limit, total } });
  } catch (err) {
    console.error("GET /affiliate/me/commissions error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── Admin-side (Super Admin only) ─────────────────────────────────────────
router.use("/admin/affiliates", authMiddleware, roleMiddleware("ADMIN"));

router.get("/admin/affiliates", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         af.id, af.code, af.status, af.commission_rate, af.created_at,
         ag.id AS agencyId, ag.name AS agencyName, ag.account_type AS agencyAccountType,
         (SELECT COUNT(*) FROM agencies r WHERE r.affiliate_id = af.id) AS referredCount,
         COALESCE((SELECT SUM(revenue_amount) FROM affiliate_commissions ac WHERE ac.affiliate_id = af.id), 0) AS totalRevenue,
         COALESCE((SELECT SUM(commission_amount) FROM affiliate_commissions ac WHERE ac.affiliate_id = af.id AND ac.status != 'VOID'), 0) AS totalCommission,
         COALESCE((SELECT SUM(commission_amount) FROM affiliate_commissions ac WHERE ac.affiliate_id = af.id AND ac.status = 'PENDING'), 0) AS pendingBalance,
         COALESCE((SELECT SUM(commission_amount) FROM affiliate_commissions ac WHERE ac.affiliate_id = af.id AND ac.status = 'PAID'), 0) AS paidTotal
       FROM affiliates af
       JOIN agencies ag ON ag.id = af.agency_id
       ORDER BY af.created_at DESC`
    );
    const affiliates = rows.map((r) => ({
      ...r,
      commission_rate: Number(r.commission_rate),
      totalRevenue: Number(r.totalRevenue),
      totalCommission: Number(r.totalCommission),
      pendingBalance: Number(r.pendingBalance),
      paidTotal: Number(r.paidTotal),
    }));
    return res.json({ success: true, affiliates });
  } catch (err) {
    console.error("GET /admin/affiliates error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/admin/affiliates/:id", async (req, res) => {
  try {
    const [[affiliate]] = await pool.query(
      `SELECT af.*, ag.name AS agencyName, ag.account_type AS agencyAccountType
       FROM affiliates af JOIN agencies ag ON ag.id = af.agency_id WHERE af.id = ?`,
      [req.params.id]
    );
    if (!affiliate) return res.status(404).json({ success: false, message: "Affiliate not found" });

    const stats = await getAffiliateStats(affiliate.id);
    const [referrals] = await pool.query(
      `SELECT
         a.id, a.name, a.account_type, a.is_active, a.created_at,
         COALESCE(SUM(ac.revenue_amount), 0) AS totalRevenue,
         COALESCE(SUM(CASE WHEN ac.status != 'VOID' THEN ac.commission_amount ELSE 0 END), 0) AS totalCommission
       FROM agencies a
       LEFT JOIN affiliate_commissions ac ON ac.referred_agency_id = a.id
       WHERE a.affiliate_id = ?
       GROUP BY a.id, a.name, a.account_type, a.is_active, a.created_at
       ORDER BY a.created_at DESC`,
      [affiliate.id]
    );
    const [commissions] = await pool.query(
      `SELECT ac.*, a.name AS referredAgencyName
       FROM affiliate_commissions ac JOIN agencies a ON a.id = ac.referred_agency_id
       WHERE ac.affiliate_id = ? ORDER BY ac.created_at DESC LIMIT 200`,
      [affiliate.id]
    );
    const [payouts] = await pool.query("SELECT * FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY created_at DESC", [affiliate.id]);

    return res.json({
      success: true,
      affiliate: { ...affiliate, commission_rate: Number(affiliate.commission_rate) },
      stats,
      referrals: referrals.map((r) => ({ ...r, totalRevenue: Number(r.totalRevenue), totalCommission: Number(r.totalCommission) })),
      commissions,
      payouts,
    });
  } catch (err) {
    console.error("GET /admin/affiliates/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update commission rate for an affiliate
router.patch("/admin/affiliates/:id/commission-rate", async (req, res) => {
  try {
    const rate = parseFloat(req.body.commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ success: false, message: "Commission rate must be between 0 and 100%" });
    }
    await pool.query("UPDATE affiliates SET commission_rate = ? WHERE id = ?", [rate, req.params.id]);
    return res.json({ success: true, commissionRate: rate });
  } catch (err) {
    console.error("PATCH /admin/affiliates/:id/commission-rate error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/affiliates/:id/suspend", async (req, res) => {
  try {
    await pool.query("UPDATE affiliates SET status = 'SUSPENDED' WHERE id = ?", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/affiliates/:id/suspend error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/affiliates/:id/reactivate", async (req, res) => {
  try {
    await pool.query("UPDATE affiliates SET status = 'ACTIVE' WHERE id = ?", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/affiliates/:id/reactivate error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Records a manual payout for a batch of this affiliate's PENDING commissions.
router.post("/admin/affiliates/:id/payouts", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const affiliateId = req.params.id;
    const { commissionIds, note } = req.body || {};
    if (!Array.isArray(commissionIds) || !commissionIds.length) {
      return res.status(400).json({ success: false, message: "commissionIds is required" });
    }

    await conn.beginTransaction();

    const [commissions] = await conn.query(
      `SELECT * FROM affiliate_commissions WHERE affiliate_id = ? AND status = 'PENDING' AND id IN (?)`,
      [affiliateId, commissionIds]
    );
    if (!commissions.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "No pending commissions matched" });
    }

    const currency = commissions[0].currency;
    const total = commissions.reduce((sum, c) => sum + Number(c.commission_amount), 0);

    const [payoutResult] = await conn.query(
      "INSERT INTO affiliate_payouts (affiliate_id, amount, currency, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [affiliateId, total, currency, note || null, req.user?.id || null]
    );

    await conn.query(
      `UPDATE affiliate_commissions SET status = 'PAID', payout_id = ? WHERE id IN (?)`,
      [payoutResult.insertId, commissions.map((c) => c.id)]
    );

    await conn.commit();
    return res.json({ success: true, payoutId: payoutResult.insertId, amount: total, currency, commissionsPaid: commissions.length });
  } catch (err) {
    await conn.rollback();
    console.error("POST /admin/affiliates/:id/payouts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

router.get("/admin/affiliates/:id/payouts", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY created_at DESC", [req.params.id]);
    return res.json({ success: true, payouts: rows });
  } catch (err) {
    console.error("GET /admin/affiliates/:id/payouts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Manual correction for the rare case a referred invoice gets refunded —
// there is no automatic refund->void hook yet (see migrate_affiliate_system.js).
router.post("/admin/affiliates/:affiliateId/commissions/:commissionId/void", async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE affiliate_commissions SET status = 'VOID' WHERE id = ? AND affiliate_id = ? AND status = 'PENDING'",
      [req.params.commissionId, req.params.affiliateId]
    );
    if (!result.affectedRows) {
      return res.status(400).json({ success: false, message: "Only a PENDING commission can be voided" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/affiliates/:affiliateId/commissions/:commissionId/void error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
