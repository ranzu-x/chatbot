import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_ACTIONS, BUTTON_QUICK_ACTIONS, ACTIONS_NODE_QUICK_ACTIONS, actionsForPlatform, defaultGraph,
  splitKeywords, matchQuickActionKeyword, normalizeFrequency, TRIGGER_FREQUENCIES,
} from "../utils/quickActions.js";

test("every channel with flows gets its actions; webchat has no (un)subscribe, TikTok none", () => {
  assert.deepEqual(actionsForPlatform("WHATSAPP"), ["NO_MATCH", "CHAT_HUMAN", "CHAT_ROBOT", "UNSUBSCRIBE", "RESUBSCRIBE"]);
  assert.deepEqual(actionsForPlatform("telegram"), actionsForPlatform("FACEBOOK"));
  assert.deepEqual(actionsForPlatform("WEBCHAT"), ["NO_MATCH", "CHAT_HUMAN", "CHAT_ROBOT"]);
  assert.deepEqual(actionsForPlatform("TIKTOK"), []);
});

test("default replies carry the opposite action, never for No match", () => {
  const opposite = { CHAT_HUMAN: "CHAT_ROBOT", CHAT_ROBOT: "CHAT_HUMAN", UNSUBSCRIBE: "RESUBSCRIBE", RESUBSCRIBE: "UNSUBSCRIBE" };
  for (const [key, other] of Object.entries(opposite)) {
    const { nodes, edges } = defaultGraph(key, "WHATSAPP");
    const text = nodes.find((n) => n.type === "text");
    assert.equal(text.data.buttons.length, 1, key);
    assert.equal(BUTTON_QUICK_ACTIONS[text.data.buttons[0].action], other, key);
    assert.ok(text.data.message.trim(), key);
    assert.deepEqual(edges.map((e) => [e.source, e.sourceHandle, e.target]), [["start_1", "next-step", "text_1"]]);
    assert.equal(nodes.find((n) => n.type === "start").data.quickAction, key);
  }
  assert.deepEqual(defaultGraph("NO_MATCH", "WHATSAPP").nodes[1].data.buttons, []);
  assert.equal(QUICK_ACTIONS.NO_MATCH.button, null);
});

test("a website chat's reply never offers an action the widget doesn't have", () => {
  assert.equal(defaultGraph("CHAT_HUMAN", "WEBCHAT").nodes[1].data.buttons[0].action, "chatRobot");
  assert.deepEqual(defaultGraph("UNSUBSCRIBE", "WEBCHAT").nodes[1].data.buttons, []);
});

test("button and Actions-element names map to the same four actions", () => {
  assert.deepEqual(Object.values(BUTTON_QUICK_ACTIONS).sort(), Object.values(ACTIONS_NODE_QUICK_ACTIONS).sort());
});

test("keywords: exact word (case / punctuation ignored), only for Chat with Human / Robot", () => {
  assert.deepEqual(splitKeywords("human, Agent\n human ,"), ["HUMAN", "AGENT"]);
  const rows = [
    { action_key: "CHAT_HUMAN", keywords: "HUMAN, TALK TO HUMAN" },
    { action_key: "CHAT_ROBOT", keywords: "BOT" },
    { action_key: "UNSUBSCRIBE", keywords: "STOP" },
  ];
  assert.equal(matchQuickActionKeyword(rows, "  Human! "), "CHAT_HUMAN");
  assert.equal(matchQuickActionKeyword(rows, "talk to human"), "CHAT_HUMAN");
  assert.equal(matchQuickActionKeyword(rows, "bot?"), "CHAT_ROBOT");
  assert.equal(matchQuickActionKeyword(rows, "I want a human"), null);
  assert.equal(matchQuickActionKeyword(rows, "stop"), null); // opt-out keywords handle that
});

test("No match frequency: four choices, only Every time is untracked; bad input is refused", () => {
  assert.deepEqual(Object.keys(TRIGGER_FREQUENCIES), ["EVERY_TIME", "DAILY", "WEEKLY", "MONTHLY"]);
  assert.equal(TRIGGER_FREQUENCIES.EVERY_TIME.interval, null);
  for (const k of ["DAILY", "WEEKLY", "MONTHLY"]) assert.match(TRIGGER_FREQUENCIES[k].interval, /^\d+ (DAY|MONTH)$/);
  assert.equal(normalizeFrequency("daily"), "DAILY");
  assert.equal(normalizeFrequency(" Weekly "), "WEEKLY");
  assert.equal(normalizeFrequency("hourly"), null);
  assert.equal(normalizeFrequency("1 DAY; DROP TABLE x"), null);
  assert.equal(normalizeFrequency(undefined), null);
});
