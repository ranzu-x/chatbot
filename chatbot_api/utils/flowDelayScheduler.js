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

// Optimistic-lock claim — same idiom as sequenceRunner.js's claimSubscriber /
// socialPostScheduler.js's claim: bump the due column forward as a "claimed"
// placeholder, conditioned on it still matching the exact value just read.
// If the resumed run needs to re-pause later (e.g. it hits ANOTHER node with
// its own delay), that write overwrites this placeholder with a real value;
// if it finishes without pausing again, that write clears it to NULL.
async function claimSession(sessionId, previousDelayNextRunAt) {
  const [result] = await pool.query(
    `UPDATE flow_sessions SET delay_next_run_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)
     WHERE id = ? AND status = 'ACTIVE' AND delay_next_run_at = ?`,
    [sessionId, previousDelayNextRunAt]
  );
  return result.affectedRows === 1;
}

async function resumeOneSession(session) {
  const [[row]] = await pool.query(
    `SELECT cv.contact_id, cv.integration_id, cv.platform AS conversationPlatform, cv.bot_paused AS conversationBotPaused,
            i.id AS integrationId, i.platform AS integrationPlatform, i.access_token, i.wa_phone_number_id,
            i.fb_page_id, i.ig_account_id, i.tiktok_open_id,
            c.id AS contactId, c.name AS contactName, c.phone AS contactPhone, c.email AS contactEmail,
            c.external_id AS contactExternalId, c.platform AS contactPlatform, c.bot_paused AS contactBotPaused
     FROM conversations cv
     LEFT JOIN integrations i ON i.id = cv.integration_id
     JOIN contacts c ON c.id = cv.contact_id
     WHERE cv.id = ?`,
    [session.conversation_id]
  );

  if (!row) {
    console.warn(`[Flow Delay] Conversation ${session.conversation_id} missing for session ${session.id}; completing.`);
    await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE id = ?", [session.id]);
    return;
  }

  const conversation = {
    id: session.conversation_id,
    contact_id: row.contact_id,
    integration_id: row.integration_id,
    platform: row.conversationPlatform,
    bot_paused: row.conversationBotPaused,
  };
  const contact = {
    id: row.contactId, name: row.contactName, phone: row.contactPhone, email: row.contactEmail,
    external_id: row.contactExternalId, platform: row.contactPlatform, bot_paused: row.contactBotPaused,
  };
  const integration = row.integrationId
    ? {
        id: row.integrationId, platform: row.integrationPlatform, access_token: row.access_token,
        wa_phone_number_id: row.wa_phone_number_id, fb_page_id: row.fb_page_id, ig_account_id: row.ig_account_id,
        tiktok_open_id: row.tiktok_open_id,
      }
    : null;
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
        const claimed = await claimSession(session.id, session.delay_next_run_at);
        if (!claimed) continue; // another tick already grabbed this one
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
  console.log("⏱️  Flow Delay scheduler started (runs every 60 seconds)");
  setInterval(processDueFlowDelays, 60000);
}
