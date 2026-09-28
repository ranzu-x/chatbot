import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPoll } from "../utils/telegramPolls.js";
import { parseTelegramChatId } from "../utils/platformSender.js";

test("cleanPoll trims, drops empty options and enforces Telegram's limits", () => {
  const poll = cleanPoll({ question: "  Pick one ", options: ["A", " ", "B", ...Array.from({ length: 20 }, (_, i) => `x${i}`)], allowMultiple: 1 });
  assert.equal(poll.question, "Pick one");
  assert.equal(poll.options.length, 12);
  assert.deepEqual(poll.options.slice(0, 2), ["A", "B"]);
  assert.equal(poll.allowMultiple, true);
  assert.throws(() => cleanPoll({ question: "Q", options: ["only one"] }), /at least 2/);
  assert.throws(() => cleanPoll({ question: "", options: ["a", "b"] }), /question/);
});

test("Telegram Business chat ids are split into connection + chat", () => {
  assert.deepEqual(parseTelegramChatId("bc:AbC-123:987"), { businessConnectionId: "AbC-123", chatId: "987" });
  assert.deepEqual(parseTelegramChatId("987"), { businessConnectionId: null, chatId: "987" });
});
