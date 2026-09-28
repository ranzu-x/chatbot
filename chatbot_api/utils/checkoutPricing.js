import pool from "../db.js";

/**
 * What a package costs at checkout after discounts — one function for the
 * public checkout (guest), the dashboard checkout (any gateway) and the
 * quote the pricing / billing screens show, so they can never disagree.
 *
 * Decided with the user: package discounts and a user's discount/coupon ARE
 * applied at checkout. Rules:
 * 1. Automatic discount = the larger of
 *      - the package's own discount (packages.discount_*, only while active
 *        and inside its start/end window), and
 *      - the buyer's personal discount (users.discount_percent, set in the
 *        Super Admin user editor).
 *    They don't stack.
 * 2. A coupon (typed code, else the buyer's users.special_coupon) comes off
 *    what's left. Coupons live in `coupons` (Super Admin → Coupons).
 * All amounts are USD (package prices); BDT gateways convert afterwards.
 */

const round2 = (n) => Math.round(n * 100) / 100;

export function packageDiscountPercent(pkg, now = new Date()) {
  const pct = Number(pkg?.discount_percent) || 0;
  if (!pkg?.discount_is_active || pct <= 0) return 0;
  if (pkg.discount_starts_at && new Date(pkg.discount_starts_at) > now) return 0;
  if (pkg.discount_ends_at && new Date(pkg.discount_ends_at) < now) return 0;
  return Math.min(100, pct);
}

/** Checks a coupon code for this package / buyer. Returns { coupon } or { error }. */
export async function validateCoupon(code, { packageId, agencyId = null, email = null } = {}) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { coupon: null };
  const [[coupon]] = await pool.query("SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1", [clean]);
  if (!coupon || !coupon.is_active) return { error: "This coupon code isn't valid." };
  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return { error: "This coupon isn't active yet." };
  if (coupon.ends_at && new Date(coupon.ends_at) < now) return { error: "This coupon has expired." };
  let packageIds = coupon.package_ids;
  if (typeof packageIds === "string") { try { packageIds = JSON.parse(packageIds); } catch { packageIds = null; } }
  if (Array.isArray(packageIds) && packageIds.length && !packageIds.map(Number).includes(Number(packageId))) {
    return { error: "This coupon can't be used for this plan." };
  }
  if (coupon.max_redemptions) {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id = ?", [coupon.id]);
    if (n >= coupon.max_redemptions) return { error: "This coupon has been fully used." };
  }
  if (coupon.per_customer_limit && (agencyId || email)) {
    const [[{ n }]] = await pool.query(
      "SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id = ? AND ((? IS NOT NULL AND agency_id = ?) OR (? IS NOT NULL AND email = ?))",
      [coupon.id, agencyId, agencyId, email, email ? String(email).toLowerCase() : null]
    );
    if (n >= coupon.per_customer_limit) return { error: "You've already used this coupon." };
  }
  return { coupon };
}

/**
 * @returns {{ basePrice, finalPrice, discountAmount, lines: [{label, amount}], coupon, couponError, recurring }}
 *   recurring = true when the discount should repeat on every renewal
 *   (personal discount, or a FOREVER coupon) — Stripe coupon duration.
 */
export async function priceForCheckout({ pkg, userId = null, agencyId = null, email = null, couponCode = null }) {
  const basePrice = round2(Number(pkg.price) || 0);
  const lines = [];
  let price = basePrice;
  let recurring = false;

  let user = null;
  if (userId) {
    const [[row]] = await pool.query("SELECT discount_percent, special_coupon, email FROM users WHERE id = ?", [userId]);
    user = row || null;
  }
  const pkgPct = packageDiscountPercent(pkg);
  const userPct = Math.min(100, Number(user?.discount_percent) || 0);
  if (pkgPct > 0 || userPct > 0) {
    const usePersonal = userPct > pkgPct;
    const pct = usePersonal ? userPct : pkgPct;
    const off = round2((price * pct) / 100);
    lines.push({ label: usePersonal ? `Your discount (${pct}%)` : `${pkg.discount_terms || "Plan discount"} (${pct}%)`, amount: -off });
    price = round2(price - off);
    if (usePersonal) recurring = true;
  }

  let coupon = null;
  let couponError = null;
  const code = couponCode || user?.special_coupon || null;
  if (code && price > 0) {
    const result = await validateCoupon(code, { packageId: pkg.id, agencyId, email: email || user?.email || null });
    if (result.error) {
      // A typed code that fails is shown to the buyer; a silently-applied special coupon that fails is ignored.
      if (couponCode) couponError = result.error;
    } else if (result.coupon) {
      coupon = result.coupon;
      const off = coupon.discount_type === "PERCENT"
        ? round2((price * Math.min(100, Number(coupon.amount))) / 100)
        : Math.min(price, round2(Number(coupon.amount)));
      lines.push({ label: `Coupon ${coupon.code}`, amount: -off });
      price = round2(price - off);
      if (coupon.duration === "FOREVER") recurring = true;
    }
  }

  const finalPrice = Math.max(0, price);
  return {
    basePrice,
    finalPrice,
    discountAmount: round2(basePrice - finalPrice),
    lines,
    coupon: coupon ? { id: coupon.id, code: coupon.code, duration: coupon.duration } : null,
    couponError,
    recurring,
  };
}

/** Called once a checkout that used a coupon is paid. */
export async function recordCouponRedemption({ couponId, agencyId = null, email = null, invoiceId = null, discountAmount = 0, currency = "USD" }) {
  if (!couponId) return;
  await pool.query(
    "INSERT INTO coupon_redemptions (coupon_id, agency_id, email, invoice_id, discount_amount, currency) VALUES (?, ?, ?, ?, ?, ?)",
    [couponId, agencyId, email ? String(email).toLowerCase() : null, invoiceId, discountAmount || 0, currency]
  );
}
