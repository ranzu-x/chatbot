import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { executeCampaign } from "../utils/campaignRunner.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ─── LIST CAMPAIGNS ───────────────────────────────────────────────────────────
router.get("/campaigns", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT * FROM campaigns WHERE agency_id = ? ORDER BY created_at DESC",
      [agencyId]
    );
    return res.json({ success: true, campaigns: rows });
  } catch (err) {
    console.error("List campaigns error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET CAMPAIGN DETAILS & LOGS ─────────────────────────────────────────────
router.get("/campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [campaigns] = await pool.query(
      "SELECT * FROM campaigns WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!campaigns.length) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const [logs] = await pool.query(
      `SELECT cl.*, c.name as contact_name, c.phone, c.email, c.platform
       FROM campaign_logs cl
       JOIN contacts c ON c.id = cl.contact_id
       WHERE cl.campaign_id = ?
       ORDER BY cl.id ASC`,
      [req.params.id]
    );

    return res.json({ success: true, campaign: campaigns[0], logs });
  } catch (err) {
    console.error("Get campaign details error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE & TRIGGER CAMPAIGN ────────────────────────────────────────────────
router.post("/campaigns", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      name,
      platform = "WHATSAPP",
      templateId,
      messageBody,
      targetPlatformFilter,
      sendNow = true,
    } = req.body;

    if (!name || (!messageBody && !templateId)) {
      return res.status(400).json({ success: false, message: "Campaign name and message body/template are required" });
    }

    let finalBody = messageBody || "";

    // If templateId specified, fetch template body
    if (templateId) {
      const [tpls] = await pool.query("SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ?", [templateId, agencyId]);
      if (tpls.length) {
        finalBody = tpls[0].body_text;
      }
    }

    // Find targeted contacts
    let contactQuery = "SELECT id FROM contacts WHERE agency_id = ?";
    const contactParams = [agencyId];

    if (targetPlatformFilter && targetPlatformFilter !== "ALL") {
      contactQuery += " AND platform = ?";
      contactParams.push(targetPlatformFilter);
    } else if (platform && platform !== "ALL") {
      contactQuery += " AND platform = ?";
      contactParams.push(platform);
    }

    const [targetedContacts] = await pool.query(contactQuery, contactParams);

    if (!targetedContacts.length) {
      return res.status(400).json({ success: false, message: "No contacts found matching the selected target criteria" });
    }

    // Insert Campaign Record
    const [campResult] = await pool.query(
      `INSERT INTO campaigns 
       (agency_id, name, platform, template_id, message_body, target_platform_filter, total_contacts, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', NOW())`,
      [agencyId, name, platform, templateId || null, finalBody, targetPlatformFilter || null, targetedContacts.length]
    );

    const campaignId = campResult.insertId;

    // Create Campaign Logs for each targeted contact
    const logValues = targetedContacts.map((c) => [campaignId, c.id, "PENDING"]);
    await pool.query(
      "INSERT INTO campaign_logs (campaign_id, contact_id, status) VALUES ?",
      [logValues]
    );

    // Trigger Campaign execution in background if sendNow is true
    if (sendNow) {
      executeCampaign(campaignId).catch((err) => console.error("Background campaign error:", err));
    }

    const [created] = await pool.query("SELECT * FROM campaigns WHERE id = ?", [campaignId]);

    return res.status(201).json({
      success: true,
      message: sendNow ? "Campaign created and started broadcasting!" : "Campaign saved as draft",
      campaign: created[0],
    });
  } catch (err) {
    console.error("Create campaign error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE CAMPAIGN ──────────────────────────────────────────────────────────
router.delete("/campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error("Delete campaign error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
