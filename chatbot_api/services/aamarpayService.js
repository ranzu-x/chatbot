/**
 * AamarPay gateway adapter — a hosted-checkout-redirect gateway (BDT).
 * Same common interface as sslcommerzService.js/portwalletService.js.
 *
 * TODO: confirm against real AamarPay merchant-panel docs before going
 * live — this session has no live docs/sandbox access. Specifically confirm:
 *   1. The request-init endpoint URL (sandbox vs live host) below.
 *   2. Every required field name.
 *   3. The trxcheck verification API's exact response shape — verifyCallback
 *      re-validates against that API rather than trusting the raw callback
 *      body, since AamarPay's own callback POST is not itself signed.
 */
import axios from "axios";
import { getPlatformGatewayCredentials } from "../utils/platformGateways.js";

function endpoints(mode) {
  return mode === "test"
    ? {
        init: "https://sandbox.aamarpay.com/request.php",
        verify: "https://sandbox.aamarpay.com/api/v1/trxcheck/request.php",
      }
    : {
        init: "https://secure.aamarpay.com/request.php", // TODO: confirm live host
        verify: "https://secure.aamarpay.com/api/v1/trxcheck/request.php", // TODO: confirm live host
      };
}

export async function initiatePayment({ amount, currency, transactionId, successUrl, failUrl, cancelUrl, customer }) {
  const creds = await getPlatformGatewayCredentials("AAMARPAY");
  if (!creds) {
    const err = new Error("AamarPay is not configured yet. An admin needs to add credentials under Payment Gateways.");
    err.status = 400;
    throw err;
  }

  const { init } = endpoints(creds.mode);

  const form = {
    store_id: creds.storeId,
    signature_key: creds.signatureKey,
    cus_name: customer?.name || "Customer",
    cus_email: customer?.email || "customer@example.com",
    cus_phone: customer?.phone || "N/A",
    cus_add1: customer?.address || "N/A",
    cus_city: customer?.city || "Dhaka",
    cus_country: customer?.country || "Bangladesh",
    amount,
    currency: currency || "BDT",
    tran_id: transactionId,
    success_url: successUrl,
    fail_url: failUrl,
    cancel_url: cancelUrl,
    desc: "Subscription Package",
    type: "json", // returns { payment_url } instead of an auto-redirecting HTML page
  };

  const res = await axios.post(init, new URLSearchParams(form).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const paymentUrl = res.data?.payment_url;
  if (!paymentUrl) {
    const err = new Error(res.data?.msg || "AamarPay session initiation failed");
    err.status = 502;
    throw err;
  }

  return { redirectUrl: paymentUrl };
}

export async function verifyCallback(payload) {
  const creds = await getPlatformGatewayCredentials("AAMARPAY");
  if (!creds) return { success: false, transactionId: payload?.tran_id || payload?.mer_txnid, raw: payload };

  const { verify } = endpoints(creds.mode);
  const transactionId = payload?.tran_id || payload?.mer_txnid;
  if (!transactionId) return { success: false, transactionId: null, raw: payload };

  const res = await axios.get(verify, {
    params: {
      request_id: transactionId,
      store_id: creds.storeId,
      signature_key: creds.signatureKey,
      type: "json",
    },
  });

  const data = res.data;
  const success = String(data?.pay_status || "").toLowerCase() === "successful";

  return {
    success,
    transactionId,
    amountPaid: Number(data?.amount || payload?.amount || 0),
    currency: data?.currency || "BDT",
    raw: data,
  };
}
