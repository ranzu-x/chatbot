import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

// ─── GET ALL INTEGRATIONS ─────────────────────────────────────────────────────
router.get("/integrations", async (req, res) => {
  try {
    const [integrations] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, integrations });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE INTEGRATION ───────────────────────────────────────────────────────
router.post("/integrations", async (req, res) => {
  const {
    platform, name, accessToken, verifyToken,
    waPhoneNumberId, waBusinessAccId,
    fbPageId, fbPageName,
    igAccountId, igUsername,
  } = req.body;

  if (!platform || !name || !accessToken)
    return res.status(400).json({ success: false, message: "Platform, name, and access token are required" });

  try {
    await pool.query(
      `INSERT INTO integrations 
       (agency_id, platform, name, access_token, verify_token, wa_phone_number_id, wa_business_acc_id, fb_page_id, fb_page_name, ig_account_id, ig_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.agencyId, platform, name, accessToken, verifyToken || null,
        waPhoneNumberId || null, waBusinessAccId || null,
        fbPageId || null, fbPageName || null,
        igAccountId || null, igUsername || null,
      ]
    );
    return res.status(201).json({ success: true, message: "Integration created successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE INTEGRATION ───────────────────────────────────────────────────────
router.put("/integrations/:id", async (req, res) => {
  const {
    name, accessToken, verifyToken,
    waPhoneNumberId, waBusinessAccId,
    fbPageId, fbPageName,
    igAccountId, igUsername, isActive,
  } = req.body;

  try {
    const [check] = await pool.query(
      "SELECT id FROM integrations WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!check.length) return res.status(404).json({ success: false, message: "Integration not found" });

    await pool.query(
      `UPDATE integrations SET name=?, access_token=?, verify_token=?, wa_phone_number_id=?, 
       wa_business_acc_id=?, fb_page_id=?, fb_page_name=?, ig_account_id=?, ig_username=?, is_active=?
       WHERE id = ? AND agency_id = ?`,
      [
        name, accessToken, verifyToken,
        waPhoneNumberId, waBusinessAccId,
        fbPageId, fbPageName,
        igAccountId, igUsername,
        isActive ?? true,
        req.params.id, req.user.agencyId,
      ]
    );
    return res.json({ success: true, message: "Integration updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE INTEGRATION ───────────────────────────────────────────────────────
router.delete("/integrations/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM integrations WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Integration deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
