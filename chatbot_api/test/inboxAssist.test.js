import { test, after } from "node:test";
import assert from "node:assert/strict";
import { parseSuggestions } from "../utils/inboxAssist.js";

test("suggested replies: JSON object, bare array, fenced JSON", () => {
  assert.deepEqual(parseSuggestions('{"replies": ["One", "Two", "Three"]}'), ["One", "Two", "Three"]);
  assert.deepEqual(parseSuggestions('["A", "B"]'), ["A", "B"]);
  assert.deepEqual(parseSuggestions('Sure!\n```json\n{"replies": ["X", "Y", "Z", "W"]}\n```'), ["X", "Y", "Z"], "at most 3");
});

test("suggested replies: plain numbered / bulleted lines when the model ignores JSON", () => {
  assert.deepEqual(parseSuggestions('1. Hello there\n2) "Thanks for waiting"\n- Can I get your order number?'), ["Hello there", "Thanks for waiting", "Can I get your order number?"]);
});

test("suggested replies: empty or junk gives nothing", () => {
  assert.deepEqual(parseSuggestions(""), []);
  assert.deepEqual(parseSuggestions('{"replies": ["", "  "]}'), []);
});

after(() => setTimeout(() => process.exit(0), 50));
