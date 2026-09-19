import pool from "../db.js";

// Bot error logs are diagnostic, not billing/audit records — keeping them
// indefinitely just grows bot_error_logs forever for no benefit. Purge
// anything older than 30 days, once a day (matches the cadence the Meta App
// Health Scheduler settled on — frequent enough that the table never grows
// unbounded, far too infrequent to be a load concern).
const RETENTION_DAYS = 30;

export async function purgeOldBotErrorLogs() {
  try {
    const [result] = await pool.query(
      "DELETE FROM bot_error_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [RETENTION_DAYS]
    );
    if (result.affectedRows > 0) {
      console.log(`🧹 Bot Error Log retention: purged ${result.affectedRows} entr${result.affectedRows === 1 ? "y" : "ies"} older than ${RETENTION_DAYS} days`);
    }
  } catch (err) {
    console.error("[BotErrorLogRetention] purge failed:", err.message);
  }
}

export function startBotErrorLogRetentionScheduler() {
  const intervalMs = 24 * 60 * 60 * 1000; // once a day
  console.log(`🧹 Bot Error Log Retention Scheduler started (runs daily, purges entries older than ${RETENTION_DAYS} days)`);
  purgeOldBotErrorLogs();
  setInterval(purgeOldBotErrorLogs, intervalMs);
}
