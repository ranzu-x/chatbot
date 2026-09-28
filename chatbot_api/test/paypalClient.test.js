import { test } from "node:test";
import assert from "node:assert/strict";
import { paypalAmount, readCapture, paypalBase } from "../utils/paypalClient.js";

test("PayPal amounts and hosts", () => {
  assert.equal(paypalAmount(19, "USD"), "19.00");
  assert.equal(paypalAmount(1999.5, "JPY"), "2000");
  assert.equal(paypalBase("test"), "https://api-m.sandbox.paypal.com");
  assert.equal(paypalBase("live"), "https://api-m.paypal.com");
});

test("only a completed capture counts as paid", () => {
  const order = (status, capStatus) => ({ status, purchase_units: [{ custom_id: "rb:1:2:3", payments: { captures: [{ id: "C", status: capStatus, amount: { value: "9.50", currency_code: "EUR" } }] } }] });
  assert.deepEqual(readCapture(order("COMPLETED", "COMPLETED")), { paid: true, amount: 9.5, currency: "EUR", customId: "rb:1:2:3", captureId: "C" });
  assert.equal(readCapture(order("COMPLETED", "PENDING")).paid, false);
  assert.equal(readCapture(order("APPROVED", undefined)).paid, false);
});
