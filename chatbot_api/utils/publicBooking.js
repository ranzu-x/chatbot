/**
 * The public booking portal (/book/:agencyId?k=<key>, PublicBookingPage.jsx).
 *
 * Workspace ids are small sequential numbers, so a portal addressed by id
 * alone let anyone list every workspace's services and prices and file
 * bookings into any of them. Each workspace now has an unguessable booking
 * key (derived from the id under a server key — nothing stored); the public
 * endpoints need it, unless the caller is signed in to that same workspace
 * (the dashboard uses the same slot endpoints).
 */
import crypto from "crypto";

const serverKey = () => process.env.WEBHOOK_SECRET_KEY || process.env.JWT_SECRET;

export function bookingKey(agencyId) {
  return crypto.createHmac("sha256", serverKey()).update(`public-booking:${Number(agencyId)}`).digest("base64url").slice(0, 22);
}

export function bookingUrl(agencyId) {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/book/${Number(agencyId)}?k=${bookingKey(agencyId)}`;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** True if this request may use workspace `agencyId`'s public booking endpoints. */
export function canUsePublicBooking(req, agencyId) {
  if (!agencyId) return false;
  if (req.tenant?.agencyId && Number(req.tenant.agencyId) === Number(agencyId)) return true;
  const key = req.query?.k || req.body?.booking_key || req.get?.("X-Booking-Key");
  return safeEqual(key, bookingKey(agencyId));
}
