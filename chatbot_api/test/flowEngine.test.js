import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  encodeButtonRoute,
  normalizeButtonType,
  normalizeListMenuData,
  replaceVariables,
  inputTypeToFieldType,
} from "../utils/flowEngine.js";

describe("encodeButtonRoute", () => {
  test("encodes flowId/nodeId/idx into the FBTN token format", () => {
    assert.equal(encodeButtonRoute(12, "node-3", 1), "FBTN:12:node-3:1");
  });
});

describe("normalizeButtonType", () => {
  test("maps action 'url' to URL", () => {
    assert.equal(normalizeButtonType({ action: "url" }), "URL");
  });
  test("maps action 'phone' or 'call' to PHONE", () => {
    assert.equal(normalizeButtonType({ action: "phone" }), "PHONE");
    assert.equal(normalizeButtonType({ action: "call" }), "PHONE");
  });
  test("falls back to legacy .type field when .action is absent", () => {
    assert.equal(normalizeButtonType({ type: "url" }), "URL");
  });
  test("defaults to POSTBACK for anything else, including malformed input", () => {
    assert.equal(normalizeButtonType({ action: "flow" }), "POSTBACK");
    assert.equal(normalizeButtonType({}), "POSTBACK");
    assert.equal(normalizeButtonType(null), "POSTBACK");
    assert.equal(normalizeButtonType("not-an-object"), "POSTBACK");
  });
});

describe("inputTypeToFieldType", () => {
  test("maps number/date to their Custom Field types", () => {
    assert.equal(inputTypeToFieldType("number"), "NUMBER");
    assert.equal(inputTypeToFieldType("date"), "DATE");
  });
  test("defaults everything else (name/email/phone/custom) to TEXT", () => {
    assert.equal(inputTypeToFieldType("email"), "TEXT");
    assert.equal(inputTypeToFieldType("custom"), "TEXT");
    assert.equal(inputTypeToFieldType(undefined), "TEXT");
  });
});

describe("replaceVariables", () => {
  const contact = { name: "Priya", phone: "+15551234567", email: "priya@example.com" };

  test("replaces {{contact.*}} placeholders from the contact object", () => {
    const out = replaceVariables("Hi {{contact.name}}, we'll text {{contact.phone}}", {}, contact);
    assert.equal(out, "Hi Priya, we'll text +15551234567");
  });
  test("falls back to 'Customer' when contact.name is missing", () => {
    const out = replaceVariables("Hi {{contact.name}}", {}, {});
    assert.equal(out, "Hi Customer");
  });
  test("replaces custom {{variable}} tokens from the variables map", () => {
    const out = replaceVariables("Order #{{orderId}} is ready", { orderId: "A1029" }, contact);
    assert.equal(out, "Order #A1029 is ready");
  });
  test("leaves an unrecognized {{token}} untouched rather than blanking it", () => {
    const out = replaceVariables("Hello {{unknownVar}}", {}, contact);
    assert.equal(out, "Hello {{unknownVar}}");
  });
  test("returns an empty string for falsy input instead of throwing", () => {
    assert.equal(replaceVariables("", {}, contact), "");
    assert.equal(replaceVariables(null, {}, contact), "");
  });
});

describe("normalizeListMenuData", () => {
  test("upgrades a legacy flat items[] into one list with one untitled section", () => {
    const out = normalizeListMenuData({ title: "Menu", buttonText: "Pick", items: ["A", "B"] });
    assert.equal(out.length, 1);
    assert.equal(out[0].sections.length, 1);
    assert.deepEqual(out[0].sections[0].items.map((i) => i.title), ["A", "B"]);
    // flattened items retains the same order for the flat-index handles used by the canvas
    assert.deepEqual(out[0].items.map((i) => i.title), ["A", "B"]);
  });

  test("coerces plain-string items into {title, action:'flow'} objects", () => {
    const out = normalizeListMenuData({ items: ["Just a string"] });
    assert.deepEqual(out[0].items[0], { title: "Just a string", action: "flow" });
  });

  test("preserves an already-multi-list, multi-section shape as-is", () => {
    const data = {
      lists: [
        { title: "List 1", buttonText: "Go", sections: [{ title: "Sec A", items: [{ title: "X" }] }] },
      ],
    };
    const out = normalizeListMenuData(data);
    assert.equal(out.length, 1);
    assert.equal(out[0].sections[0].title, "Sec A");
    assert.equal(out[0].items[0].title, "X");
  });

  test("returns an empty array when there's neither lists[] nor items[]", () => {
    assert.deepEqual(normalizeListMenuData({}), []);
    assert.deepEqual(normalizeListMenuData(undefined), []);
  });
});
