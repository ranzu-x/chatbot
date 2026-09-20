import pool from "../db.js";
import { processFlow } from "./flowEngine.js";

/**
 * Per-node "Delay before this step" resume poller (Flow Builder — see
 * migrate_flow_delay.js and flowEngine.js's Main Execution Loop). Mirrors
 * utils/sequenceRunner.js's own claim-then-process shape exactly: poll for
 * due, ACTIVE flow_sessions rows, claim each with an optimistic lock (so two
 * overlapping ticks never both resume the same paused session), then hand it
 * to flowEngine.js's processFlow via `resumeContext`, which continues
 * exactly where the paused node left off — never a blocking sleep, so a
 * delay of hours never holds a live connection open.
 */

// Optimistic-lock claim — bump the due column forward as a "claimed"
// placeholder. Conditioned on status = 'ACTIVE' and delay_next_run_at <= NOW()
// so overlapping ticks or timer callbacks never double-process.
async function claimSession(sessionId) {
  const [result] = await pool.query(
    `UPDATE flow_sessions SET delay_next_run_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)
     WHERE id = ? AND status = 'ACTIVE' AND delay_next_run_at IS NOT NULL AND delay_next_run_at <= NOW()`,
    [sessionId]
  );
  return result.affectedRows === 1;
}

export async function resumeSessionById(sessionId) {
  const [[session]] = await pool.query(
    "SELECT * FROM flow_sessions WHERE id = ? AND status = 'ACTIVE' AND delay_next_run_at IS NOT NULL",
    [sessionId]
  );
  if (!session) return;
  // Atomically claim the session so scheduler poll ticks don't collide
  const [result] = await pool.query(
    `UPDATE flow_sessions SET delay_next_run_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)
     WHERE id = ? AND status = 'ACTIVE' AND delay_next_run_at IS NOT NULL`,
    [sessionId]
  );
  if (result.affectedRows !== 1) return;
  await resumeOneSession(session);
}

/**
 * For short conversational delays (e.g. 2s, 3s, 5s), schedules an in-memory
 * setTimeout so the bot responds immediately when the delay expires rather
 * than waiting for the next cron poll.
 */
export function scheduleFlowDelayResume(sessionId, delaySeconds) {
  if (typeof delaySeconds !== "number" || delaySeconds <= 0 || delaySeconds > 120) {
    return; // Longer delays are handled by the background poller
  }
  const delayMs = Math.max(1, delaySeconds) * 1000;
  setTimeout(() => {
    resumeSessionById(sessionId).catch((err) => {
      console.error(`[Flow Delay] Timer resume failed for session ${sessionId}:`, err.message);
    });
  }, delayMs);
}

async function resumeOneSession(session) {
  // Full rows, not a hand-picked column list: the live inbound path hands
  // processFlow whole conversation / contact / integration rows, and the send
  // layer reads fields off them that a partial join silently dropped
  // (integration.agency_id, app_secret, per-channel tokens…). Note that
  // `conversations` has no `platform` column — the channel comes from the
  // integration (or the contact) — selecting cv.platform made every resume fail.
  const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [session.conversation_id]);
  const [[contact]] = conversation
    ? await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id])
    : [[null]];

  if (!conversation || !contact) {
    console.warn(`[Flow Delay] Conversation/contact missing for session ${session.id}; completing.`);
    await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL WHERE id = ?", [session.id]);
    return;
  }

  let integration = null;
  if (conversation.integration_id) {
    const [[integ]] = await pool.query("SELECT * FROM integrations WHERE id = ?", [conversation.integration_id]);
    integration = integ || null;
  }
  const platform = conversation.platform || integration?.platform || contact.platform || "WEBCHAT";
  const resumeNodeId = session.active_context === "USER_INPUT_FLOW" ? session.uif_current_node_id : session.current_node_id;

  try {
    await processFlow(session.agency_id, platform, conversation, contact, "", integration, "TEXT", null, {
      session,
      skipDelayForNodeId: resumeNodeId,
    });
  } catch (err) {
    console.error(`[Flow Delay] Resume failed for session ${session.id}:`, err.message);
  }
}

export async function processDueFlowDelays() {
  try {
    const [dueSessions] = await pool.query(
      `SELECT * FROM flow_sessions
       WHERE status = 'ACTIVE' AND delay_next_run_at IS NOT NULL AND delay_next_run_at <= NOW()
       LIMIT 50`
    );
    for (const session of dueSessions) {
      try {
        const claimed = await claimSession(session.id);
        if (!claimed) continue; // another tick or timer already grabbed this one
        await resumeOneSession(session);
      } catch (err) {
        console.error(`[Flow Delay] Session ${session.id} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Flow Delay] Poll failed:", err.message);
  }
}

export function startFlowDelayScheduler() {
  console.log("⏱️  Flow Delay scheduler started (runs every 5 seconds)");
  // Run an immediate check on startup for any overdue sessions
  processDueFlowDelays().catch(() => {});
  setInterval(processDueFlowDelays, 5000);
}
