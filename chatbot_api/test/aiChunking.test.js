import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../utils/aiKnowledge.js";

test("paragraphs stay whole and carry their section heading", () => {
  const text = "# Shipping\n\nWe ship worldwide.\n\nOrders arrive in 3-5 days.\n\n# Returns\n\nReturns are free within 30 days.";
  const chunks = chunkText(text, { chunkSize: 60 });
  assert.deepEqual(chunks, ["Shipping\nWe ship worldwide.\n\nOrders arrive in 3-5 days.", "Returns\nReturns are free within 30 days."]);
});

test("a short line without punctuation counts as a heading", () => {
  const chunks = chunkText("Opening Hours\n\nMonday to Friday, 9 to 5.", { chunkSize: 200 });
  assert.deepEqual(chunks, ["Opening Hours\nMonday to Friday, 9 to 5."]);
});

test("long paragraphs split by sentence, never past the chunk size", () => {
  const para = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const chunks = chunkText(`Intro\n\n${para}`, { chunkSize: 120 });
  assert.ok(chunks.length > 3);
  for (const c of chunks) {
    assert.ok(c.length <= 120, `chunk too long: ${c.length}`);
    assert.ok(c.startsWith("Intro\n"));
  }
});

test("unstructured text still uses the plain splitter", () => {
  const text = "word ".repeat(500);
  const chunks = chunkText(text, { chunkSize: 200, overlap: 20 });
  assert.ok(chunks.length >= 12);
  assert.ok(chunks.every((c) => c.length <= 200));
});
