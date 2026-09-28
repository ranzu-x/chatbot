/**
 * The package a workspace falls back to when nothing else is assigned.
 *
 * `packages.is_default` = the default package of its type (Packages &
 * Modules keeps one per type). A self-signup on the platform's own domain is
 * an End User, so it starts on the default END_USER package — the "basic
 * free" plan. A Reseller account without a package falls back to the default
 * AGENCY package. Cheapest wins if the data ever holds several defaults.
 */
import pool from "../db.js";

export async function getDefaultPackage(type = "END_USER") {
  const [[pkg]] = await pool.query(
    `SELECT * FROM packages WHERE type = ? AND is_active = 1
     ORDER BY is_default DESC, price ASC, id ASC LIMIT 1`,
    [type]
  );
  return pkg || null;
}

/** Default package for a workspace of this account type (DIRECT_CUSTOMER → END_USER, RESELLER → AGENCY). */
export function defaultPackageForAccountType(accountType) {
  return getDefaultPackage(accountType === "RESELLER" ? "AGENCY" : "END_USER");
}
