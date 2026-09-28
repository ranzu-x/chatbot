import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarketingMessage, buildOptInRequest, describeMarketingMessage } from "../utils/messengerMarketing.js";

test("text, button and card messages follow Meta's templates", () => {
  assert.deepEqual(buildMarketingMessage({ type: "text", text: "Sale today" }), { text: "Sale today" });
  const btn = buildMarketingMessage({ type: "button", text: "Hi", buttons: [{ type: "web_url", title: "Shop", url: "https://x.com" }, { type: "postback", title: "Talk" }] });
  assert.equal(btn.attachment.payload.template_type, "button");
  assert.deepEqual(btn.attachment.payload.buttons[1], { type: "postback", title: "Talk", payload: "Talk" });
  const card = buildMarketingMessage({ type: "generic", title: "New in", imageUrl: "https://x.com/a.jpg", linkUrl: "https://x.com" });
  assert.equal(card.attachment.payload.elements[0].image_url, "https://x.com/a.jpg");
  assert.equal(card.attachment.payload.elements[0].default_action.type, "web_url");
  assert.equal(describeMarketingMessage({ type: "generic", title: "A", subtitle: "B" }), "A — B");
});

test("invalid content is refused before anything is sent", () => {
  assert.throws(() => buildMarketingMessage({ type: "text", text: "x".repeat(641) }), /640/);
  assert.throws(() => buildMarketingMessage({ type: "button", text: "Hi", buttons: [] }), /at least one button/);
  assert.throws(() => buildMarketingMessage({ type: "button", text: "Hi", buttons: [{ type: "web_url", title: "A", url: "http://insecure" }] }), /https/);
  assert.throws(() => buildMarketingMessage({ type: "generic", title: "" }), /title/);
});

test("opt-in request uses the notification_messages template", () => {
  const m = buildOptInRequest({ title: "Get offers", imageUrl: "https://x.com/i.png", timezone: "UTC" });
  assert.equal(m.attachment.payload.template_type, "notification_messages");
  assert.equal(m.attachment.payload.title, "Get offers");
  assert.equal(m.attachment.payload.notification_messages_timezone, "UTC");
  assert.throws(() => buildOptInRequest({ title: "" }), /title/);
});
