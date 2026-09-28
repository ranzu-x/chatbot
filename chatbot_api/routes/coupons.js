/**
 * Coupons — Super Admin → Coupons. Codes customers type at checkout (public
 * pricing page and the dashboard's billing tab); a user's "special coupon"
 * (User Manager) names one of these codes and is applied automatically.
 * How a coupon combines with other discounts: utils/checkoutPricing.js.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use("/admin/coupons", authMiddleware, roleMiddleware("ADMIN"));

function cleanCoupon(body = {}) {
  const err = (message) => { const e = new Error(message); e.status = 400; throw e; };
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) err("Code: 3–64 letters, numbers, - or _");
  const discountType = body.discountType === "FIXED" ? "FIXED" : "PERCENT";
  const amount = Number(body.amount);
  if (!(amount > 0)) err("Enter a discount greater than 0");
  if (discountType === "PERCENT" && amount > 100) err("A percentage can't be more than 100");
  const toDate = (v) => (v ? new Date(v) : null);
  const startsAt = toDate(body.startsAt);
  const endsAt = toDate(body.endsAt);
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) err("Invalid date");
  if (startsAt && endsAt && endsAt <= startsAt) err("The end date must be after the start date");
  const intOrNull = (v) => (v === "" || v === null || v === undefined ? null : Math.max(1, Math.floor(Number(v)) || 1));
  const packageIds = Array.isArray(body.packageIds) ? body.packageIds.map(Number).filter(Boolean) : [];
  return {
    code,
    description: body.description ? String(body.description).slice(0, 255) : null,
    discount_type: discountType,
    amount,
    duration: body.duration === "FOREVER" ? "FOREVER" : "ONCE",
    package_ids: packageIds.length ? JSON.stringify(packageIds) : null,
    max_redemptions: intOrNull(body.maxRedemptions),
    per_customer_limit: intOrNull(body.perCustomerLimit),
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: body.isActive === false ? 0 : 1,
  };
}

router.get("/admin/coupons", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS redemptions,
              (SELECT COALESCE(SUM(r.discount_amount), 0) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS total_discount
         FROM coupons c ORDER BY c.created_at DESC`
    );
    return res.json({ success: true, coupons: rows });
  } catch (err) {
    console.error("List coupons error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/coupons", async (req, res) => {
  try {
    const c = cleanCoupon(req.body);
    const [r] = await pool.query("INSERT INTO coupons SET ?, created_by = ?", [c, req.user.id]);
    return res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "A coupon with this code already exists" });
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Create coupon error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/admin/coupons/:id", async (req, res) => {
  try {
    const c = cleanCoupon(req.body);
    const [r] = await pool.query("UPDATE coupons SET ? WHERE id = ?", [c, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Coupon not found" });
    return res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "A coupon with this code already exists" });
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Update coupon error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// A coupon that has been used is switched off instead of deleted — invoices point at it.
router.delete("/admin/coupons/:id", async (req, res) => {
  try {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id = ?", [req.params.id]);
    if (n > 0) {
      await pool.query("UPDATE coupons SET is_active = 0 WHERE id = ?", [req.params.id]);
      return res.json({ success: true, deactivated: true, message: "This coupon was already used, so it was switched off instead of deleted" });
    }
    const [r] = await pool.query("DELETE FROM coupons WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Coupon not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete coupon error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
