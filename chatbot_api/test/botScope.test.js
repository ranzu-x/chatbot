import test from "node:test";
import assert from "node:assert/strict";
import { collectComponentRefs, stripComponentRefs } from "../utils/botScope.js";
import { expandMessageBlocks } from "../utils/flowGraph.js";

// Every place a flow can point at another bot component must be found — a missed
// spot would be a hole in the wall.
const nodes = [
  { id: "a", type: "startSequenceAction", data: { sequenceId: 5, sequenceName: "River welcome" } },
  { id: "b", type: "runUserInputFlow", data: { userInputFlowId: 9 } },
  { id: "c", type: "startAutomation", data: { flowId: 12, flowName: "Other" } },
  { id: "d", type: "actions", data: { actions: [{ type: "add_sequence", sequenceId: 7 }, { type: "add_label", labelId: 1 }] } },
  { id: "e", type: "buttons", data: { buttons: [{ title: "x", sequenceId: 8 }, { title: "y", action: "goToFlow", flowId: 13 }] } },
  { id: "f", type: "listMenu", data: { lists: [{ sections: [{ items: [{ title: "i", sequenceId: 14 }] }] }] } },
  { id: "g", type: "messageBlock", data: { items: [{ id: "it", type: "buttons", data: { buttons: [{ sequenceId: 15 }] } }] } },
];

test("collectComponentRefs finds references everywhere, including inside Message Blocks", () => {
  const refs = collectComponentRefs(nodes);
  assert.deepEqual([...refs.sequences].sort((x, y) => x - y), [5, 7, 8, 14, 15]);
  assert.deepEqual([...refs.user_input_flows], [9]);
  assert.deepEqual([...refs.flows].sort((x, y) => x - y), [12, 13]);
});

test("labels and unrelated numbers are not treated as bot components", () => {
  const refs = collectComponentRefs([{ id: "z", type: "actions", data: { actions: [{ type: "add_label", labelId: 1 }], delay: { seconds: 3 } } }]);
  assert.equal(refs.sequences.size + refs.user_input_flows.size + refs.flows.size, 0);
});

test("stripComponentRefs removes every pointer and name, without touching the original", () => {
  const stripped = stripComponentRefs(nodes);
  const after = collectComponentRefs(stripped);
  assert.equal(after.sequences.size + after.user_input_flows.size + after.flows.size, 0);
  assert.equal(stripped[0].data.sequenceName, "");
  assert.equal(nodes[0].data.sequenceId, 5, "input must not be mutated");
});

test("a Message Block expands to a chain; buttons on a mid element keep their own route", () => {
  const graph = expandMessageBlocks(
    [
      { id: "b", type: "messageBlock", data: { items: [
        { id: "t", type: "buttons", data: { message: "hi", buttons: [{ title: "A" }] } },
        { id: "i", type: "image", data: { imageUrl: "/u.png" } },
        { id: "q", type: "quickReplies", data: { message: "?", replies: ["1"] } },
      ] } },
      { id: "n1", type: "end", data: {} },
      { id: "n2", type: "end", data: {} },
    ],
    [
      { source: "b", sourceHandle: "t:btn-0", target: "n1" },
      { source: "b", sourceHandle: "q:qr-0", target: "n2" },
    ]
  );
  assert.deepEqual(graph.nodes.map((n) => n.id), ["b~t", "b~i", "b~q", "n1", "n2"]);
  assert.ok(graph.edges.some((e) => e.source === "b~t" && e.sourceHandle === "btn-0" && e.target === "n1"));
  assert.ok(graph.edges.some((e) => e.source === "b~q" && e.sourceHandle === "qr-0" && e.target === "n2"));
  assert.ok(graph.edges.some((e) => e.source === "b~t" && e.target === "b~i" && e.sourceHandle === "next-step"));
});
