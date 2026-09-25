import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { requiredTeamPermission, teamPermissions } from "../middleware/teamPermissions.js";

test("writes map to the right Team Rules key", () => {
  const cases = [
    ["DELETE", "/flows/12", "bot_manager.delete"],
    ["POST", "/flows/12/clone", "bot_manager.special"],
    ["PUT", "/flows/12", "bot_manager.update"],
    ["POST", "/conversations/5/messages", "live_chat.update"],
    ["DELETE", "/conversations/5/messages", "live_chat.delete"],
    ["PATCH", "/conversations/5/assign", "live_chat.special"],
    ["POST", "/contacts/import", "subscribers.special"],
    ["DELETE", "/contacts/9", "subscribers.delete"],
    ["DELETE", "/contacts/9/tags/vip", "subscribers.update"],
    ["DELETE", "/integrations/google-sheets", "google_sheets.delete"],
    ["DELETE", "/integrations/4", "connect_account.delete"],
    ["POST", "/channels/webchat", "webchat_bot.create"],
    ["POST", "/channels/whatsapp", "connect_account.update"],
    ["POST", "/broadcasts/3/send", "broadcast.special"],
    ["POST", "/social-posts/publish", "social_posting.special"],
  ];
  for (const [method, path, key] of cases) assert.equal(requiredTeamPermission(method, path), key, `${method} ${path}`);
});

test("public and personal writes stay open", () => {
  assert.equal(requiredTeamPermission("POST", "/appointments/book-public"), null);
  assert.equal(requiredTeamPermission("POST", "/broadcasts/audience-preview"), null);
  assert.equal(requiredTeamPermission("PATCH", "/conversations/5/read"), undefined);
  assert.equal(requiredTeamPermission("POST", "/follow-ups"), undefined);
});

test("every key the guard checks exists in the Team Rules matrix", () => {
  const src = fs.readFileSync(new URL("../middleware/teamPermissions.js", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../../chatbot_ui/src/Pages/Roles/teamRulesConfig.js", import.meta.url), "utf8");
  const used = new Set([...src.matchAll(/"([a-z_]+\.(?:create|update|delete|special|advanced|translator))"/g)].map((m) => m[1]));
  for (const f of src.matchAll(/crud\("[^"]+", "([a-z_]+)"\)/g)) for (const a of ["create", "update", "delete"]) used.add(`${f[1]}.${a}`);
  for (const key of used) assert.ok(ui.includes(`'${key}'`), `${key} is not in teamRulesConfig.js`);
});

test("owners, platform staff, reads and anonymous calls are never gated", async () => {
  const run = (req) => new Promise((resolve) => teamPermissions(req, { status: () => ({ json: () => resolve("blocked") }) }, () => resolve("next")));
  assert.equal(await run({ method: "DELETE", path: "/flows/1", tenant: { role: "RESELLER", userId: 1, agencyId: 1 } }), "next");
  assert.equal(await run({ method: "DELETE", path: "/flows/1", tenant: { role: "ADMIN", userId: 1, agencyId: 1 } }), "next");
  assert.equal(await run({ method: "GET", path: "/flows/1", tenant: { role: "USER", userId: 1, agencyId: 1 } }), "next");
  assert.equal(await run({ method: "DELETE", path: "/flows/1" }), "next");
});
