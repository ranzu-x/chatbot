import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTikTokSend, parseTikTokEvent } from "../utils/tiktokBusiness.js";

const integration = { tiktok_open_id: "biz-1", access_token: "t" };

test("text and button messages use the documented send shape", () => {
  assert.deepEqual(buildTikTokSend(integration, "conv-9", { body: "Hi" }), {
    business_id: "biz-1", recipient_type: "CONVERSATION", recipient: "conv-9", message_type: "TEXT", text: { body: "Hi" },
  });
  const card = buildTikTokSend(integration, "conv-9", { body: "Pick", buttons: [{ title: "A", payload: "p1" }, { title: "Site", type: "URL", url: "https://x" }] });
  assert.equal(card.message_type, "TEMPLATE");
  assert.equal(card.template.type, "QA_BUTTON_CARD");
  assert.deepEqual(card.template.buttons, [{ type: "REPLY", title: "A", id: "p1" }]);
  assert.equal(buildTikTokSend(integration, "c", { senderAction: "TYPING" }).sender_action, "TYPING");
});

test("incoming events: content JSON string, conversation id as subscriber id, own messages skipped", () => {
  const evt = parseTikTokEvent({ user_openid: "biz-1", content: JSON.stringify({ conversation_id: "conv-9", message_id: "m1", type: "text", text: { body: "hello" }, from_user: { id: "u5", role: "PERSONAL_ACCOUNT" } }) });
  assert.equal(evt.externalId, "conv-9");
  assert.equal(evt.body, "hello");
  assert.equal(evt.senderId, "u5");
  assert.equal(parseTikTokEvent({ user_openid: "biz-1", content: JSON.stringify({ conversation_id: "c", from_user: { id: "biz-1" }, text: { body: "x" } }) }), null);
  assert.equal(parseTikTokEvent({ content: { conversation_id: "c", from_user: { role: "BUSINESS" }, text: "x" } }), null);
});
