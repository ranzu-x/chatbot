import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isValidMetaSignature } from "../utils/metaSignature.js";

const APP_SECRET = "test-app-secret-abc123";

function signAs(body, secret = APP_SECRET) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("isValidMetaSignature — webhook intake", () => {
  test("accepts a correctly-signed body", () => {
    const body = Buffer.from(JSON.stringify({ entry: [{ id: "123" }] }));
    assert.equal(isValidMetaSignature(body, signAs(body), APP_SECRET), true);
  });

  test("rejects a body signed with the wrong app secret", () => {
    const body = Buffer.from(JSON.stringify({ entry: [{ id: "123" }] }));
    assert.equal(isValidMetaSignature(body, signAs(body, "a-different-secret"), APP_SECRET), false);
  });

  test("rejects when the body was tampered with after signing (forged inbound webhook)", () => {
    const original = Buffer.from(JSON.stringify({ entry: [{ id: "123" }] }));
    const signature = signAs(original);
    const tampered = Buffer.from(JSON.stringify({ entry: [{ id: "999" }] }));
    assert.equal(isValidMetaSignature(tampered, signature, APP_SECRET), false);
  });

  test("rejects a missing signature header", () => {
    const body = Buffer.from("{}");
    assert.equal(isValidMetaSignature(body, undefined, APP_SECRET), false);
    assert.equal(isValidMetaSignature(body, "", APP_SECRET), false);
  });

  test("rejects when no app secret is resolvable", () => {
    const body = Buffer.from("{}");
    assert.equal(isValidMetaSignature(body, signAs(body), null), false);
    assert.equal(isValidMetaSignature(body, signAs(body), ""), false);
  });

  test("rejects a missing/empty raw body even with a well-formed-looking header", () => {
    assert.equal(isValidMetaSignature(null, "sha256=deadbeef", APP_SECRET), false);
    assert.equal(isValidMetaSignature(Buffer.alloc(0), "sha256=deadbeef", APP_SECRET), false);
  });

  test("rejects a malformed header of a different length than a real signature", () => {
    const body = Buffer.from("{}");
    assert.equal(isValidMetaSignature(body, "sha256=short", APP_SECRET), false);
  });
});
