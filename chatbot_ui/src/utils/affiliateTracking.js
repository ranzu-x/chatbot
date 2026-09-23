/**
 * Affiliate referral capture — Super Admin's affiliate program (see
 * services/affiliateAPI in services/api.js, chatbot_api/routes/affiliate.js).
 *
 * A referral link looks like `/pricing?ref=CODE`. Whoever lands on it may
 * browse a few pages before actually buying (Pricing -> Guest Checkout),
 * so the code is captured once, here, and read back at checkout time
 * rather than threaded through routing state.
 */
const STORAGE_KEY = "chatbot_aff_ref";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Call once, near the app root, on every page load. */
export function captureAffiliateRef() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (!code) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: code.trim(), capturedAt: Date.now() }));
  } catch {
    // localStorage unavailable (private mode, etc.) — referral simply isn't tracked.
  }
}

/** Returns the stored referral code, or null if none / expired. */
export function getStoredAffiliateCode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { code, capturedAt } = JSON.parse(raw);
    if (!code || Date.now() - capturedAt > EXPIRY_MS) return null;
    return code;
  } catch {
    return null;
  }
}
