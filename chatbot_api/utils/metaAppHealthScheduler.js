import pool from "../db.js";
import { testMetaAppCredentials } from "./metaAppHealth.js";
import { failoverAgencyPlatformGroup } from "./metaAppFailover.js";

// Periodically probes every agency's ACTIVE Meta app (WhatsApp and
// Messenger+Instagram slots independently) and auto-fails-over to a healthy
// standby the moment one goes DISABLED. Scoped to "app disabled, Business
// still healthy" — see utils/metaAppFailover.js and the Settings UI's
// business_manager_label guidance for why a standby only works when it's
// under the same Business Manager as the app it's replacing.
export async function processMetaAppHealthChecks() {
  const [activeRows] = await pool.query(
    "SELECT * FROM meta_app_pool WHERE slot_role = 'ACTIVE' AND is_configured = 1 AND is_active = 1"
  );

  for (const row of activeRows) {
    try {
      const result = await testMetaAppCredentials(row.app_id, row.app_secret);
      const newStatus = result.healthy ? "HEALTHY" : (result.isDisabled ? "DISABLED" : "DEGRADED");
      await pool.query(
        "UPDATE meta_app_pool SET health_status = ?, last_health_check_at = NOW(), last_health_error = ? WHERE id = ?",
        [newStatus, result.healthy ? null : String(result.error?.message || "").slice(0, 500), row.id]
      );

      if (newStatus === "DISABLED") {
        await failoverAgencyPlatformGroup(row.agency_id, row.platform_group, { reason: result.error?.message });
      }
    } catch (err) {
      console.error(`[MetaAppHealth] check failed for pool row ${row.id} (agency ${row.agency_id}, ${row.platform_group}):`, err.message);
    }
  }
}

export function startMetaAppHealthScheduler() {
  const intervalMs = Number(process.env.META_APP_HEALTH_INTERVAL_MS) || 24 * 60 * 60 * 1000;
  const label = intervalMs % (60 * 60 * 1000) === 0
    ? `${Math.round(intervalMs / 3600000)} hour(s)`
    : `${Math.round(intervalMs / 60000)} minutes`;
  console.log(`🩺 Meta App Health Scheduler started (runs every ${label})`);
  processMetaAppHealthChecks();
  setInterval(processMetaAppHealthChecks, intervalMs);
}
