import test from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT, FORMAT_VERSION, stripSecrets, stripAccountBound, collectRefs, visitRefs,
  validateExportFile, channelWarnings, uniqueName,
} from "../utils/flowTransfer.js";

const baseFile = (over = {}) => ({
  format: FORMAT,
  version: FORMAT_VERSION,
  minReaderVersion: 1,
  flow: {
    name: "Welcome",
    platform: "WHATSAPP",
    triggerType: "KEYWORD",
    triggerKeyword: "hi",
    nodes: [
      { id: "start_1", type: "start", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", type: "text", position: { x: 200, y: 0 }, data: { message: "Hello" } },
    ],
    edges: [{ id: "e1", source: "start_1", target: "n2" }],
  },
  components: {},
  ...over,
});

test("secrets are removed at any depth, auth header lines too", () => {
  const { value, removed } = stripSecrets([
    { id: "w", type: "webhook", data: { url: "https://x.test/hook", apiKey: "abc", customHeaders: "Authorization: Bearer x\nX-Trace: 1", nested: { access_token: "t" } } },
    { id: "h", type: "httpApi", data: { headers: { "X-Api-Key": "k", Accept: "json" }, password: "p" } },
  ]);
  assert.equal(value[0].data.url, "https://x.test/hook");
  assert.equal(value[0].data.apiKey, undefined);
  assert.equal(value[0].data.nested.access_token, undefined);
  assert.equal(value[0].data.customHeaders, "X-Trace: 1");
  assert.deepEqual(value[1].data.headers, { Accept: "json" });
  assert.equal(value[1].data.password, undefined);
  assert.ok(removed.length >= 5);
});

test("account-bound settings are cleared", () => {
  const nodes = [{ id: "s", type: "start", data: { googleSheetId: "abc", googleSheetTab: "Sheet1", autoResponderListId: "L1", labelIds: [1] } }];
  const removed = stripAccountBound(nodes);
  assert.equal(nodes[0].data.googleSheetId, null);
  assert.equal(nodes[0].data.autoResponderListId, null);
  assert.deepEqual(nodes[0].data.labelIds, [1]);
  assert.equal(removed.length, 3);
});

test("references are found in buttons, arrays, message block items and typed keys", () => {
  const nodes = [
    { id: "a", type: "buttons", data: { buttons: [{ action: "goToFlow", flowId: 7, sequenceId: "3", removeLabelIds: [4, 5] }] } },
    { id: "b", type: "whatsappTemplate", data: { templateId: 9 } },
    { id: "c", type: "httpApi", data: { campaignId: 11 } },
    { id: "d", type: "appointment", data: { campaignId: 12 } },
    { id: "e", type: "messageBlock", data: { items: [{ id: "i", type: "runUserInputFlow", data: { userInputFlowId: 21 } }] } },
    { id: "f", type: "question", data: { saveToFieldId: "sys:email" } },
    { id: "g", type: "collectInput", data: { saveToFieldId: 31 } },
    { id: "h", type: "text", data: { templateId: 99 } }, // templateId outside a template element isn't a reference
  ];
  const refs = collectRefs(nodes);
  assert.deepEqual([...refs.flows], [7]);
  assert.deepEqual([...refs.sequences], [3]);
  assert.deepEqual([...refs.labels].sort(), [4, 5]);
  assert.deepEqual([...refs.whatsappTemplates], [9]);
  assert.deepEqual([...refs.httpApiCampaigns], [11]);
  assert.deepEqual([...refs.appointmentCampaigns], [12]);
  assert.deepEqual([...refs.userInputFlows], [21]);
  assert.deepEqual([...refs.customFields], [31]);
});

test("visitRefs replaces ids and drops unresolved array entries", () => {
  const nodes = [{ id: "a", type: "actions", data: { actions: [{ type: "add_label", labelId: 4 }], labelIds: [4, 5] } }];
  visitRefs(nodes, ({ id }) => (id === 4 ? 40 : null));
  assert.equal(nodes[0].data.actions[0].labelId, 40);
  assert.deepEqual(nodes[0].data.labelIds, [40]);
});

test("a valid file passes; dangling edges are dropped", () => {
  const f = baseFile();
  f.flow.edges.push({ id: "bad", source: "n2", target: "ghost" });
  const r = validateExportFile(f);
  assert.equal(r.ok, true);
  assert.equal(r.file.flow.edges.length, 1);
  assert.ok(r.warnings.some((w) => w.includes("broken connection")));
});

test("wrong format, missing start, duplicate ids and bad versions are refused", () => {
  assert.equal(validateExportFile(null).ok, false);
  assert.equal(validateExportFile({ ...baseFile(), format: "other" }).ok, false);
  assert.equal(validateExportFile({ ...baseFile(), version: "x" }).ok, false);
  const noStart = baseFile();
  noStart.flow.nodes = noStart.flow.nodes.filter((n) => n.type !== "start");
  assert.equal(validateExportFile(noStart).ok, false);
  const dup = baseFile();
  dup.flow.nodes[1].id = "start_1";
  assert.equal(validateExportFile(dup).ok, false);
});

test("a newer file that stays readable imports with a note; one that needs a newer reader is refused", () => {
  const newer = baseFile({ version: FORMAT_VERSION + 1, minReaderVersion: 1 });
  newer.flow.nodes.push({ id: "z", type: "hologramCard", data: {} });
  const r = validateExportFile(newer);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("newer version")));
  assert.ok(r.warnings.some((w) => w.includes("hologramCard")));
  const tooNew = validateExportFile(baseFile({ version: FORMAT_VERSION + 1, minReaderVersion: FORMAT_VERSION + 1 }));
  assert.equal(tooNew.ok, false);
});

test("non-importable triggers fall back to keyword", () => {
  const f = baseFile();
  f.flow.triggerType = "QUICK_ACTION";
  const r = validateExportFile(f);
  assert.equal(r.file.flow.triggerType, "KEYWORD");
});

test("channel-only elements are reported on another channel", () => {
  const w = channelWarnings([{ id: "a", type: "whatsappCtaUrl", data: {} }, { id: "b", type: "text", data: {} }], "TELEGRAM");
  assert.equal(w.length, 1);
  assert.equal(channelWarnings([{ id: "a", type: "whatsappCtaUrl", data: {} }], "WHATSAPP").length, 0);
});

test("unique names never collide", () => {
  assert.equal(uniqueName("Welcome", ["Other"]), "Welcome");
  assert.equal(uniqueName("Welcome", ["welcome"]), "Welcome (imported)");
  assert.equal(uniqueName("Welcome", ["Welcome", "Welcome (imported)"]), "Welcome (imported 2)");
});
