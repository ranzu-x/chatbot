/**
 * WhatsApp pacing against the real DB (no Meta call): a HELD broadcast log is
 * counted as held, not sent, and moves to sent when released. Throw-away rows.
 * Run: npm run test:wa-pacing
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { recountBroadcastStats } from "../utils/broadcastStats.js";

const [[agency]] = await pool.query("SELECT agency_id AS id FROM contacts ORDER BY id LIMIT 1");
const [[contact]] = await pool.query("SELECT id FROM contacts WHERE agency_id = ? LIMIT 1", [agency.id]);
const [camp] = await pool.query("INSERT INTO broadcast_campaigns (agency_id, name, platform, status, mode) VALUES (?, 'pacing-test', 'WHATSAPP', 'COMPLETED', 'TEMPLATE')", [agency.id]);
try {
  await pool.query("INSERT INTO broadcast_logs (campaign_id, contact_id, status, external_msg_id) VALUES (?, ?, 'HELD', 'wamid.test')", [camp.insertId, contact.id]);
  await recountBroadcastStats(camp.insertId);
  let [[c]] = await pool.query("SELECT sent_count, held_count FROM broadcast_campaigns WHERE id = ?", [camp.insertId]);
  assert.deepEqual([c.sent_count, c.held_count], [0, 1]);
  await pool.query("UPDATE broadcast_logs SET status = 'SENT' WHERE campaign_id = ?", [camp.insertId]);
  await recountBroadcastStats(camp.insertId);
  [[c]] = await pool.query("SELECT sent_count, held_count FROM broadcast_campaigns WHERE id = ?", [camp.insertId]);
  assert.deepEqual([c.sent_count, c.held_count], [1, 0]);
  console.log("✅ WhatsApp pacing: all checks passed");
} finally {
  await pool.query("DELETE FROM broadcast_logs WHERE campaign_id = ?", [camp.insertId]);
  await pool.query("DELETE FROM broadcast_campaigns WHERE id = ?", [camp.insertId]);
  await pool.end();
}
