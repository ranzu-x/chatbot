/**
 * Fires follow-up reminders when they come due.
 *
 * Every 30 seconds: find PENDING follow-ups whose due time has passed and that
 * have not alerted yet for that due time (alerted_at IS NULL), claim each one
 * atomically by stamping alerted_at (so two ticks, or two servers, never alert
 * twice), and push a `follow_up_due` event to the person it is for: the
 * assignee if there is one, otherwise whoever created it.
 *
 * Snoozing or rescheduling sets alerted_at back to NULL, which is all it takes
 * for the reminder to fire again at its new time.
 *
 * A reminder whose person has no open browser tab isn't lost: it stays PENDING
 * and past due, so it shows in that person's inbox bell (status OVERDUE) the
 * next time they open the inbox.
 */
import pool from "../db.js";
import { emitToUser } from "./socket.js";

const TICK_MS = 30000;

export async function processDueFollowUps({ emit = emitToUser } = {}) {
  const [due] = await pool.query(
    `SELECT f.id, f.agency_id, f.contact_id, f.conversation_id, f.title, f.note, f.due_at, f.snooze_count,
            f.created_by_user_id, ap.user_id AS assignedUserId, c.name AS contactName
     FROM follow_ups f
     JOIN contacts c ON c.id = f.contact_id
     LEFT JOIN agent_profiles ap ON ap.id = f.assigned_to_agent_profile_id
     WHERE f.status = 'PENDING' AND f.alerted_at IS NULL AND f.due_at <= NOW()
     ORDER BY f.due_at ASC
     LIMIT 100`
  );

  let fired = 0;
  for (const f of due) {
    // Claim: only the tick that flips alerted_at from NULL gets to alert.
    const [claim] = await pool.query(
      "UPDATE follow_ups SET alerted_at = NOW() WHERE id = ? AND alerted_at IS NULL AND status = 'PENDING'",
      [f.id]
    );
    if (claim.affectedRows !== 1) continue;

    const targetUserId = f.assignedUserId || f.created_by_user_id;
    emit(targetUserId, "follow_up_due", {
      id: f.id,
      agencyId: f.agency_id,
      title: f.title,
      description: f.note || "",
      dueAt: f.due_at,
      contactId: f.contact_id,
      contactName: f.contactName,
      conversationId: f.conversation_id,
      snoozeCount: f.snooze_count,
    });
    fired++;
  }
  return fired;
}

export function startFollowUpScheduler() {
  console.log("⏰ Follow-up reminder scheduler started (runs every 30 seconds)");
  setInterval(async () => {
    try {
      await processDueFollowUps();
    } catch (err) {
      console.error("[Follow-up scheduler] tick failed:", err.message);
    }
  }, TICK_MS);
}
