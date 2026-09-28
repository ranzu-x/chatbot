import { test } from "node:test";
import assert from "node:assert/strict";
import { wantsHandoff, HANDOFF_MARKER } from "../utils/aiReplyEngine.js";

test("the handoff marker is recognised only as a short marker reply", () => {
  assert.equal(wantsHandoff(HANDOFF_MARKER), true);
  assert.equal(wantsHandoff(`  ${HANDOFF_MARKER}\n`), true);
  assert.equal(wantsHandoff("Our shop opens at 9."), false);
  assert.equal(wantsHandoff(`${"Long answer. ".repeat(30)}${HANDOFF_MARKER}`), false);
});
