import test from "node:test";
import assert from "node:assert/strict";
import { STORE_TEMPLATE_PRESETS, presetMetaPayload, suggestedVariableMap, renderPresetSample } from "../utils/storeTemplatePresets.js";
import { COMMERCE_FIELDS, COMMERCE_TRIGGERS, describeTemplate } from "../utils/commerceEvents.js";

const EMOJI = /\p{Extended_Pictographic}/u;

test("one default per trigger, unique names", () => {
  assert.deepEqual(STORE_TEMPLATE_PRESETS.map((p) => p.trigger).sort(), COMMERCE_TRIGGERS.map((t) => t.id).sort());
  assert.equal(new Set(STORE_TEMPLATE_PRESETS.map((p) => p.name)).size, STORE_TEMPLATE_PRESETS.length);
});

for (const p of STORE_TEMPLATE_PRESETS) {
  test(`${p.key}: follows Meta's template rules`, () => {
    assert.match(p.name, /^[a-z0-9_]{1,512}$/);
    assert.ok(p.body.length <= 1024, "body ≤ 1024");
    assert.ok(!p.body.trimStart().startsWith("{{") && !p.body.trimEnd().endsWith("}}"), "no variable at the start or end");
    assert.ok(!/}}\s*{{/.test(p.body), "no two variables side by side");
    assert.ok(!/\n\s*\n\s*\n/.test(p.body), "no more than one blank line in a row");
    assert.ok(!p.headerText || (p.headerText.length <= 60 && !p.headerText.includes("{{") && !EMOJI.test(p.headerText)), "header ≤ 60, no variables / emoji");
    assert.ok(!p.footer || (p.footer.length <= 60 && !p.footer.includes("{{")), "footer ≤ 60, static");
    for (const b of p.buttons) assert.ok(b.text.length <= 20, "quick reply text fits the 20 chars the app sends");
    assert.equal(p.category, p.trigger === "ABANDONED_CART" ? "MARKETING" : "UTILITY");
  });

  test(`${p.key}: every variable is a store value available for its trigger`, () => {
    const isCart = p.trigger === "ABANDONED_CART";
    const available = new Set(COMMERCE_FIELDS.filter((f) => !f.scope || (f.scope === "cart") === isCart).map((f) => f.id));
    const names = [...p.body.matchAll(/{{\s*([a-z_]+)\s*}}/g)].map((m) => m[1]);
    assert.ok(names.length > 0);
    for (const n of names) assert.ok(available.has(n), `${n} is a ${isCart ? "cart" : "order"} field`);
    assert.ok(!renderPresetSample(p.body).includes("{{"), "every variable has a review sample");
  });

  test(`${p.key}: Meta payload uses named parameters and the campaign maps them all`, () => {
    const payload = presetMetaPayload(p);
    assert.equal(payload.parameter_format, "named");
    const body = payload.components.find((c) => c.type === "BODY");
    const names = [...new Set([...p.body.matchAll(/{{\s*([a-z_]+)\s*}}/g)].map((m) => m[1]))];
    assert.deepEqual(body.example.body_text_named_params.map((x) => x.param_name), names);
    const tpl = { header_type: "TEXT", header_text: p.headerText, body_text: p.body, buttons_json: JSON.stringify(p.buttons) };
    const map = suggestedVariableMap(describeTemplate(tpl), COMMERCE_FIELDS.map((f) => f.id));
    assert.deepEqual(Object.keys(map.body).sort(), names.sort());
    if (p.trigger === "COD_VERIFICATION") assert.equal(describeTemplate(tpl).quickReplyCount, 2);
  });
}

test("suggested map leaves positional and unknown placeholders for the person", () => {
  const map = suggestedVariableMap({ header: ["1"], body: ["order_number", "2", "foo"] }, ["order_number"]);
  assert.deepEqual(map, { header: {}, body: { order_number: "order_number" }, buttons: {} });
});
