/**
 * Telegram Stars orders + Telegram Business connections against the real DB
 * (no Telegram calls succeed — a fake bot token is used; they're best-effort).
 * Creates a throw-away Telegram integration and removes everything afterwards.
 * Run: npm run test:telegram-stars
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import {
  createChatPaymentLink, checkStarsPreCheckout, handleStarsPayment, buildStarsInvoice, refundStarsOrder,
} from "../services/chatPaymentService.js";
import { upsertBusinessConnection, resolveBusinessMessage, businessExternalId } from "../utils/telegramBusiness.js";
import { parseTelegramChatId } from "../utils/platformSender.js";

const [[agency]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'DIRECT_CUSTOMER' ORDER BY id LIMIT 1");
assert.ok(agency, "needs at least one End User workspace");
const [ins] = await pool.query(
  "INSERT INTO integrations (agency_id, platform, name, access_token, is_active) VALUES (?, 'TELEGRAM', 'stars-test', '0:fake', 1)",
  [agency.id]
);
const integration = { id: ins.insertId, agency_id: agency.id, platform: "TELEGRAM", access_token: "0:fake" };
const orderIds = [];

try {
  // Order + invoice shape
  const order = await createChatPaymentLink({ agencyId: agency.id, integrationId: integration.id, productName: "Test pack", amount: 50.4, provider: "TELEGRAM_STARS", channel: "TELEGRAM" });
  orderIds.push(order.orderId);
  assert.equal(order.currency, "XTR");
  assert.equal(order.amount, 50);
  const [[row]] = await pool.query("SELECT * FROM chat_orders WHERE id = ?", [order.orderId]);
  const invoice = buildStarsInvoice(row);
  assert.deepEqual(invoice.prices, [{ label: "Test pack", amount: 50 }]);
  assert.equal(invoice.payload, `CO:${order.orderId}`);
  assert.equal(invoice.provider_token, undefined);

  // Pre-checkout: right amount ok, wrong amount / other workspace refused
  assert.equal((await checkStarsPreCheckout(integration, { invoice_payload: invoice.payload, currency: "XTR", total_amount: 50 })).ok, true);
  assert.equal((await checkStarsPreCheckout(integration, { invoice_payload: invoice.payload, currency: "XTR", total_amount: 49 })).ok, false);
  assert.equal((await checkStarsPreCheckout({ ...integration, agency_id: -1 }, { invoice_payload: invoice.payload, currency: "XTR", total_amount: 50 })).ok, false);

  // Payment → PAID once, charge id kept; a second report changes nothing
  const msg = { from: { id: 777 }, successful_payment: { currency: "XTR", total_amount: 50, invoice_payload: invoice.payload, telegram_payment_charge_id: "charge-1" } };
  const paid = await handleStarsPayment(integration, msg);
  assert.equal(paid.status, "PAID");
  await handleStarsPayment(integration, { ...msg, successful_payment: { ...msg.successful_payment, telegram_payment_charge_id: "charge-2" } });
  const [[after]] = await pool.query("SELECT status, telegram_charge_id, telegram_user_id FROM chat_orders WHERE id = ?", [order.orderId]);
  assert.equal(after.status, "PAID");
  assert.equal(after.telegram_charge_id, "charge-1");
  assert.equal(Number(after.telegram_user_id), 777);
  assert.equal((await checkStarsPreCheckout(integration, { invoice_payload: invoice.payload, currency: "XTR", total_amount: 50 })).ok, false, "a paid order can't be paid again");

  // Refund: another workspace can't; Telegram refuses the fake token → 502, order stays PAID
  assert.equal((await refundStarsOrder(-1, order.orderId)).status, 404);
  const refund = await refundStarsOrder(agency.id, order.orderId);
  assert.equal(refund.status, 502);

  // Business connections
  const connId = `test-conn-${Date.now()}`;
  await upsertBusinessConnection(integration, { id: connId, user: { id: 555, first_name: "Shop" }, user_chat_id: 555, date: 1700000000, rights: { can_reply: true }, is_enabled: true });
  assert.ok(await resolveBusinessMessage(integration, { business_connection_id: connId, from: { id: 999 } }), "a customer's message is handled");
  assert.equal(await resolveBusinessMessage(integration, { business_connection_id: connId, from: { id: 555 } }), null, "the owner's own message is skipped");
  await upsertBusinessConnection(integration, { id: connId, user: { id: 555, first_name: "Shop" }, date: 1700000000, rights: {}, is_enabled: false });
  assert.equal(await resolveBusinessMessage(integration, { business_connection_id: connId, from: { id: 999 } }), null, "a disconnected account is ignored");
  assert.deepEqual(parseTelegramChatId(businessExternalId(connId, "-42")), { businessConnectionId: connId, chatId: "-42" });
  assert.deepEqual(parseTelegramChatId("12345"), { businessConnectionId: null, chatId: "12345" });

  console.log("✅ Telegram Stars + Business: all checks passed");
} finally {
  if (orderIds.length) await pool.query("DELETE FROM chat_orders WHERE id IN (?)", [orderIds]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integration.id]); // cascades the connections
  await pool.end();
}
