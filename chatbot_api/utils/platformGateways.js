/**
 * Shared helpers for reading the Super Admin's own platform-level payment
 * gateway credentials (platform_payment_gateways) and the admin-editable
 * USD->BDT conversion rate (platform_settings' usd_to_bdt_rate key) — used
 * by the guest-checkout flow (routes/billing.js) and every gateway adapter
 * (services/sslcommerzService.js, aamarpayService.js, portwalletService.js).
 */
import pool from "../db.js";
import { decryptSecret } from "./cryptoVault.js";

export async function getPlatformGatewayCredentials(provider) {
  const [[row]] = await pool.query(
    `SELECT credentials, mode FROM platform_payment_gateways WHERE provider = ? AND is_active = 1 LIMIT 1`,
    [String(provider).toUpperCase()]
  );
  if (!row) return null;
  return { ...JSON.parse(decryptSecret(row.credentials)), mode: row.mode };
}

export async function getUsdToBdtRate() {
  const [[row]] = await pool.query(
    `SELECT value FROM platform_settings WHERE setting_key = 'usd_to_bdt_rate' LIMIT 1`
  );
  if (!row) return 122.5; // fallback if the settings row was ever deleted
  const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  return Number(parsed?.rate) || 122.5;
}

export async function convertUsdToBdt(usdAmount) {
  const rate = await getUsdToBdtRate();
  return Math.round(Number(usdAmount) * rate);
}
