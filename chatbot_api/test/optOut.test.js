import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyKeyword, rowToSettings, splitKeywords, DEFAULTS } from "../utils/optOut.js";

test("defaults apply with no saved row", () => {
  const s = rowToSettings(null);
  assert.equal(classifyKeyword(s, "STOP"), "OUT");
  assert.equal(classifyKeyword(s, " stop! "), "OUT");
  assert.equal(classifyKeyword(s, "Unsubscribe."), "OUT");
  assert.equal(classifyKeyword(s, "start"), "IN");
  assert.deepEqual(s.optOutKeywords, DEFAULTS.optOutKeywords);
});

test("only the whole message counts", () => {
  const s = rowToSettings(null);
  assert.equal(classifyKeyword(s, "please stop sending"), null);
  assert.equal(classifyKeyword(s, "stop it"), null);
  assert.equal(classifyKeyword(s, ""), null);
});

test("custom words and switched off", () => {
  const s = rowToSettings({ enabled: 1, opt_out_keywords: "baas, stop", opt_in_keywords: "shuru", opt_out_reply: "", opt_in_reply: null });
  assert.equal(classifyKeyword(s, "BAAS"), "OUT");
  assert.equal(classifyKeyword(s, "shuru"), "IN");
  assert.equal(s.optOutReply, "", "an empty reply means no reply");
  assert.equal(s.optInReply, DEFAULTS.optInReply);
  assert.equal(classifyKeyword({ ...s, enabled: false }, "stop"), null);
  assert.deepEqual(splitKeywords("a, b\nc,,"), ["A", "B", "C"]);
});
