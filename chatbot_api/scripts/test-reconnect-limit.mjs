/**
 * Read-only check of the reconnect rule (utils/botAccountLimit.js): an
 * account that is already a bot account of the workspace never counts
 * against max_bot_accounts; only new ones do, and a batch that doesn't fit
 * is refused as a whole with a clear message. Uses the real DB, writes nothing.
 * Run: node scripts/test-reconnect-limit.mjs
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { countNewAccounts, assertRoomForNewAccounts } from "../utils/botAccountLimit.js";

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failures++; console.error(`❌ ${name}\n   ${err.message}`); }
}

try {
  const [[fb]] = await pool.query("SELECT agency_id, fb_page_id FROM integrations WHERE platform = 'FACEBOOK' AND fb_page_id IS NOT NULL LIMIT 1");
  const [[ig]] = await pool.query("SELECT agency_id, ig_account_id FROM integrations WHERE platform = 'INSTAGRAM' AND ig_account_id IS NOT NULL LIMIT 1");
  const [[wa]] = await pool.query("SELECT agency_id, wa_phone_number_id FROM integrations WHERE platform = 'WHATSAPP' AND wa_phone_number_id IS NOT NULL LIMIT 1");

  if (fb) {
    await check("Facebook: reconnecting an already-connected Page counts 0", async () => {
      assert.equal(await countNewAccounts(fb.agency_id, "FACEBOOK", "fb_page_id", [fb.fb_page_id]), 0);
    });
    await check("Facebook: a Page not connected yet counts 1", async () => {
      assert.equal(await countNewAccounts(fb.agency_id, "FACEBOOK", "fb_page_id", ["test-not-a-real-page-1"]), 1);
    });
    await check("Facebook: mixed selection counts only the new Pages, duplicates once", async () => {
      assert.equal(await countNewAccounts(fb.agency_id, "FACEBOOK", "fb_page_id", [fb.fb_page_id, "new-a", "new-a", "new-b", null]), 2);
    });
    await check("Facebook: the same Page in ANOTHER workspace is new there (never matched across tenants)", async () => {
      const [[other]] = await pool.query("SELECT id FROM agencies WHERE id <> ? LIMIT 1", [fb.agency_id]);
      const [[dupe]] = await pool.query("SELECT 1 x FROM integrations WHERE agency_id = ? AND platform='FACEBOOK' AND fb_page_id = ?", [other.id, fb.fb_page_id]);
      if (!dupe) assert.equal(await countNewAccounts(other.id, "FACEBOOK", "fb_page_id", [fb.fb_page_id]), 1);
    });
    await check("Pure reconnect passes the limit check even with no room at all", async () => {
      await assertRoomForNewAccounts(fb.agency_id, null, 0); // must not throw
    });
  }
  if (ig) {
    await check("Instagram: reconnecting counts 0 / new counts 1", async () => {
      assert.equal(await countNewAccounts(ig.agency_id, "INSTAGRAM", "ig_account_id", [ig.ig_account_id]), 0);
      assert.equal(await countNewAccounts(ig.agency_id, "INSTAGRAM", "ig_account_id", ["new-ig"]), 1);
    });
  }
  if (wa) {
    await check("WhatsApp: re-running signup for the same number counts 0", async () => {
      assert.equal(await countNewAccounts(wa.agency_id, "WHATSAPP", "wa_phone_number_id", [wa.wa_phone_number_id]), 0);
    });
  }
  await check("Unsupported column is refused (no SQL built from input)", async () => {
    await assert.rejects(() => countNewAccounts(1, "FACEBOOK", "access_token", ["x"]));
  });
  await check("A batch that can't fit is refused as a whole with the 'exceed your plan's limit' message", async () => {
    const [agencies] = await pool.query("SELECT id FROM agencies WHERE account_type <> 'PLATFORM' ORDER BY id");
    for (const a of agencies) {
      try {
        await assertRoomForNewAccounts(a.id, null, 1_000_000, { batch: true });
      } catch (err) {
        if (!["LIMIT_EXCEEDED", "RESELLER_POOL_LIMIT_EXCEEDED"].includes(err.code)) continue; // e.g. module disabled
        assert.match(err.message, /exceed your plan's limit, so nothing was imported/);
        console.log("   workspace " + a.id + ": " + err.message.slice(0, 170) + "…");
        return;
      }
    }
    console.log("   (no workspace has a bot-account limit — nothing to refuse)");
  });
} finally {
  await pool.end();
}
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll reconnect-limit checks passed");
