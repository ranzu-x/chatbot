import pool from "../db.js";
import { executeBroadcast } from "./broadcastRunner.js";

// ─── PROCESS DUE SCHEDULED BROADCASTS ──────────────────────────────────────
async function processDueBroadcasts() {
  try {
    const [due] = await pool.query(
      "SELECT id FROM broadcast_campaigns WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()"
    );
    for (const row of due) {
      console.log(`[BroadcastScheduler] Starting scheduled broadcast #${row.id}`);
      // Sequential, not parallel — executeBroadcast already paces its own
      // per-contact sends; running several campaigns' sends at once would
      // just contend for the same rate limits for no benefit.
      await executeBroadcast(row.id).catch((err) =>
        console.error(`[BroadcastScheduler] Broadcast #${row.id} failed:`, err.message)
      );
    }
  } catch (err) {
    console.error("[BroadcastScheduler] Fatal error:", err);
  }
}

// ─── START SCHEDULER (runs every 60 seconds) ───────────────────────────────
export function startBroadcastScheduler() {
  console.log("📣 Broadcast Scheduler started (runs every 60 seconds)");
  processDueBroadcasts();
  setInterval(processDueBroadcasts, 60 * 1000);
}
