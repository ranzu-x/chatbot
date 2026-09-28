import { test } from "node:test";
import assert from "node:assert/strict";
import { isTemplateStoppedError, templateStoppedMessage } from "../utils/broadcastRunner.js";

test("a paused / disabled template stops the campaign with a clear reason", () => {
  assert.equal(isTemplateStoppedError("(#132015) Template is Paused"), true);
  assert.equal(isTemplateStoppedError("[Code 132016] Template is disabled"), true);
  assert.equal(isTemplateStoppedError("(#131047) Re-engagement message"), false);
  assert.match(templateStoppedMessage("132015"), /paused/);
  assert.match(templateStoppedMessage("132016"), /disabled/);
});
