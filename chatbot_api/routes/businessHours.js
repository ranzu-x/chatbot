/**
 * Business Hours — per-bot-account (per-integration) weekly schedule.
 * Lives under Bot Manager → Bot Settings → Business Hours, scoped to
 * whichever bot/integration is selected there. See utils/businessHours.js
 * for the gate every inbound message is checked against, and
 * migrate_business_hours.js for the two tables.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { DAY_LABELS, isValidTimezone } from "../utils/businessHours.js";

const router = express.Router();
router.use("/business-hours", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// Sun/Sat off, Mon-Fri 09:00-17:00 — a generic default, only ever used when
// nothing has been saved yet (the settings row doesn't exist, or exists but
// no day rows do).
const DEFAULT_DAYS = [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
  day_of_week,
  is_off: day_of_week === 0 || day_of_week === 6,
  open_time: "09:00:00",
  close_time: "17:00:00",
}));

function getAgencyId(req) {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw Object.assign(new Error("No agency associated with this account"), { status: 400 });
  return agencyId;
}

async function assertOwnsIntegration(agencyId, integrationId) {
  const [[row]] = await pool.query("SELECT id, platform FROM integrations WHERE id = ? AND agency_id = ?", [integrationId, agencyId]);
  if (!row) throw Object.assign(new Error("Bot/integration not found"), { status: 404 });
  return row;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function normalizeTime(v, fallback) {
  if (typeof v !== "string") return fallback;
  const trimmed = v.length === 5 ? v : v.slice(0, 5);
  return TIME_RE.test(trimmed) ? `${trimmed}:00` : fallback;
}

// ─── GET settings + week schedule for one bot ─────────────────────────────
router.get("/business-hours/:integrationId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsIntegration(agencyId, req.params.integrationId);

    const [[settings]] = await pool.query(
      "SELECT * FROM business_hours_settings WHERE integration_id = ?",
      [req.params.integrationId]
    );
    const [dayRows] = await pool.query(
      "SELECT day_of_week, is_off, open_time, close_time FROM business_hours_days WHERE integration_id = ? ORDER BY day_of_week",
      [req.params.integrationId]
    );
    const days = DEFAULT_DAYS.map((d) => {
      const saved = dayRows.find((r) => r.day_of_week === d.day_of_week);
      const source = saved || d;
      return {
        dayOfWeek: d.day_of_week,
        label: DAY_LABELS[d.day_of_week],
        isOff: !!source.is_off,
        openTime: String(source.open_time || d.open_time).slice(0, 5),
        closeTime: String(source.close_time || d.close_time).slice(0, 5),
      };
    });

    let offHoursFlow = null;
    if (settings?.off_hours_flow_id) {
      const [[f]] = await pool.query("SELECT id, name FROM flows WHERE id = ? AND agency_id = ?", [settings.off_hours_flow_id, agencyId]);
      offHoursFlow = f || null;
    }

    return res.json({
      success: true,
      settings: {
        enabled: !!settings?.enabled,
        timezone: settings?.timezone || "UTC",
        sameEveryDay: settings ? !!settings.same_every_day : true,
        botRepliesOffHours: settings ? !!settings.bot_replies_off_hours : true,
        aiRepliesOffHours: settings ? !!settings.ai_replies_off_hours : true,
        offHoursFlowId: settings?.off_hours_flow_id || null,
        offHoursFlowName: offHoursFlow?.name || null,
      },
      days,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("Get business hours error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── SAVE settings + week schedule for one bot ────────────────────────────
router.put("/business-hours/:integrationId", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const agencyId = getAgencyId(req);
    const integrationId = Number(req.params.integrationId);
    await assertOwnsIntegration(agencyId, integrationId);

    const { enabled, timezone, sameEveryDay, botRepliesOffHours, aiRepliesOffHours, offHoursFlowId, days } = req.body || {};

    if (timezone !== undefined && timezone !== null && !isValidTimezone(timezone)) {
      return res.status(400).json({ success: false, message: `"${timezone}" isn't a recognized timezone.` });
    }
    if (!Array.isArray(days) || days.length !== 7 || new Set(days.map((d) => d.dayOfWeek)).size !== 7) {
      return res.status(400).json({ success: false, message: "All 7 days of the week are required." });
    }

    // BOT SCOPE (utils/botScope.js): the off-hours flow may only be one of THIS
    // bot account's own flows — never another bot's, never another workspace's.
    let resolvedFlowId = null;
    if (offHoursFlowId) {
      const [[flow]] = await pool.query(
        "SELECT id FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ?",
        [offHoursFlowId, agencyId, integrationId]
      );
      if (!flow) {
        return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: "That flow isn't one of this bot's own — pick this bot's own flow, or none." });
      }
      resolvedFlowId = flow.id;
    }

    const [[existing]] = await pool.query("SELECT * FROM business_hours_settings WHERE integration_id = ?", [integrationId]);
    const merged = {
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : (existing?.enabled ?? 0),
      timezone: timezone || existing?.timezone || "UTC",
      same_every_day: sameEveryDay !== undefined ? (sameEveryDay ? 1 : 0) : (existing?.same_every_day ?? 1),
      bot_replies_off_hours: botRepliesOffHours !== undefined ? (botRepliesOffHours ? 1 : 0) : (existing?.bot_replies_off_hours ?? 1),
      ai_replies_off_hours: aiRepliesOffHours !== undefined ? (aiRepliesOffHours ? 1 : 0) : (existing?.ai_replies_off_hours ?? 1),
      off_hours_flow_id: offHoursFlowId !== undefined ? resolvedFlowId : (existing?.off_hours_flow_id ?? null),
    };

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO business_hours_settings (integration_id, agency_id, enabled, timezone, same_every_day, bot_replies_off_hours, ai_replies_off_hours, off_hours_flow_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), timezone = VALUES(timezone), same_every_day = VALUES(same_every_day),
         bot_replies_off_hours = VALUES(bot_replies_off_hours), ai_replies_off_hours = VALUES(ai_replies_off_hours),
         off_hours_flow_id = VALUES(off_hours_flow_id), updated_at = NOW()`,
      [integrationId, agencyId, merged.enabled, merged.timezone, merged.same_every_day, merged.bot_replies_off_hours, merged.ai_replies_off_hours, merged.off_hours_flow_id]
    );

    for (const d of days) {
      const dow = Number(d.dayOfWeek);
      if (!(dow >= 0 && dow <= 6)) continue;
      const isOff = !!d.isOff;
      const openTime = normalizeTime(d.openTime, "09:00:00");
      const closeTime = normalizeTime(d.closeTime, "17:00:00");
      await conn.query(
        `INSERT INTO business_hours_days (integration_id, day_of_week, is_off, open_time, close_time)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_off = VALUES(is_off), open_time = VALUES(open_time), close_time = VALUES(close_time)`,
        [integrationId, dow, isOff ? 1 : 0, openTime, closeTime]
      );
    }

    await conn.commit();
    return res.json({ success: true, message: "Business hours saved." });
  } catch (err) {
    await conn.rollback().catch(() => {});
    const status = err.status || 500;
    console.error("Save business hours error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  } finally {
    conn.release();
  }
});

export default router;
