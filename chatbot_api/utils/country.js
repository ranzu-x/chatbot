/**
 * Country resolution for earnings reports (Top Earning Countries on the
 * Super Admin dashboard). Each paid invoice stores a 2-letter ISO country in
 * invoices.country, decided once when the payment is recorded:
 *   1. the billing / card country the payment gateway reports, else
 *   2. the country of the paying account owner's phone number (+880 → BD).
 * Nothing is guessed beyond that: a number without a country code, or a
 * gateway value we can't recognise, leaves the country NULL ("Unknown").
 */
import pool from "../db.js";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

// Valid ISO 3166-1 alpha-2 codes, derived from the runtime's own region data
// (Intl returns the code itself for anything it doesn't know).
const NAME_TO_CODE = new Map();
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    let name;
    try { name = regionNames.of(code); } catch { continue; }
    if (name && name !== code) NAME_TO_CODE.set(name.toLowerCase(), code);
  }
}
const VALID_CODES = new Set(NAME_TO_CODE.values());

/** "bd" / "BD" / "Bangladesh" → "BD"; anything unrecognised → null. */
export function normalizeCountry(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (s.length === 2 && VALID_CODES.has(s.toUpperCase())) return s.toUpperCase();
  return NAME_TO_CODE.get(s.toLowerCase()) || null;
}

/** Country of an international phone number, or null. Stored numbers are
 * usually digits-only with the country code (WhatsApp style), so a missing
 * "+" is added — a local number without a country code simply won't parse. */
export function countryFromPhone(phone) {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (!raw.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  return parsed?.country || null;
}

/** The country to store on an invoice: the gateway's, else the paying
 * account owner's phone country (workspace owner, else the user). */
export async function resolveInvoiceCountry({ gatewayCountry, agencyId, userId }) {
  const fromGateway = normalizeCountry(gatewayCountry);
  if (fromGateway) return fromGateway;
  try {
    const [[row]] = await pool.query(
      `SELECT COALESCE(owner.phone, u.phone) AS phone
       FROM (SELECT 1) x
       LEFT JOIN agencies a ON a.id = ?
       LEFT JOIN users owner ON owner.id = a.owner_id
       LEFT JOIN users u ON u.id = ?`,
      [agencyId || 0, userId || 0]
    );
    return countryFromPhone(row?.phone);
  } catch {
    return null;
  }
}
