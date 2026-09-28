/** Bot Manager → Automation → Opt-out Keywords (utils/optOut.js). */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { rowToSettings, splitKeywords } from "../utils/optOut.js";

const router = express.Router();
router.use("/opt-out", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

async function loadIntegration(agencyId, integrationId) {
  const [[row]] = await pool.query("SELECT id, platform FROM integrations WHERE id = ? AND agency_id = ?", [integrationId, agencyId]);
  return row || null;
}

router.get("/opt-out/:integrationId", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    const [[row]] = await pool.query("SELECT * FROM subscription_keywords WHERE integration_id = ?", [integration.id]);
    const [[counts]] = await pool.query(
      `SELECT COUNT(DISTINCT c.id) AS unsubscribed FROM contacts c
         JOIN conversations cv ON cv.contact_id = c.id AND cv.integration_id = ?
        WHERE c.agency_id = ? AND c.subscription_status = 'UNSUBSCRIBED'`,
      [integration.id, agencyId]
    );
    return res.json({ success: true, settings: rowToSettings(row), unsubscribed: Number(counts.unsubscribed) || 0 });
  } catch (err) {
    console.error("Get opt-out settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/opt-out/:integrationId", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    const b = req.body || {};
    const outWords = splitKeywords(Array.isArray(b.optOutKeywords) ? b.optOutKeywords.join(",") : b.optOutKeywords);
    const inWords = splitKeywords(Array.isArray(b.optInKeywords) ? b.optInKeywords.join(",") : b.optInKeywords);
    if (b.enabled !== false && !outWords.length) return res.status(400).json({ success: false, message: "Add at least one opt-out word" });
    const clash = outWords.find((w) => inWords.includes(w));
    if (clash) return res.status(400).json({ success: false, message: `"${clash}" can't be both an opt-out and an opt-in word` });
    await pool.query(
      `INSERT INTO subscription_keywords (integration_id, agency_id, enabled, opt_out_keywords, opt_out_reply, opt_in_keywords, opt_in_reply)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), opt_out_keywords = VALUES(opt_out_keywords), opt_out_reply = VALUES(opt_out_reply),
         opt_in_keywords = VALUES(opt_in_keywords), opt_in_reply = VALUES(opt_in_reply)`,
      [
        integration.id, agencyId, b.enabled === false ? 0 : 1,
        outWords.join(",").slice(0, 500), String(b.optOutReply ?? "").slice(0, 1000),
        inWords.join(",").slice(0, 500), String(b.optInReply ?? "").slice(0, 1000),
      ]
    );
    return res.json({ success: true, message: "Saved" });
  } catch (err) {
    console.error("Save opt-out settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
