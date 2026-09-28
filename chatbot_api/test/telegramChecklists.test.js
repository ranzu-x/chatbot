import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanChecklist, checklistAsText } from "../utils/telegramChecklists.js";

test("checklist follows Telegram's limits and numbers the tasks", () => {
  const c = cleanChecklist({ title: " Setup ", tasks: ["A", " ", "B", ...Array.from({ length: 40 }, (_, i) => `t${i}`)] });
  assert.equal(c.title, "Setup");
  assert.equal(c.tasks.length, 30);
  assert.deepEqual(c.tasks.slice(0, 2), [{ id: 1, text: "A" }, { id: 2, text: "B" }]);
  assert.equal(c.others_can_mark_tasks_as_done, true);
  assert.equal(c.others_can_add_tasks, false);
  assert.throws(() => cleanChecklist({ title: "x", tasks: [] }), /at least one task/);
  assert.equal(checklistAsText(cleanChecklist({ title: "T", tasks: ["a", "b"] })), "📋 T\n☐ a\n☐ b");
});
