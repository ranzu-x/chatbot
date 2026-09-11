import pool from "../db.js";
import { emitToAgency, emitToConversation } from "./socket.js";

/**
 * Auto-resume-after-human-takeover poller. Mirrors utils/flowDelayScheduler.js's
 * shape (same due-column polling idiom every scheduler in this app uses —
 * see sequenceRunner.js/socialPostScheduler.js/flowDelayScheduler.js). Unlike
 * those, resuming here is a single atomic UPDATE (no external send/flow-engine
 * call needed), so no separate optimistic-lock "claim" step is needed — the
 * `WHERE ... auto_resume_at <= NOW()` UPDATE itself is the atomic operation.
 */
export async function processDueBotResumes() {
  try {
    const [dueRows] = await pool.query(
      `SELECT id, agency_id, contact_id FROM conversations
       WHERE bot_paused = 1 AND auto_resume_at IS NOT NULL AND auto_resume_at <= NOW()
       LIMIT 100`
    );
    for (const row of dueRows) {
      try {
        const [result] = await pool.query(
          `UPDATE conversations SET bot_paused = 0, paused_by_user_id = NULL, paused_at = NULL,
             pause_reason = NULL, auto_resume_at = NULL
           WHERE id = ? AND bot_paused = 1 AND auto_resume_at IS NOT NULL AND auto_resume_at <= NOW()`,
          [row.id]
        );
        if (result.affectedRows !== 1) continue; // another tick (or a manual resume) already handled it
        await pool.query(`UPDATE contacts SET bot_paused = 0 WHERE id = ?`, [row.contact_id]);
        emitToAgency(row.agency_id, "conversation_updated", { conversationId: row.id, botPaused: false, pauseReason: null });
        emitToConversation(row.id, "conversation_updated", { conversationId: row.id, botPaused: false, pauseReason: null });
      } catch (err) {
        console.error(`[Bot Resume] Conversation ${row.id} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Bot Resume] Poll failed:", err.message);
  }
}

export function startBotResumeScheduler() {
  console.log("🤖 Bot auto-resume scheduler started (runs every 60 seconds)");
  setInterval(processDueBotResumes, 60000);
}
