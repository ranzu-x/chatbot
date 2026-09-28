/**
 * Two-factor login end to end over HTTP (only the auth routes, on a random
 * port — no schedulers) against the real DB. Opt-in: `npm run test:2fa`.
 * Uses a throwaway account and deletes it afterwards.
 */
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import pool from "../db.js";
import authRoutes from "../routes/auth.js";
import { createAccount } from "../utils/accountProvisioning.js";
import { totp, STEP_SECONDS } from "../utils/totp.js";

const tag = String(Date.now()).slice(-7);
const email = `twofa-test-${tag}@example.test`;
const password = `Pw-${tag}-secret`;
const created = { userId: null, agencyId: null };
let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✔ ${name}`); };

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/v1", authRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

async function call(path, { method = "POST", body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  const acct = await createAccount({ fullName: "2FA Tester", email, passwordHash: await bcrypt.hash(password, 10), businessName: `2FA Test ${tag}`, source: "test" });
  Object.assign(created, acct);

  // Normal login while 2FA is off
  let r = await call("/auth/login", { body: { email, password } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token && !r.data.twoFactorRequired);
  let token = r.data.token;
  ok("2FA off → password alone signs in");

  // Set up + enable
  r = await call("/auth/2fa/setup", { token });
  assert.equal(r.status, 200);
  assert.ok(r.data.qr.startsWith("data:image/png;base64,"));
  assert.ok(r.data.uri.startsWith("otpauth://totp/"));
  const secret = r.data.secret;
  r = await call("/auth/2fa/enable", { token, body: { code: "000000" } });
  assert.equal(r.status, 400);
  // Use the code for the previous step so the login below can use the current one.
  r = await call("/auth/2fa/enable", { token, body: { code: totp(secret, Date.now() - STEP_SECONDS * 1000) } });
  assert.equal(r.status, 200);
  assert.equal(r.data.backupCodes.length, 10);
  const backupCodes = r.data.backupCodes;
  r = await call("/auth/2fa", { method: "GET", token });
  assert.equal(r.data.enabled, true);
  ok("setup gives a QR code; a wrong code is refused; the right one turns it on with 10 backup codes");

  // Login now needs the code
  r = await call("/auth/login", { body: { email, password } });
  assert.equal(r.data.twoFactorRequired, true);
  assert.ok(!r.data.token, "no session before the code");
  const challenge = r.data.challengeToken;
  r = await call("/auth/me", { method: "GET", token: challenge });
  assert.equal(r.status, 401, "the challenge is not a login token");
  r = await call("/auth/login/2fa", { body: { challengeToken: challenge, code: "123456" } });
  assert.equal(r.status, 401);
  const code = totp(secret);
  r = await call("/auth/login/2fa", { body: { challengeToken: challenge, code } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  token = r.data.token;
  ok("password → challenge (useless as a session) → wrong code refused → right code signs in");

  // Same code again, and backup codes
  r = await call("/auth/login", { body: { email, password } });
  const challenge2 = r.data.challengeToken;
  r = await call("/auth/login/2fa", { body: { challengeToken: challenge2, code } });
  assert.equal(r.status, 401, "a code can't be used twice");
  r = await call("/auth/login/2fa", { body: { challengeToken: challenge2, backupCode: backupCodes[0].toUpperCase() } });
  assert.equal(r.status, 200);
  r = await call("/auth/login", { body: { email, password } });
  r = await call("/auth/login/2fa", { body: { challengeToken: r.data.challengeToken, backupCode: backupCodes[0] } });
  assert.equal(r.status, 401, "a backup code works once");
  ok("a code is never accepted twice; a backup code works exactly once");

  // Too many wrong codes on one challenge
  r = await call("/auth/login", { body: { email, password } });
  const challenge3 = r.data.challengeToken;
  for (let i = 0; i < 5; i += 1) await call("/auth/login/2fa", { body: { challengeToken: challenge3, code: "000000" } });
  r = await call("/auth/login/2fa", { body: { challengeToken: challenge3, code: totp(secret) } });
  assert.equal(r.status, 429);
  ok("5 wrong codes end that sign-in attempt");

  // Sign out everywhere
  const oldToken = token;
  r = await call("/auth/sessions/revoke-all", { token });
  assert.equal(r.status, 200);
  token = r.data.token;
  r = await call("/auth/2fa", { method: "GET", token: oldToken });
  assert.equal(r.status, 401);
  r = await call("/auth/2fa", { method: "GET", token });
  assert.equal(r.status, 200);
  ok("sign out everywhere → old sessions refused, this one continues with a new token");

  // Disable needs password + code
  r = await call("/auth/2fa/disable", { token, body: { password: "wrong", code: totp(secret) } });
  assert.equal(r.status, 400);
  r = await call("/auth/2fa/disable", { token, body: { password, backupCode: backupCodes[1] } });
  assert.equal(r.status, 200);
  r = await call("/auth/login", { body: { email, password } });
  assert.ok(r.data.token && !r.data.twoFactorRequired);
  ok("turning it off needs the password and a code; afterwards the password alone works again");
}

async function cleanup() {
  if (created.agencyId) {
    await pool.query("DELETE FROM subscriptions WHERE agency_id = ? OR user_id = ?", [created.agencyId, created.userId]);
    await pool.query("DELETE FROM organization_members WHERE agency_id = ?", [created.agencyId]);
    await pool.query("UPDATE users SET home_agency_id = NULL WHERE id = ?", [created.userId]).catch(() => {});
    await pool.query("DELETE FROM agencies WHERE id = ?", [created.agencyId]);
  }
  if (created.userId) await pool.query("DELETE FROM users WHERE id = ?", [created.userId]);
}

try {
  await main();
  console.log(`\n${passed} checks passed`);
} catch (err) {
  console.error("\n✖ FAILED:", err.message);
  process.exitCode = 1;
} finally {
  server.close();
  await cleanup().catch((e) => console.error("cleanup:", e.message));
  await pool.end().catch(() => {});
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}
