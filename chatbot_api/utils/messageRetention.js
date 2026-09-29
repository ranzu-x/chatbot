import pool from "../db.js";
import { lockedJob } from "./jobLock.js";

/**
 * Inbox message retention: messages older than MESSAGE_RETENTION_DAYS (default
 * 90; 0 switches it off) are deleted by a background job, never during a
 * request.
 *
 * - Batched by the `messages(created_at)` index (idx_msg_created), one short
 *   autocommit statement per batch with a pause in between, and a time budget
 *   per run — a large backlog is worked off over several runs instead of one
 *   long transaction. Safe to run again at any time (and on several instances:
 *   lockedJob lets only one run at once).
 * - Nothing references a message row by foreign key; message search reads the
 *   `messages` table itself (no separate index), so deleted messages disappear
 *   from search at the same moment. Media files are NOT deleted: chat
 *   attachments sent by agents/flows live in the shared /uploads folder and the
 *   same file is often still used by a flow, template or broadcast; incoming
 *   WhatsApp/Meta media is never stored (it's fetched from Meta on demand).
 * - Each affected conversation gets `history_pruned_at` (the Inbox says older
 *   messages were removed) and `inbound_pruned` when a customer message went —
 *   "first message" flow triggers count inbound messages, so they check it
 *   and don't re-fire on an old chat whose history was pruned.
 * - The cutoff is computed in SQL (NOW() - INTERVAL), the same clock that
 *   stamped created_at.
 */
export const RETENTION_DAYS = (() => {
  const raw = process.env.MESSAGE_RETENTION_DAYS;
  if (raw === undefined || raw === "") return 90;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 90;
})();
const BATCH_SIZE = Math.min(20000, Math.max(100, Number(process.env.MESSAGE_RETENTION_BATCH) || 2000));
const MAX_RUN_MS = 10 * 60 * 1000;
const PAUSE_MS = 200;
const INTERVAL_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `conversationId` limits a run to one chat (tests use it so they never touch real data). */
export async function pruneOldMessages({ days = RETENTION_DAYS, batchSize = BATCH_SIZE, maxMs = MAX_RUN_MS, pauseMs = PAUSE_MS, conversationId = null } = {}) {
  if (!days) return { deleted: 0, batches: 0, done: true };
  const started = Date.now();
  let deleted = 0;
  let batches = 0;
  for (;;) {
    const [rows] = await pool.query(
      `SELECT id, conversation_id, direction FROM messages
        WHERE created_at < NOW() - INTERVAL ? DAY${conversationId ? " AND conversation_id = ?" : ""}
        ORDER BY created_at, id LIMIT ?`,
      conversationId ? [days, conversationId, batchSize] : [days, batchSize]
    );
    if (!rows.length) return { deleted, batches, done: true };

    const convIds = [...new Set(rows.map((r) => r.conversation_id))];
    const inboundConvIds = [...new Set(rows.filter((r) => r.direction === "INBOUND").map((r) => r.conversation_id))];
    // Mark first: a crash between the two statements leaves a flag without a
    // deletion (harmless), never a deletion without the flag.
    await pool.query(
      `UPDATE conversations SET history_pruned_at = NOW(),
              inbound_pruned = IF(id IN (?), 1, inbound_pruned)
        WHERE id IN (?)`,
      [inboundConvIds.length ? inboundConvIds : [0], convIds]
    );
    const [del] = await pool.query(
      "DELETE FROM messages WHERE id IN (?) AND created_at < NOW() - INTERVAL ? DAY",
      [rows.map((r) => r.id), days]
    );
    deleted += del.affectedRows;
    batches++;

    if (rows.length < batchSize) return { deleted, batches, done: true };
    if (Date.now() - started > maxMs) return { deleted, batches, done: false };
    await sleep(pauseMs);
  }
}

export function startMessageRetentionScheduler() {
  if (!RETENTION_DAYS) {
    console.log("🧹 Message retention is off (MESSAGE_RETENTION_DAYS=0)");
    return;
  }
  const run = lockedJob("message-retention", async () => {
    try {
      const r = await pruneOldMessages();
      if (r.deleted) {
        console.log(`🧹 Message retention: deleted ${r.deleted} message(s) older than ${RETENTION_DAYS} days in ${r.batches} batch(es)${r.done ? "" : " — more left for the next run"}`);
      }
    } catch (err) {
      console.error("[MessageRetention] run failed:", err.message);
    }
  });
  console.log(`🧹 Message Retention Scheduler started (hourly, deletes messages older than ${RETENTION_DAYS} days)`);
  setTimeout(run, 60 * 1000);
  setInterval(run, INTERVAL_MS);
}
