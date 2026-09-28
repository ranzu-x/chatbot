/**
 * WhatsApp usernames / BSUID — one subscriber per person.
 * Real DB, opt-in: `npm run test:wa-identity`. Creates its own subscribers on
 * the first WhatsApp bot account it finds and deletes them afterwards.
 *
 *  1. An imported phone subscriber writes in with phone + BSUID → same row, BSUID attached.
 *  2. A stranger writes with only a BSUID (username, phone hidden) → a new row keyed by the BSUID.
 *  3. That person later arrives with phone + BSUID while an imported row with that phone
 *     exists → the two are merged into the phone row (conversation, messages, label move).
 *  4. user_id_update moves the subscriber to the new BSUID.
 *  5. waRecipient: phone → `to`, BSUID → `recipient`.
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import {
  resolveWhatsAppSender, attachWhatsAppIdentity, handleUserIdUpdate, waRecipient, isBsuid,
} from "../utils/whatsappIdentity.js";

const tag = String(Date.now()).slice(-7);
const created = { contacts: new Set(), labels: [] };
let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✔ ${name}`); };

async function newContact(agencyId, externalId, extra = {}) {
  const [r] = await pool.query(
    "INSERT INTO contacts (agency_id, platform, external_id, name, phone, source) VALUES (?, 'WHATSAPP', ?, ?, ?, ?)",
    [agencyId, externalId, extra.name || externalId, extra.phone ?? null, extra.source || "INCOMING"]
  );
  created.contacts.add(r.insertId);
  return r.insertId;
}

async function main() {
  const [[integration]] = await pool.query("SELECT id, agency_id FROM integrations WHERE platform = 'WHATSAPP' ORDER BY id LIMIT 1");
  if (!integration) throw new Error("No WhatsApp bot account in this database to test with");
  const agencyId = integration.agency_id;
  const integrationId = integration.id;
  console.log(`WhatsApp identity test on workspace ${agencyId}, bot account ${integrationId}\n`);

  // 1 ─ imported phone subscriber, phone + BSUID arrive
  const phoneA = `99900${tag}1`;
  const bsuidA = `BD.TEST${tag}A`;
  const importedA = await newContact(agencyId, phoneA, { phone: phoneA, source: "IMPORT", name: "Imported A" });
  let res = await resolveWhatsAppSender({ agencyId, integrationId, phone: phoneA, userId: bsuidA, username: "alpha" });
  assert.equal(res.contactId, importedA);
  assert.equal(res.externalId, phoneA);
  const [[idA]] = await pool.query("SELECT contact_id FROM contact_wa_identities WHERE agency_id = ? AND user_id = ?", [agencyId, bsuidA]);
  assert.equal(idA.contact_id, importedA);
  ok("phone subscriber + (phone, BSUID) → same subscriber, BSUID + username stored");

  // 2 ─ BSUID only (username, phone hidden)
  const phoneB = `99900${tag}2`;
  const bsuidB = `BD.TEST${tag}B`;
  res = await resolveWhatsAppSender({ agencyId, integrationId, phone: undefined, userId: bsuidB, username: "bravo" });
  assert.equal(res.contactId, null);
  assert.equal(res.externalId, bsuidB);
  assert.ok(isBsuid(res.externalId));
  const hiddenB = await newContact(agencyId, bsuidB, { name: "Bravo" });
  await attachWhatsAppIdentity(agencyId, hiddenB, res.identity);
  const [conv] = await pool.query(
    "INSERT INTO conversations (agency_id, contact_id, integration_id, status, last_message_at, last_inbound_at) VALUES (?, ?, ?, 'OPEN', NOW(), NOW())",
    [agencyId, hiddenB, integrationId]
  );
  await pool.query("INSERT INTO messages (conversation_id, direction, type, body, is_read) VALUES (?, 'INBOUND', 'TEXT', 'hello from a username', 0)", [conv.insertId]);
  const [lab] = await pool.query("INSERT INTO labels (agency_id, name) VALUES (?, ?)", [agencyId, `wa-id-test-${tag}`]);
  created.labels.push(lab.insertId);
  await pool.query("INSERT INTO contact_labels (contact_id, label_id) VALUES (?, ?)", [hiddenB, lab.insertId]);
  res = await resolveWhatsAppSender({ agencyId, integrationId, userId: bsuidB });
  assert.equal(res.contactId, hiddenB);
  ok("BSUID only → subscriber keyed by the BSUID, found again on the next message");

  // 3 ─ an imported row with B's phone exists; B arrives with phone + BSUID → merge
  const importedB = await newContact(agencyId, phoneB, { phone: phoneB, source: "IMPORT", name: phoneB });
  res = await resolveWhatsAppSender({ agencyId, integrationId, phone: phoneB, userId: bsuidB });
  assert.equal(res.contactId, importedB);
  assert.equal(res.externalId, phoneB);
  const [[gone]] = await pool.query("SELECT COUNT(*) n FROM contacts WHERE id = ?", [hiddenB]);
  assert.equal(gone.n, 0);
  created.contacts.delete(hiddenB);
  const [[movedConv]] = await pool.query("SELECT contact_id FROM conversations WHERE id = ?", [conv.insertId]);
  assert.equal(movedConv.contact_id, importedB);
  const [[movedLabel]] = await pool.query("SELECT COUNT(*) n FROM contact_labels WHERE contact_id = ? AND label_id = ?", [importedB, lab.insertId]);
  assert.equal(movedLabel.n, 1);
  const [[survivor]] = await pool.query("SELECT name, wa_username FROM contacts WHERE id = ?", [importedB]);
  assert.equal(survivor.name, "Bravo", "a real name replaces a phone-number name");
  assert.equal(survivor.wa_username, "bravo");
  const [[audit]] = await pool.query("SELECT reason FROM contact_merges WHERE survivor_id = ? AND merged_id = ?", [importedB, hiddenB]);
  assert.equal(audit.reason, "SAME_WHATSAPP_USER");
  ok("username subscriber + imported phone subscriber → merged into one (conversation, messages, label, name moved)");

  // 3b ─ a BSUID-only subscriber with no phone row gets the phone as their id
  const bsuidC = `BD.TEST${tag}C`;
  const phoneC = `99900${tag}3`;
  const hiddenC = await newContact(agencyId, bsuidC);
  await attachWhatsAppIdentity(agencyId, hiddenC, { userId: bsuidC });
  res = await resolveWhatsAppSender({ agencyId, integrationId, phone: phoneC, userId: bsuidC });
  assert.equal(res.contactId, hiddenC);
  assert.equal(res.externalId, phoneC);
  ok("username subscriber whose phone appears (no phone row) → same subscriber, id becomes the phone");

  // 4 ─ user_id_update
  const bsuidA2 = `BD.TEST${tag}A2`;
  await handleUserIdUpdate(agencyId, integrationId, { wa_id: phoneA, user_id: { previous: bsuidA, current: bsuidA2 } });
  res = await resolveWhatsAppSender({ agencyId, integrationId, userId: bsuidA2 });
  assert.equal(res.contactId, importedA);
  ok("user_id_update → the new BSUID finds the same subscriber");

  // 5 ─ send fields
  assert.deepEqual(waRecipient(phoneA), { to: phoneA });
  assert.deepEqual(waRecipient(bsuidB), { recipient: bsuidB });
  ok("sends use `to` for a phone and `recipient` for a BSUID");
}

async function cleanup() {
  const ids = [...created.contacts];
  if (ids.length) {
    const [convs] = await pool.query("SELECT id FROM conversations WHERE contact_id IN (?)", [ids]);
    if (convs.length) await pool.query("DELETE FROM conversations WHERE id IN (?)", [convs.map((c) => c.id)]);
    await pool.query("DELETE FROM contact_merges WHERE survivor_id IN (?)", [ids]);
    await pool.query("DELETE FROM contacts WHERE id IN (?)", [ids]);
  }
  if (created.labels.length) await pool.query("DELETE FROM labels WHERE id IN (?)", [created.labels]);
}

try {
  await main();
  console.log(`\n${passed} checks passed`);
} catch (err) {
  console.error("\n✖ FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.error("cleanup:", e.message));
  await pool.end().catch(() => {});
}
