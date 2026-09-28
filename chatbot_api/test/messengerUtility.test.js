import test from "node:test";
import assert from "node:assert/strict";
import {
  describeMessengerTemplate, buildMessengerTemplateSend, missingMessengerParams, validateTemplateDraft,
  buildCreatePayload, messengerWindowState, friendlyMessengerError,
} from "../utils/messengerTemplateParams.js";
import { collectComponentRefs, stripComponentRefs } from "../utils/botScope.js";

const positional = {
  name: "order_update",
  language: "en",
  parameter_format: "POSITIONAL",
  components_json: JSON.stringify([
    { type: "HEADER", format: "TEXT", text: "Order {{1}}" },
    { type: "BODY", text: "Hi {{1}}, your order {{2}} has shipped." },
    { type: "BUTTONS", buttons: [
      { type: "URL", text: "Track", url: "https://shop.test/o/{{1}}" },
      { type: "POSTBACK", text: "Confirm", payload: "{{1}}" },
      { type: "POSTBACK", text: "Help", payload: "HELP" },
    ] },
  ]),
};

const named = {
  name: "named_update",
  language: "en",
  parameter_format: "NAMED",
  components_json: [{ type: "BODY", text: "Order #{{order_id}} is confirmed, {{customer_name}}!" }],
};

test("describe: placeholders, header, buttons (dynamic / routable)", () => {
  const d = describeMessengerTemplate(positional);
  assert.equal(d.parameterFormat, "POSITIONAL");
  assert.equal(d.headerType, "TEXT");
  assert.deepEqual(d.header, ["1"]);
  assert.deepEqual(d.body, ["1", "2"]);
  assert.deepEqual(d.buttons.map((b) => [b.type, b.dynamic, b.routable]), [["URL", true, false], ["POSTBACK", true, true], ["POSTBACK", false, false]]);
  assert.deepEqual(describeMessengerTemplate(named).body, ["order_id", "customer_name"]);
});

test("send: positional components, routing token on a routable reply button, URL ending", () => {
  const built = buildMessengerTemplateSend(positional, { header: { 1: "#55" }, body: { 1: "{{contact.name}}", 2: "#55" }, buttons: { 0: "55" } },
    (t) => t.replace("{{contact.name}}", "Ana"), { routeFor: (i) => `FBTN:9:n1:${i}` });
  assert.deepEqual(built.components, [
    { type: "header", parameters: [{ type: "text", text: "#55" }] },
    { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "#55" }] },
    { type: "buttons", parameters: [{ type: "URL", url: "55" }, { type: "POSTBACK", payload: "FBTN:9:n1:1" }] },
  ]);
  assert.equal(built.renderedBody, "Hi Ana, your order #55 has shipped.");
  assert.equal(built.renderedHeader, "Order #55");
  assert.equal(built.buttons[0].url, "https://shop.test/o/55");
});

test("send: named parameters carry parameter_name; payloadFor wins (COD)", () => {
  const built = buildMessengerTemplateSend(named, { body: { order_id: "1", customer_name: "Bo" } });
  assert.deepEqual(built.components[0].parameters, [
    { type: "text", parameter_name: "order_id", text: "1" },
    { type: "text", parameter_name: "customer_name", text: "Bo" },
  ]);
  const cod = buildMessengerTemplateSend(positional, { header: { 1: "a" }, body: { 1: "a", 2: "b" }, buttons: { 0: "x" } }, (t) => t, {
    routeFor: () => "FBTN:1:n:0", payloadFor: (i) => (i === 1 ? "CMC:7:Y" : null),
  });
  assert.equal(cod.components.at(-1).parameters[1].payload, "CMC:7:Y");
});

test("send: image header only when an image is given", () => {
  const img = { ...positional, components_json: [{ type: "HEADER", format: "IMAGE", example: { header_handle: ["h"] } }, { type: "BODY", text: "Your receipt is ready, thanks." }] };
  assert.equal(buildMessengerTemplateSend(img, {}).components.length, 0);
  const withImage = buildMessengerTemplateSend(img, { headerImage: "/uploads/a.png" }, (t) => t, { resolveImage: (u) => `https://api.test${u}` });
  assert.deepEqual(withImage.components[0], { type: "header", parameters: [{ type: "image", image: { link: "https://api.test/uploads/a.png" } }] });
});

test("missing params: routable reply buttons are filled by the flow", () => {
  assert.deepEqual(missingMessengerParams(positional, {}), ["header {{1}}", "body {{1}}", "body {{2}}", 'button "Track"']);
  assert.deepEqual(missingMessengerParams(positional, { header: { 1: "a" }, body: { 1: "a", 2: "b" }, buttons: { 0: "x" } }), []);
});

const goodDraft = {
  name: "order_shipped",
  language: "en",
  parameterFormat: "POSITIONAL",
  header: { type: "NONE" },
  body: { text: "Hi {{1}}, your order {{2}} has shipped and will arrive soon.", examples: { 1: "Ana", 2: "#55" } },
  buttons: [{ type: "URL", text: "Track", url: "https://shop.test/o/{{1}}", urlExample: "55" }, { type: "POSTBACK", text: "Help" }],
};

