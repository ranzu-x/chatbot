/**
 * SSLCommerz gateway adapter — a hosted-checkout-redirect gateway (BDT).
 *
 * Common adapter interface shared with aamarpayService.js/portwalletService.js:
 *   initiatePayment({ amount, currency, transactionId, successUrl, failUrl,
 *                      cancelUrl, customer }) -> { redirectUrl }
 *   verifyCallback(payload) -> { success, transactionId, amountPaid, currency, raw }
 *
 * TODO: confirm against real SSLCommerz merchant-panel docs before going
 * live — this session has no live docs/sandbox access. Specifically confirm:
 *   1. The session-init endpoint URL (sandbox vs live host) below.
 *   2. Every required field name SSLCommerz's API actually rejects requests
 *      without (their session API is known to require product/shipping
 *      fields even for a non-physical-goods subscription checkout).
 *   3. The IPN payload shape and the Order Validation API's exact response
 *      shape (val_id lookup) — verifyCallback here re-validates against
 *      that API rather than trusting the raw POST body, per SSLCommerz's
 *      own guidance, but the response field names should be checked.
 */
import axios from "axios";
import { getPlatformGatewayCredentials } from "../utils/platformGateways.js";

function endpoints(mode) {
  return mode === "test"
    ? {
        init: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        validate: "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php",
      }
    : {
        init: "https://securepay.sslcommerz.com/gwprocess/v4/api.php", // TODO: confirm live host
        validate: "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php", // TODO: confirm live host
      };
}

export async function initiatePayment({ amount, currency, transactionId, successUrl, failUrl, cancelUrl, ipnUrl, customer }) {
  const creds = await getPlatformGatewayCredentials("SSLCOMMERZ");
  if (!creds) {
    const err = new Error("SSLCommerz is not configured yet. An admin needs to add credentials under Payment Gateways.");
    err.status = 400;
    throw err;
  }

  const { init } = endpoints(creds.mode);

  const form = {
    store_id: creds.storeId,
    store_passwd: creds.storePassword,
    total_amount: amount,
    currency: currency || "BDT",
    tran_id: transactionId,
    success_url: successUrl,
    fail_url: failUrl,
    cancel_url: cancelUrl,
    ipn_url: ipnUrl,
    // Required customer/shipping fields — TODO: confirm exactly which are
    // mandatory vs optional against the real API; filled with sane
    // best-effort defaults for a digital subscription (no physical
    // shipment) in the meantime.
    cus_name: customer?.name || "Customer",
    cus_email: customer?.email || "customer@example.com",
    cus_add1: customer?.address || "N/A",
    cus_city: customer?.city || "Dhaka",
    cus_postcode: customer?.postcode || "1000",
    cus_country: customer?.country || "Bangladesh",
    cus_phone: customer?.phone || "N/A",
    shipping_method: "NO",
    product_name: "Subscription Package",
    product_category: "Software",
    product_profile: "non-physical-goods",
  };

  const res = await axios.post(init, new URLSearchParams(form).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (res.data?.status !== "SUCCESS" || !res.data?.GatewayPageURL) {
    const err = new Error(res.data?.failedreason || "SSLCommerz session initiation failed");
    err.status = 502;
    throw err;
  }

  return { redirectUrl: res.data.GatewayPageURL };
}

export async function verifyCallback(payload) {
  const creds = await getPlatformGatewayCredentials("SSLCOMMERZ");
  if (!creds) return { success: false, transactionId: payload?.tran_id, raw: payload };

  const { validate } = endpoints(creds.mode);
  const valId = payload?.val_id;
  if (!valId) return { success: false, transactionId: payload?.tran_id, raw: payload };

  const res = await axios.get(validate, {
    params: {
      val_id: valId,
      store_id: creds.storeId,
      store_passwd: creds.storePassword,
      format: "json",
    },
  });

  const data = res.data;
  const success = data?.status === "VALID" || data?.status === "VALIDATED";

  return {
    success,
    transactionId: data?.tran_id || payload?.tran_id,
    amountPaid: Number(data?.amount || payload?.amount || 0),
    currency: data?.currency || "BDT",
    // The paying card's issuing country — the only real country SSLCommerz
    // reports (cus_country is just what we sent at checkout).
    country: data?.card_issuer_country_code || null,
    raw: data,
  };
}
