import test from "node:test";
import assert from "node:assert/strict";
import { applyPersonalization, realName, nameParts } from "../utils/personalize.js";

const ann = { name: "Ann Marie Lee", email: "ann@x.com", phone: "8801700000000", age: 31, external_id: "8801700000000" };
Object.defineProperty(ann, "_fields", { value: { city: "Dhaka", plan: "" }, enumerable: false });

test("subscriber tokens", () => {
  assert.equal(applyPersonalization("Hi {{contact.first_name}}!", ann), "Hi Ann!");
  assert.equal(applyPersonalization("{{contact.last_name}}", ann), "Marie Lee");
  assert.equal(applyPersonalization("{{contact.name}} / {{contact.email}} / {{contact.age}}", ann), "Ann Marie Lee / ann@x.com / 31");
  assert.equal(applyPersonalization("{{ contact.FIRST_NAME }}", ann), "Ann");
});

test("custom fields, including empty and unknown ones", () => {
  assert.equal(applyPersonalization("From {{field.city}}", ann), "From Dhaka");
  assert.equal(applyPersonalization("[{{field.plan}}]", ann), "[]");
  assert.equal(applyPersonalization("[{{field.missing}}]", ann), "[]");
});

test("fallbacks apply only when the value is empty", () => {
  assert.equal(applyPersonalization("{{field.plan|Free}}", ann), "Free");
  assert.equal(applyPersonalization("{{field.city|Somewhere}}", ann), "Dhaka");
  assert.equal(applyPersonalization("Hi {{contact.first_name|there}}", { name: "" }), "Hi there");
});

test("placeholder names count as empty for the new tokens, old {{contact.name}} unchanged", () => {
  const visitor = { name: "Webchat Visitor (ab12)", external_id: "visitor_1" };
  const number = { name: "8801711111111", external_id: "8801711111111" };
  assert.equal(realName(visitor), "");
  assert.equal(applyPersonalization("Hi {{contact.first_name|friend}}", number), "Hi friend");
  assert.equal(applyPersonalization("Hi {{contact.name|friend}}", visitor), "Hi friend");
  assert.equal(applyPersonalization("Hi {{contact.name}}", { name: "" }), "Hi Customer");
  assert.equal(applyPersonalization("Hi {{contact.name}}", number), "Hi 8801711111111");
});

test("other tokens are left for the next step", () => {
  assert.equal(applyPersonalization("{{var.phone}} {{order.total}} {{contact.unknown}} {{answer}}", ann), "{{var.phone}} {{order.total}} {{contact.unknown}} {{answer}}");
  assert.deepEqual(nameParts({ name: "Cher" }), { full: "Cher", first: "Cher", last: "" });
});
