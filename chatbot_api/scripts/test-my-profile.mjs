/**
 * My Account → Profile endpoints (routes/auth.js /auth/profile*) over HTTP,
 * against the real DB with a throw-away user (deleted at the end).
 * Run: npm run test:my-profile
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import authRoutes from "../routes/auth.js";

const ok = (m) => console.log(`  ✔ ${m}`);
const { createAccount } = await import("../utils/accountProvisioning.js");
const email = `profile-test-${Date.now()}@example.com`;
// A real End User account (user + own workspace), like a sign-up.
const account = await createAccount({ fullName: "Profile Tester", email, passwordHash: await bcrypt.hash("oldpass123", 10), source: "test" });
const userId = account.userId;
const agencyId = account.agencyId;
let token = jwt.sign({ id: userId, role: "RESELLER", agencyId, tv: 0 }, process.env.JWT_SECRET, { expiresIn: "10m" });

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/v1", authRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (method, p, body, tok = token) => {
  const isForm = body instanceof FormData;
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(isForm || !body ? {} : { "Content-Type": "application/json" }) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const upload = (bytes, name) => { const fd = new FormData(); fd.append("file", new Blob([bytes]), name); return fd; };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

try {
  let r = await call("GET", "/auth/profile");
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.email, email);
  ok("GET /auth/profile");

  r = await call("PUT", "/auth/profile", { name: "  New Name  ", phone: "+8801711111111", address: "Dhaka" });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.name, "New Name");
  assert.equal(r.body.profile.phone, "+8801711111111");
  assert.equal((await call("PUT", "/auth/profile", { name: "  " })).status, 400, "empty name refused");
  assert.equal((await call("PUT", "/auth/profile", { phone: "call me maybe" })).status, 400, "bad phone refused");
  ok("name / phone / address saved; empty name and bad phone refused");

  r = await call("POST", "/auth/profile/avatar", upload(PNG, "me.png"));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const firstAvatar = r.body.profile.avatar;
  assert.match(firstAvatar, new RegExp(`^/uploads/avatars/${userId}-.*\\.png$`));
  assert.ok(fs.existsSync(path.resolve(firstAvatar.slice(1))), "file stored");
  const svg = await call("POST", "/auth/profile/avatar", upload(Buffer.from("<svg onload=alert(1)></svg>"), "x.png"));
  assert.equal(svg.status, 400, "SVG (disguised as .png) refused");
  r = await call("POST", "/auth/profile/avatar", upload(PNG, "again.png"));
  assert.ok(!fs.existsSync(path.resolve(firstAvatar.slice(1))), "the replaced picture is deleted");
  const second = r.body.profile.avatar;
  r = await call("DELETE", "/auth/profile/avatar");
  assert.equal(r.body.profile.avatar, null);
  assert.ok(!fs.existsSync(path.resolve(second.slice(1))), "removed picture's file deleted");
  ok("picture upload (type checked from the bytes), replace and remove");

  const newEmail = `profile-test-new-${Date.now()}@example.com`;
  assert.equal((await call("PUT", "/auth/profile/email", { email: newEmail, currentPassword: "wrong" })).body.code, "WRONG_PASSWORD");
  const [[someone]] = await pool.query("SELECT email FROM users WHERE id <> ? LIMIT 1", [userId]);
  const taken = await call("PUT", "/auth/profile/email", { email: someone.email, currentPassword: "oldpass123" });
  assert.equal(taken.status, 400);
  assert.doesNotMatch(taken.body.message, /exist|taken|registered/i, "neutral wording");
  r = await call("PUT", "/auth/profile/email", { email: newEmail, currentPassword: "oldpass123" });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.email, newEmail);
  assert.equal(r.body.profile.emailVerified, false, "new address must be confirmed again");
  ok("email change needs the current password, refuses a used address neutrally, resets verification");

  assert.equal((await call("POST", "/auth/profile/password", { currentPassword: "wrong", newPassword: "newpass123" })).body.code, "WRONG_PASSWORD");
  assert.equal((await call("POST", "/auth/profile/password", { currentPassword: "oldpass123", newPassword: "123" })).status, 400, "too short");
  assert.equal((await call("POST", "/auth/profile/password", { currentPassword: "oldpass123", newPassword: "oldpass123" })).status, 400, "same password");
  r = await call("POST", "/auth/profile/password", { currentPassword: "oldpass123", newPassword: "newpass123" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token, "a fresh token for this browser");
  const oldToken = token;
  assert.equal((await call("GET", "/auth/profile", null, oldToken)).status, 401, "old sessions are signed out");
  token = r.body.token;
  assert.equal((await call("GET", "/auth/profile")).status, 200, "the fresh token works");
  const [[u]] = await pool.query("SELECT password FROM users WHERE id = ?", [userId]);
  assert.ok(await bcrypt.compare("newpass123", u.password));
  ok("password change: current password checked, other sessions signed out, this one continues");

  console.log("✅ My profile: all checks passed");
} finally {
  const [[u]] = await pool.query("SELECT avatar FROM users WHERE id = ?", [userId]);
  if (u?.avatar) fs.promises.unlink(path.resolve(u.avatar.slice(1))).catch(() => {});
  await pool.query("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId]).catch(() => {});
  await pool.query("DELETE FROM agencies WHERE owner_id = ?", [userId]); // cascades its workspace data
  await pool.query("DELETE FROM users WHERE id = ?", [userId]);
  server.close();
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
