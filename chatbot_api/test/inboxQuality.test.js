import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRating, pickAgent } from "../utils/inboxQuality.js";

test("parseRating understands numbers, stars and x/5", () => {
  assert.equal(parseRating("5"), 5);
  assert.equal(parseRating(" 4/5 "), 4);
  assert.equal(parseRating("3 stars"), 3);
  assert.equal(parseRating("⭐⭐"), 2);
  assert.equal(parseRating("2."), 2);
  assert.equal(parseRating("6"), null);
  assert.equal(parseRating("0"), null);
  assert.equal(parseRating("my order 5"), null);
  assert.equal(parseRating(""), null);
});

test("round robin cycles through agents by profile id", () => {
  const agents = [{ profile_id: 3 }, { profile_id: 1 }, { profile_id: 7 }];
  assert.equal(pickAgent(agents, "ROUND_ROBIN", { lastProfileId: null }).profile_id, 1);
  assert.equal(pickAgent(agents, "ROUND_ROBIN", { lastProfileId: 1 }).profile_id, 3);
  assert.equal(pickAgent(agents, "ROUND_ROBIN", { lastProfileId: 7 }).profile_id, 1, "wraps around");
  assert.equal(pickAgent([], "ROUND_ROBIN"), null);
});

test("least busy picks the fewest open chats, ties by round robin", () => {
  const agents = [{ profile_id: 1 }, { profile_id: 2 }, { profile_id: 3 }];
  assert.equal(pickAgent(agents, "LEAST_BUSY", { openCounts: { 1: 4, 2: 1, 3: 5 } }).profile_id, 2);
  assert.equal(pickAgent(agents, "LEAST_BUSY", { openCounts: { 1: 2, 2: 2, 3: 2 }, lastProfileId: 1 }).profile_id, 2);
});
