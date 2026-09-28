import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMetaRequest, isProfilePayload } from "../utils/messengerProfile.js";

const base = { getStartedEnabled: false, getStartedAction: null, greeting: "", iceBreakers: [], persistentMenu: [], composerInputDisabled: false };

test("empty profile deletes every field (Messenger)", () => {
  const { set, del } = buildMetaRequest(base, "FACEBOOK");
  assert.deepEqual(set, {});
  assert.deepEqual(del.sort(), ["get_started", "greeting", "ice_breakers", "persistent_menu"]);
});

test("a Messenger menu always brings a Get Started button", () => {
  const profile = { ...base, persistentMenu: [{ title: "Shop", action: { type: "url", url: "https://x.test" } }, { title: "Help", action: { type: "flow", flowId: 3 } }] };
  const { set } = buildMetaRequest(profile, "FACEBOOK");
  assert.deepEqual(set.get_started, { payload: "MPA:GS" });
  assert.deepEqual(set.persistent_menu[0].call_to_actions, [
    { type: "web_url", title: "Shop", url: "https://x.test", webview_height_ratio: "full" },
    { type: "postback", title: "Help", payload: "MPA:PM:1" },
  ]);
});

test("ice breakers use the locale format with our payloads", () => {
  const profile = { ...base, iceBreakers: [{ question: "Prices?", action: { type: "text", text: "..." } }, { question: "Hours?", action: { type: "flow", flowId: 1 } }] };
  const { set } = buildMetaRequest(profile, "FACEBOOK");
  assert.deepEqual(set.ice_breakers, [{ locale: "default", call_to_actions: [{ question: "Prices?", payload: "MPA:IB:0" }, { question: "Hours?", payload: "MPA:IB:1" }] }]);
});

test("Instagram never gets Get Started or a greeting", () => {
  const profile = { ...base, getStartedEnabled: true, greeting: "Hi", persistentMenu: [{ title: "Help", action: { type: "text", text: "x" } }] };
  const { set, del } = buildMetaRequest(profile, "INSTAGRAM");
  assert.equal(set.get_started, undefined);
  assert.equal(set.greeting, undefined);
  assert.ok(!del.includes("get_started") && !del.includes("greeting"));
  assert.ok(set.persistent_menu);
});

test("isProfilePayload", () => {
  assert.equal(isProfilePayload("MPA:IB:2"), true);
  assert.equal(isProfilePayload("FBTN:1:a:0"), false);
  assert.equal(isProfilePayload(null), false);
});

test("WhatsApp / Telegram text triggers", async () => {
  const { matchTextTrigger } = await import("../utils/messengerProfile.js");
  const profile = {
    getStartedEnabled: true, getStartedAction: { type: "flow", flowId: 7 },
    iceBreakers: [{ question: "Opening hours?", action: { type: "text", text: "9-5" } }],
    commands: [{ command: "price", description: "Prices", action: { type: "flow", flowId: 2 } }],
  };
  assert.deepEqual(matchTextTrigger(profile, "WHATSAPP", "opening HOURS?"), { type: "text", text: "9-5" });
  assert.deepEqual(matchTextTrigger(profile, "WHATSAPP", "/price for 2"), { type: "flow", flowId: 2 });
  assert.deepEqual(matchTextTrigger(profile, "TELEGRAM", "/price@MyBot"), { type: "flow", flowId: 2 });
  assert.deepEqual(matchTextTrigger(profile, "TELEGRAM", "/start"), { type: "flow", flowId: 7 });
  assert.equal(matchTextTrigger({ ...profile, getStartedEnabled: false }, "TELEGRAM", "/start"), null, "/start falls through to normal flows");
  assert.equal(matchTextTrigger(profile, "TELEGRAM", "Opening hours?"), null, "Telegram has no ice breakers");
  assert.equal(matchTextTrigger(profile, "WHATSAPP", "/unknown"), null);
  assert.equal(matchTextTrigger(profile, "WHATSAPP", "hello"), null);
});
