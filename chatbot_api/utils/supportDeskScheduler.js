/**
 * Support Desk auto-close scheduler — a SOLVED ticket with no further
 * reply for AUTO_CLOSE_AFTER_DAYS is moved to CLOSED automatically, a
 * standard helpdesk behavior (WHMCS/Zendesk-style) that keeps queues from
 * accumulating tickets nobody will ever formally close. Runs every 60
 * seconds, matching every other scheduler in this codebase (see
 * utils/broadcastScheduler.js).
 */
import pool from "../db.js";
import { emitToAgency, emitToTicket } from "./socket.js";

const AUTO_CLOSE_AFTER_DAYS = 5;
const INTERVAL_MS = 60 * 1000;

async function runOnce() {
  try {
    const [tickets] = await pool.query(
      `SELECT id, helpdesk_agency_id, requester_agency_id FROM support_tickets
       WHERE status = 'SOLVED' AND solved_at IS NOT NULL
         AND solved_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [AUTO_CLOSE_AFTER_DAYS]
    );
    for (const t of tickets) {
      await pool.query("UPDATE support_tickets SET status='CLOSED', closed_at=NOW(), last_activity_at=NOW() WHERE id=?", [t.id]);
      await pool.query(
        "INSERT INTO support_ticket_activity (ticket_id, actor_user_id, event_type, from_value, to_value) VALUES (?, NULL, 'STATUS_CHANGED', 'SOLVED', 'CLOSED')",
        [t.id]
      );
      emitToTicket(t.id, "support_ticket:updated", { ticketId: t.id, status: "CLOSED" });
      emitToAgency(t.helpdesk_agency_id, "support_ticket:updated", { ticketId: t.id, status: "CLOSED" });
      emitToAgency(t.requester_agency_id, "support_ticket:updated", { ticketId: t.id, status: "CLOSED" });
    }
  } catch (err) {
    console.error("Support Desk auto-close scheduler error:", err);
  }
}

export function startSupportDeskScheduler() {
  setInterval(runOnce, INTERVAL_MS);
  console.log("🎫 Support Desk auto-close scheduler started (runs every 60 seconds)");
}
