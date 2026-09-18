/**
 * PortWallet gateway adapter — a hosted-checkout-redirect gateway (BDT).
 * Same common interface as sslcommerzService.js/aamarpayService.js.
 *
 * UNCONFIRMED: unlike SSLCommerz/AamarPay, this session has no reliable
 * knowledge of PortWallet's real API endpoint URLs, required field names,
 * or callback/webhook signature scheme — every value below is a
 * placeholder shaped to match the same session-init + redirect + callback
 * pattern the other two gateways use, and MUST be corrected against
 * PortWallet's actual merchant-panel docs (or by asking their support for
 * API documentation) before this adapter can be used for a real payment.
 * Until then, calling initiatePayment() for PortWallet will very likely
 * fail against the real API — this is expected and intentional; it is not
 * wired to silently pretend to succeed.
 */
import axios from "axios";
import { getPlatformGatewayCredentials } from "../utils/platformGateways.js";

function endpoints(mode) {
  // TODO: confirm both hosts — these are placeholders, not verified.
  return mode === "test"
    ? { init: "https://sandbox.portwallet.com/api/v2/session", verify: "https://sandbox.portwallet.com/api/v2/verify" }
    : { init: "https://api.portwallet.com/api/v2/session", verify: "https://api.portwallet.com/api/v2/verify" };
}

export async function initiatePayment({ amount, currency, transactionId, successUrl, failUrl, cancelUrl, customer }) {
  const creds = await getPlatformGatewayCredentials("PORTWALLET");
  if (!creds) {
    const err = new Error("PortWallet is not configured yet. An admin needs to add credentials under Payment Gateways.");
    err.status = 400;
    throw err;
  }

  const { init } = endpoints(creds.mode);

  // TODO: confirm request shape (auth header vs body fields, exact field
  // names) against real PortWallet docs.
  const res = await axios.post(
    init,
    {
      merchant_id: creds.merchantId,
      amount,
      currency: currency || "BDT",
      order_id: transactionId,
      success_url: successUrl,
      fail_url: failUrl,
      cancel_url: cancelUrl,
      customer_name: customer?.name || "Customer",
      customer_email: customer?.email || "customer@example.com",
      customer_phone: customer?.phone || "N/A",
    },
    { headers: { Authorization: `Bearer ${creds.apiKey}`, "X-Api-Secret": creds.apiSecret } }
  );

  const redirectUrl = res.data?.checkout_url || res.data?.redirect_url;
  if (!redirectUrl) {
    const err = new Error(res.data?.message || "PortWallet session initiation failed");
    err.status = 502;
    throw err;
  }

  return { redirectUrl };
}

export async function verifyCallback(payload) {
  const creds = await getPlatformGatewayCredentials("PORTWALLET");
  if (!creds) return { success: false, transactionId: payload?.order_id, raw: payload };

  const { verify } = endpoints(creds.mode);
  const transactionId = payload?.order_id;
  if (!transactionId) return { success: false, transactionId: null, raw: payload };

  // TODO: confirm verification call shape against real PortWallet docs.
  const res = await axios.get(verify, {
    params: { order_id: transactionId, merchant_id: creds.merchantId },
    headers: { Authorization: `Bearer ${creds.apiKey}` },
  });

  const data = res.data;
  const success = String(data?.status || "").toLowerCase() === "success" || String(data?.status || "").toLowerCase() === "completed";

  return {
    success,
    transactionId,
    amountPaid: Number(data?.amount || payload?.amount || 0),
    currency: data?.currency || "BDT",
    raw: data,
  };
}
