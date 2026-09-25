import pool from "../db.js";
import { emitToAgency } from "./socket.js";

/**
 * Recomputes a broadcast campaign's counters from its broadcast_logs rows —
 * one row per subscriber, holding that subscriber's latest status — so the
 * counters can never add up to more than the subscribers actually targeted.
 *
 * Counters were previously incremented (sender: sent/failed; status webhook:
 * delivered/read/failed). A message WhatsApp first accepts and then reports
 * as failed (e.g. its header image couldn't be downloaded) was counted as
 * both sent AND failed, and the sender's running totals overwrote webhook
 * updates. Recounting avoids both.
 *
 * Sent = accepted and not failed (SENT / DELIVERED / READ). Delivered
 * includes read (READ implies it was delivered). Failed = FAILED.
 */
export async function recountBroadcastStats(campaignId, conn = pool) {
  await conn.query(
    `UPDATE broadcast_campaigns bc
        LEFT JOIN (
          SELECT campaign_id,
                 SUM(status IN ('SENT', 'DELIVERED', 'READ')) AS sent,
                 SUM(status IN ('DELIVERED', 'READ')) AS delivered,
                 SUM(status = 'READ') AS read_n,
                 SUM(status = 'FAILED') AS failed
            FROM broadcast_logs
           WHERE campaign_id = ?
           GROUP BY campaign_id
        ) s ON s.campaign_id = bc.id
        SET bc.sent_count = COALESCE(s.sent, 0),
            bc.delivered_count = COALESCE(s.delivered, 0),
            bc.read_count = COALESCE(s.read_n, 0),
            bc.failed_count = COALESCE(s.failed, 0)
      WHERE bc.id = ?`,
    [campaignId, campaignId]
  );
  await emitBroadcastUpdate(campaignId);
}

/**
 * Pushes a campaign's current status + counters to everyone signed in to its
 * workspace (socket event `broadcast_update`), so the Broadcasting page
 * updates live — Sending → Sent/Failed and the numbers — without a reload.
 * Never throws: a missing socket server must not break a send.
 */
export async function emitBroadcastUpdate(campaignId) {
  try {
    const [[c]] = await pool.query(
      `SELECT id, agency_id, status, total_targeted, sent_count, delivered_count, read_count, failed_count,
              error_message, scheduled_at, updated_at
         FROM broadcast_campaigns WHERE id = ?`,
      [campaignId]
    );
    if (!c) return;
    const { agency_id: agencyId, ...update } = c;
    emitToAgency(agencyId, "broadcast_update", update);
  } catch (err) {
    console.error("[Broadcast] live update failed:", err.message);
  }
}
