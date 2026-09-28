import { test } from "node:test";
import assert from "node:assert/strict";
import { phonesMatch, orderBelongsToContact, renderOrderText, normalizeOrderNumber } from "../utils/orderLookup.js";

test("phone numbers match across local and international formats", () => {
  assert.equal(phonesMatch("+880 1712-345678", "01712345678"), true);
  assert.equal(phonesMatch("8801712345678", "+8801712345679"), false);
  assert.equal(phonesMatch("123", "123"), false);
});

test("an order is only the subscriber's own", () => {
  const order = { contact_id: null, customer_phone: "+1 (555) 010-0200", customer_email: "Ann@Shop.com" };
  assert.equal(orderBelongsToContact(order, { id: 1, platform: "WHATSAPP", external_id: "15550100200" }), true);
  assert.equal(orderBelongsToContact(order, { id: 1, platform: "TELEGRAM", external_id: "15550100200" }), false);
  assert.equal(orderBelongsToContact(order, { id: 1, email: "ann@shop.com" }), true);
  assert.equal(orderBelongsToContact(order, { id: 2, phone: "+15550100999", email: "bob@x.com" }), false);
  assert.equal(orderBelongsToContact({ contact_id: 7 }, { id: 7 }), true);
  // A Telegram / Messenger id is not a phone number.
  assert.equal(orderBelongsToContact({ customer_phone: "5550100200" }, { id: 3, external_id: "tg_user" }), false);
});

test("{{order.*}} placeholders", () => {
  assert.equal(renderOrderText("#{{order.order_number}} is {{ order.order_status }}{{order.nope}}", { order_number: "1001", order_status: "FULFILLED" }), "#1001 is FULFILLED");
  assert.equal(normalizeOrderNumber(" #1001 "), "1001");
});
