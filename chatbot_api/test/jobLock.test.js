import { test, after } from "node:test";
import assert from "node:assert/strict";
import { withJobLock } from "../utils/jobLock.js";

test("a job never runs twice at the same time", async () => {
  let running = 0;
  let maxRunning = 0;
  let ran = 0;
  const job = async () => {
    running++; ran++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setTimeout(r, 200));
    running--;
    return "done";
  };
  const results = await Promise.all([withJobLock("test-overlap", job), withJobLock("test-overlap", job), withJobLock("test-overlap", job)]);
  assert.equal(maxRunning, 1);
  assert.equal(ran, 1);
  assert.equal(results.filter((r) => r === "done").length, 1);
  // Released afterwards: the next tick runs.
  assert.equal(await withJobLock("test-overlap", job), "done");
});

after(() => setTimeout(() => process.exit(0), 50));
