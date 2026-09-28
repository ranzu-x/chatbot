import axios from "axios";

/**
 * PayPal REST (Orders v2) with a reseller's own app credentials
 * (agency_payment_gateways, provider PAYPAL, mode test = sandbox).
 *   token:   POST /v1/oauth2/token (client credentials)
 *   create:  POST /v2/checkout/orders  intent CAPTURE → the customer approves at the "payer-action" link
 *   capture: POST /v2/checkout/orders/{id}/capture → COMPLETED
 */
export function paypalBase(mode) {
  return mode === "test" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

const tokenCache = new Map(); // clientId → { token, exp }

export async function paypalToken({ clientId, clientSecret, mode }) {
  const key = `${mode}:${clientId}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const res = await axios.post(`${paypalBase(mode)}/v1/oauth2/token`, "grant_type=client_credentials", {
    auth: { username: clientId, password: clientSecret },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.access_token) {
    throw Object.assign(new Error(res.data?.error_description || "PayPal refused the client id / secret"), { status: 400 });
  }
  tokenCache.set(key, { token: res.data.access_token, exp: Date.now() + (Number(res.data.expires_in) || 3000) * 1000 });
  return res.data.access_token;
}

async function call(creds, method, path, data, extraHeaders = {}) {
  const token = await paypalToken(creds);
  const res = await axios({
    method, url: `${paypalBase(creds.mode)}${path}`, data,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extraHeaders },
    timeout: 20000, validateStatus: () => true,
  });
  if (res.status >= 400) {
    const d = res.data || {};
    const detail = d.details?.[0]?.description || d.details?.[0]?.issue;
    throw Object.assign(new Error(`PayPal: ${detail || d.message || `HTTP ${res.status}`}`), { status: 502, paypalIssue: d.details?.[0]?.issue || d.name });
  }
  return res.data;
}

/** Amount string PayPal accepts: 2 decimals, none for zero-decimal currencies. */
export function paypalAmount(value, currency) {
  const zeroDecimal = new Set(["HUF", "JPY", "TWD"]);
  const n = Number(value) || 0;
  return zeroDecimal.has(String(currency).toUpperCase()) ? String(Math.round(n)) : n.toFixed(2);
}

export async function createOrder(creds, { amount, currency, description, customId, referenceId, returnUrl, cancelUrl, brandName, requestId }) {
  const order = await call(creds, "POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: String(referenceId).slice(0, 256),
      custom_id: String(customId).slice(0, 127),
      description: String(description || "").slice(0, 127) || undefined,
      amount: { currency_code: String(currency).toUpperCase(), value: paypalAmount(amount, currency) },
    }],
    payment_source: {
      paypal: {
        experience_context: {
          return_url: returnUrl, cancel_url: cancelUrl, user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING", ...(brandName ? { brand_name: String(brandName).slice(0, 127) } : {}),
        },
      },
    },
  }, requestId ? { "PayPal-Request-Id": requestId } : {});
  const approve = (order.links || []).find((l) => l.rel === "payer-action" || l.rel === "approve");
  return { id: order.id, approveUrl: approve?.href || null };
}

export function getOrder(creds, orderId) {
  return call(creds, "GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

/** Captures an approved order; an already-captured one is read back instead. */
export async function captureOrder(creds, orderId) {
  try {
    return await call(creds, "POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, { "PayPal-Request-Id": `capture-${orderId}` });
  } catch (err) {
    if (err.paypalIssue === "ORDER_ALREADY_CAPTURED") return getOrder(creds, orderId);
    throw err;
  }
}

/** { paid, amount, currency, customId, captureId } from a captured order. */
export function readCapture(order) {
  const unit = order?.purchase_units?.[0] || {};
  const capture = unit.payments?.captures?.[0];
  return {
    paid: order?.status === "COMPLETED" && capture?.status === "COMPLETED",
    amount: Number(capture?.amount?.value || unit.amount?.value || 0),
    currency: capture?.amount?.currency_code || unit.amount?.currency_code || null,
    customId: unit.custom_id || capture?.custom_id || null,
    captureId: capture?.id || null,
  };
}
