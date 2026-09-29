/**
 * Flow analytics + the Randomizer step, against the real DB. Uses a
 * throw-away Webchat bot (no channel API is called) and removes everything.
 * Run: npm run test:flow-analytics
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { processFlow, encodeButtonRoute } from "../utils/flowEngine.js";
import { getFlowAnalytics, trackMessageReceipt, pickWeightedBranch } from "../utils/flowStats.js";

const ok = (m) => console.log(`  ✔ ${m}`);

// Weighted pick (pure)
{
  const seq = [0.1, 0.5, 0.95];
  let i = 0;
  const rand = () => seq[i++ % seq.length];
  assert.deepEqual([pickWeightedBranch([{ weight: 20 }, { weight: 80 }], rand), pickWeightedBranch([{ weight: 20 }, { weight: 80 }], rand), pickWeightedBranch([{ weight: 20 }, { weight: 80 }], rand)], [0, 1, 1]);
  assert.equal(pickWeightedBranch([]), -1);
  let counts = [0, 0, 0];
  for (let k = 0; k < 3000; k++) counts[pickWeightedBranch([{ weight: 50 }, { weight: 30 }, { weight: 20 }])]++;
  assert.ok(Math.abs(counts[0] / 3000 - 0.5) < 0.05 && Math.abs(counts[2] / 3000 - 0.2) < 0.05, `weights respected: ${counts}`);
  ok(`weighted pick follows the weights (50/30/20 → ${counts.map((c) => Math.round(c / 30)).join("/")}%)`);
}

const [[agency]] = await pool.query("SELECT id FROM agencies WHERE account_type IN ('DIRECT_CUSTOMER','RESELLER_CUSTOMER') AND is_active = 1 ORDER BY id LIMIT 1");
const agencyId = agency.id;
const [integ] = await pool.query(
  "INSERT INTO integrations (agency_id, platform, name, access_token, is_active) VALUES (?, 'WEBCHAT', 'analytics-test', NULL, 1)",
  [agencyId]
);
const integration = { id: integ.insertId, agency_id: agencyId, platform: "WEBCHAT" };

const nodes = [
  { id: "start", type: "start", data: {} },
  { id: "rand", type: "randomizer", data: { branches: [{ label: "A", weight: 50 }, { label: "B", weight: 50 }] } },
  { id: "msgA", type: "text", data: { message: "Hello from A" } },
  { id: "msgB", type: "buttons", data: { message: "Hello from B", buttons: [{ title: "Yes" }, { title: "No" }] } },
  { id: "yes", type: "text", data: { message: "You said yes" } },
];
const edges = [
  { id: "e1", source: "start", target: "rand" },
  { id: "e2", source: "rand", sourceHandle: "branch-0", target: "msgA" },
  { id: "e3", source: "rand", sourceHandle: "branch-1", target: "msgB" },
  { id: "e4", source: "msgB", sourceHandle: "btn-0", target: "yes" },
];
const [fl] = await pool.query(
  "INSERT INTO flows (agency_id, integration_id, name, trigger_type, nodes_json, edges_json, is_active) VALUES (?, ?, 'analytics-test', 'KEYWORD', ?, ?, 1)",
  [agencyId, integration.id, JSON.stringify(nodes), JSON.stringify(edges)]
);
const flowId = fl.insertId;
const contacts = [];
const convs = [];

try {
  const RUNS = 40;
  for (let k = 0; k < RUNS; k++) {
    const [c] = await pool.query(
      "INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'WEBCHAT', ?, 'Analytics Tester', 'MANUAL')",
      [agencyId, `analytics-${Date.now()}-${k}`]
    );
    contacts.push(c.insertId);
    const [cv] = await pool.query("INSERT INTO conversations (agency_id, contact_id, integration_id, status) VALUES (?, ?, ?, 'OPEN')", [agencyId, c.insertId, integration.id]);
    convs.push(cv.insertId);
    const [s] = await pool.query(
      "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, 'start', '{}', 'ACTIVE')",
      [agencyId, cv.insertId, flowId]
    );
    const [[session]] = await pool.query("SELECT * FROM flow_sessions WHERE id = ?", [s.insertId]);
    const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [cv.insertId]);
    const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [c.insertId]);
    await processFlow(agencyId, "WEBCHAT", conversation, contact, "", integration, "TEXT", null, { session, skipDelayForNodeId: null });
  }
  await new Promise((r) => setTimeout(r, 300)); // counters are written without blocking the conversation

  let a = await getFlowAnalytics(agencyId, flowId, 30, "start");
  assert.equal(a.steps.start.reached, RUNS, "every run entered");
  assert.equal(a.steps.rand.reached, RUNS);
  const toA = a.steps.rand.outputs["branch-0"] || 0;
  const toB = a.steps.rand.outputs["branch-1"] || 0;
  assert.equal(toA + toB, RUNS, "each person took exactly one branch");
  assert.ok(toA > 5 && toB > 5, `both branches used (${toA}/${toB})`);
  assert.equal(a.steps.msgA.reached, toA);
  assert.equal(a.steps.msgB.reached, toB);
  assert.equal(a.steps.msgA.sent, toA, "branch A's message counted as sent");
  assert.equal(a.daily.at(-1).entries, RUNS);
  ok(`randomizer split ${RUNS} people ${toA}/${toB}; reached / sent counted per step`);

  // Receipts: counted once per message, read implies delivered.
  const [msgs] = await pool.query(
    "SELECT id FROM messages WHERE conversation_id IN (?) AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.nodeId')) = 'msgA'",
    [convs]
  );
  assert.equal(msgs.length, toA, "messages carry their flow step");
  await trackMessageReceipt(msgs[0].id, "delivered");
  await trackMessageReceipt(msgs[0].id, "delivered");
  await trackMessageReceipt(msgs[0].id, "read");
  await trackMessageReceipt(msgs[0].id, "read");
  if (msgs[1]) await trackMessageReceipt(msgs[1].id, "read");
  a = await getFlowAnalytics(agencyId, flowId, 30, "start");
  assert.equal(a.steps.msgA.delivered, msgs[1] ? 2 : 1, "each delivery counted once; a read counts as delivered");
  assert.equal(a.steps.msgA.read, msgs[1] ? 2 : 1, "each read counted once");
  ok("delivered / read receipts counted once per message");

  // A tap on branch B's first button.
  const [[bConv]] = await pool.query(
    `SELECT m.conversation_id FROM messages m WHERE m.conversation_id IN (?) AND JSON_UNQUOTE(JSON_EXTRACT(m.metadata, '$.nodeId')) = 'msgB' LIMIT 1`,
    [convs]
  );
  const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [bConv.conversation_id]);
  const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id]);
  await processFlow(agencyId, "WEBCHAT", conversation, contact, "Yes", integration, "TEXT", encodeButtonRoute(flowId, "msgB", 0));
  await new Promise((r) => setTimeout(r, 300));
  a = await getFlowAnalytics(agencyId, flowId, 30, "start");
  assert.equal(a.steps.msgB.clicked, 1);
  assert.equal(a.steps.msgB.outputs["opt-0"], 1, "the tapped button");
  assert.equal(a.steps.yes.reached, 1, "the tap led to the next step");
  ok("button tap counted on the step and on the button");

  // Another workspace sees nothing.
  const [[other]] = await pool.query("SELECT id FROM agencies WHERE id <> ? ORDER BY id LIMIT 1", [agencyId]);
  const foreign = await getFlowAnalytics(other.id, flowId, 30, "start");
  assert.deepEqual(foreign.steps, {}, "stats are scoped to the flow's own workspace");
  ok("another workspace can't read these stats");

  console.log("✅ Flow analytics + Randomizer: all checks passed");
} finally {
  await pool.query("DELETE FROM flows WHERE id = ?", [flowId]); // cascades flow_step_stats
  if (convs.length) await pool.query("DELETE FROM conversations WHERE id IN (?)", [convs]);
  if (contacts.length) await pool.query("DELETE FROM contacts WHERE id IN (?)", [contacts]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integration.id]);
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
