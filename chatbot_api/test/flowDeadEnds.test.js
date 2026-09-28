import test from "node:test";
import assert from "node:assert/strict";
import { findDeadEndOptions } from "../utils/flowDeadEnds.js";

const nodes = [
  { id: "n1", type: "buttons", data: { buttons: [{ title: "Yes", action: "flow" }, { title: "Site", action: "url", url: "https://x" }, "Legacy"] } },
  { id: "n2", type: "quickReplies", data: { replies: [{ title: "A" }, { kind: "phone" }, { title: "Human", action: "chatHuman" }] } },
  { id: "n3", type: "messageBlock", data: { items: [{ id: "it1", type: "image", data: { buttons: [{ title: "Go" }] } }] } },
  { id: "n4", type: "listMenu", data: { lists: [{ items: [{ title: "Row" }] }, { items: ["Second list row"] }] } },
  { id: "n5", type: "text", data: { message: "no buttons" } },
];

test("every unwired 'continue' option is reported", () => {
  const found = findDeadEndOptions(nodes, []);
  assert.deepEqual(found.map((f) => f.nodeId), ["n1", "n1", "n2", "n3", "n4", "n4"]);
  assert.equal(found.find((f) => f.nodeId === "n3").itemId, "it1");
});

test("wired options, links, flow jumps, quick actions and special replies are fine", () => {
  const edges = ["n1|btn-0", "n1|btn-2", "n2|qr-0", "n3|it1:btn-0", "n4|item-0", "n4|item-1"]
    .map((h) => { const [source, sourceHandle] = h.split("|"); return { source, sourceHandle }; });
  assert.deepEqual(findDeadEndOptions(nodes, edges), []);
});

test("junk input doesn't throw", () => {
  assert.deepEqual(findDeadEndOptions(null, null), []);
  assert.deepEqual(findDeadEndOptions([null, { id: "x" }], "nope"), []);
});
