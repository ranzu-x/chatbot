import pool from "../db.js";
import { syncConnection } from "./commerceService.js";

// ─── SYNC ALL ACTIVE STORE CONNECTIONS ───────────────────────────────────────
export async function processCommerceSyncs() {
  try {
    const [connections] = await pool.query("SELECT * FROM commerce_connections WHERE is_active = 1");
    if (!connections.length) return;

    for (const connection of connections) {
      try {
        await syncConnection(connection);
        await pool.query("UPDATE commerce_connections SET last_synced_at = NOW(), last_sync_error = NULL WHERE id = ?", [connection.id]);
      } catch (err) {
        const msg = err.response?.data?.errors || err.message;
        console.error(`[CommerceSync] Connection #${connection.id} (${connection.platform}) failed:`, msg);
        await pool.query("UPDATE commerce_connections SET last_sync_error = ? WHERE id = ?", [String(msg).slice(0, 500), connection.id]);
      }
    }
  } catch (err) {
    console.error("[CommerceSync] Fatal error:", err);
  }
}

// ─── START SCHEDULER (runs every 15 minutes — a product catalog doesn't
// change often enough to justify the same 60s cadence broadcasts/social
// posts use, and hammering a store's REST API that often risks rate limits) ──
export function startCommerceSyncScheduler() {
  console.log("🛒 Commerce Sync Scheduler started (runs every 15 minutes)");
  processCommerceSyncs();
  setInterval(processCommerceSyncs, 15 * 60 * 1000);
}
