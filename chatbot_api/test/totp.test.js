import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Encode, base32Decode, hotp, totp, verifyTotp, generateBackupCodes, hashBackupCode, STEP_SECONDS } from "../utils/totp.js";

// RFC 6238 Appendix B test secret: ASCII "12345678901234567890".
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("base32 round-trips", () => {
  assert.equal(SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(base32Decode(SECRET).toString(), "12345678901234567890");
});

test("HOTP matches RFC 4226 Appendix D", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  expected.forEach((code, i) => assert.equal(hotp(SECRET, i), code));
});

test("TOTP matches RFC 6238 Appendix B (SHA-1, 6 digits)", () => {
  // The RFC lists 8-digit values; the 6-digit code is their last 6 digits.
  const vectors = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]];
  for (const [seconds, eight] of vectors) assert.equal(totp(SECRET, seconds * 1000), eight.slice(-6));
});

test("verifyTotp accepts ±1 step, rejects replays and junk", () => {
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  assert.equal(verifyTotp(SECRET, totp(SECRET, now), { timeMs: now }), step);
  assert.equal(verifyTotp(SECRET, totp(SECRET, now - 30_000), { timeMs: now }), step - 1);
  assert.equal(verifyTotp(SECRET, totp(SECRET, now - 90_000), { timeMs: now }), null);
  assert.equal(verifyTotp(SECRET, totp(SECRET, now), { timeMs: now, lastStep: step }), null, "same step twice");
  assert.equal(verifyTotp(SECRET, "12ab56", { timeMs: now }), null);
});

test("backup codes are random, hashed and case/format-insensitive", () => {
  const { codes, hashes } = generateBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashBackupCode(codes[0].toUpperCase().replace("-", " ")), hashes[0]);
});