test("pre-checks: a valid draft passes", () => {
  assert.deepEqual(validateTemplateDraft(goodDraft).errors, []);
});

test("pre-checks: Meta's rejection reasons are caught before submitting", () => {
  const errs = (patch) => validateTemplateDraft({ ...goodDraft, ...patch }).errors.join(" | ");
  assert.match(errs({ name: "Order Shipped" }), /lowercase/);
  assert.match(errs({ body: { text: "{{1}} your order has shipped today", examples: { 1: "a" } } }), /start or end/);
  assert.match(errs({ body: { text: "Hi {{1}}, order {{3}} shipped to your address today.", examples: { 1: "a", 3: "b" } } }), /no gaps/);
  assert.match(errs({ body: { text: "Hi {{1}} {{2}} shipped to you today, thanks.", examples: { 1: "a", 2: "b" } } }), /side by side/);
  assert.match(errs({ body: { text: "Hi {1}, your order shipped today.", examples: {} } }), /stray/);
  assert.match(errs({ body: { text: "Hi {{1}}, order {{2}} ok.", examples: { 1: "a", 2: "b" } } }), /too many variables/);
  assert.match(errs({ body: { text: "Hi {{1}}, your order has shipped today.", examples: {} } }), /example value/);
  assert.match(errs({ parameterFormat: "NAMED", body: { text: "Hi {{Order-Id}}, your order has shipped today.", examples: {} } }), /named variables/);
  assert.match(errs({ buttons: [{ type: "URL", text: "Track", url: "https://shop.test/{{1}}/x", urlExample: "1" }] }), /very end/);
  assert.match(errs({ buttons: [1, 2, 3, 4].map(() => ({ type: "POSTBACK", text: "Ok" })) }), /At most 3/);
  assert.match(errs({ body: { text: "Please reply with your card number and CVV for order {{1}} today.", examples: { 1: "a" } } }), /sensitive/);
  const w = validateTemplateDraft({ ...goodDraft, body: { text: "Hi {{1}}, enjoy 20% off your next order {{2}} today!", examples: { 1: "a", 2: "b" } } }).warnings;
  assert.match(w.join(" "), /marketing/);
});

test("create payload: examples and a variable POSTBACK payload", () => {
  const p = buildCreatePayload(goodDraft);
  assert.equal(p.category, "UTILITY");
  assert.equal(p.parameter_format, undefined);
  assert.deepEqual(p.components[0].example, { body_text: [["Ana", "#55"]] });
  assert.deepEqual(p.components[1].buttons, [
    { type: "URL", text: "Track", url: "https://shop.test/o/{{1}}", example: { url_suffix_example: "https://shop.test/o/55" } },
    { type: "POSTBACK", text: "Help", payload: "{{1}}" },
  ]);
  const n = buildCreatePayload({ ...goodDraft, parameterFormat: "NAMED", buttons: [], body: { text: "Order {{order_id}} is on its way to you today.", examples: { order_id: "9" } } });
  assert.equal(n.parameter_format, "NAMED");
  assert.deepEqual(n.components[0].example, { body_text_named_params: [{ param_name: "order_id", example: "9" }] });
});

test("window: 24h open, 7-day Human Agent, then closed", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  const hoursAgo = (h) => new Date(now - h * 3_600_000);
  assert.equal(messengerWindowState(hoursAgo(5), { now }).state, "OPEN");
  assert.equal(messengerWindowState(hoursAgo(30), { now, humanAgentEnabled: true }).state, "HUMAN_AGENT");
  const off = messengerWindowState(hoursAgo(30), { now, humanAgentEnabled: false });
  assert.equal(off.state, "CLOSED");
  assert.equal(off.humanAgentAvailable, true);
  assert.equal(messengerWindowState(hoursAgo(24 * 8), { now, humanAgentEnabled: true }).state, "CLOSED");
  assert.equal(messengerWindowState(null, { now, humanAgentEnabled: true }).state, "CLOSED");
});

test("errors: removed message tags explain the replacement", () => {
  assert.match(friendlyMessengerError({ code: 100, message: "Invalid parameter: tag" }), /Utility template/);
  assert.match(friendlyMessengerError({ code: 10, error_subcode: 2018278, message: "outside of allowed window" }), /window is closed/);
});

test("bot scope: a Utility Template element's template is a scoped component", () => {
  const nodes = [{ id: "n1", type: "messengerTemplate", data: { messengerTemplateId: 12, messengerTemplateName: "x" } }];
  assert.deepEqual([...collectComponentRefs(nodes).messenger_utility_templates], [12]);
  const stripped = stripComponentRefs(nodes);
  assert.equal(stripped[0].data.messengerTemplateId, null);
  assert.equal(stripped[0].data.messengerTemplateName, "");
});
