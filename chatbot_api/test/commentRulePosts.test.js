import test from "node:test";
import assert from "node:assert/strict";
import { samePost, findRuleForPost } from "../utils/commentRulePosts.js";

test("samePost matches Meta's two Facebook post-id forms, and only loosely when asked", () => {
  assert.equal(samePost("111_222", "111_222"), true);
  assert.equal(samePost("111_222", "222"), true);
  assert.equal(samePost("222", "111_222"), true);
  assert.equal(samePost("111_222", "333"), false);
  assert.equal(samePost("17991748539018651", "1799174853"), false);
  assert.equal(samePost("17991748539018651", "1799174853", { loose: true }), true);
  assert.equal(samePost(null, "1"), false);
});

test("findRuleForPost: a shared campaign is found from any of its posts; page-wide campaigns are skipped", () => {
  const rules = [
    { id: 1, post_id: "ALL_POSTS" },
    { id: 2, post_id: "p_a" },
    { id: 3, post_id: "p_c" },
  ];
  const links = new Map([
    [2, [{ post_id: "page_a" }, { post_id: "page_b" }]],
    [3, [{ post_id: "page_c" }]],
  ]);
  assert.equal(findRuleForPost(rules, links, "page_a").id, 2);
  assert.equal(findRuleForPost(rules, links, "b").id, 2);
  assert.equal(findRuleForPost(rules, links, "page_c").id, 3);
  assert.equal(findRuleForPost(rules, links, "page_z"), null);
});

test("findRuleForPost: a campaign removed from every post runs on none (its old post_id no longer counts)", () => {
  const rules = [{ id: 2, post_id: "page_a" }];
  assert.equal(findRuleForPost(rules, new Map(), "page_a"), null);
});

test("findRuleForPost never returns a saved (reusable) campaign, even if it had a link", async () => {
  const { SAVED_CAMPAIGN } = await import("../utils/commentRulePosts.js");
  const rules = [{ id: 9, post_id: SAVED_CAMPAIGN }];
  assert.equal(findRuleForPost(rules, new Map([[9, [{ post_id: "page_a" }]]]), "page_a"), null);
});
