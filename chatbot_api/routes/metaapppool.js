import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { resolveAgencyId } from "./metaapp.js";
import { testMetaAppCredentials } from "../utils/metaAppHealth.js";

const router = express.Router();
// Owner-only, same gate as /settings/meta-app in metaapp.js — this is the
// standby-app-pool management surface (add/edit/promote/delete backup
// apps, view health, toggle the WhatsApp new-onboarding redirect). The
// ACTIVE slot itself is still managed via metaapp.js's existing
// GET/POST /settings/meta-app for backward compatibility.
router.use("/settings/meta-app-pool", authMiddleware, roleMiddleware("RESELLER", "ADMIN"));

function normalizePlatformGroup(value) {
  return value === "WHATSAPP" ? "WHATSAPP" : "MESSENGER_INSTAGRAM";
}

// ─── LIST ALL SLOTS (ACTIVE + STANDBYs) FOR ONE PLATFORM GROUP ────────────
router.get("/settings/meta-app-pool", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const platformGroup = normalizePlatformGroup(req.query.platformGroup);
    const [rows] = await pool.query(
      `SELECT * FROM meta_app_pool WHERE agency_id = ? AND platform_group = ?
       ORDER BY (slot_role = 'ACTIVE') DESC, id ASC`,
      [agencyId, platformGroup]
    );
    return res.json({ success: true, slots: rows });
  } catch (err) {
    console.error("List meta-app-pool error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE A NEW STANDBY SLOT ─────────────────────────────────────────────
router.post("/settings/meta-app-pool", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const platformGroup = normalizePlatformGroup(req.body.platformGroup);
    const {
      label, appId, appSecret, systemUserToken, whatsappConfigId, whatsappConfigIdCatalog,
      verifyToken, businessManagerLabel, appName, siteUrl, privacyUrl, tosUrl,
    } = req.body;
    if (!appId || !appSecret) {
      return res.status(400).json({ success: false, message: "App ID and App Secret are required" });
    }

    const [existingForGroup] = await pool.query(
      "SELECT id FROM meta_app_pool WHERE agency_id = ? AND platform_group = ?",
      [agencyId, platformGroup]
    );
    // A brand-new group with nothing configured yet — this first slot
    // becomes ACTIVE immediately so Phase 1 setup "just works" without a
    // separate promote step. Every slot after that starts as STANDBY.
    const slotRole = existingForGroup.length === 0 ? "ACTIVE" : "STANDBY";

    const [ins] = await pool.query(
      `INSERT INTO meta_app_pool
         (agency_id, platform_group, slot_role, label, business_manager_label, app_id, app_secret,
          system_user_token, whatsapp_config_id, whatsapp_config_id_catalog, verify_token,
          app_name, site_url, privacy_url, tos_url, is_configured, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [
        agencyId, platformGroup, slotRole, label?.trim() || null, businessManagerLabel?.trim() || null,
        appId, appSecret, systemUserToken?.trim() || null, whatsappConfigId?.trim() || null,
        whatsappConfigIdCatalog?.trim() || null, verifyToken?.trim() || null,
        appName || null, siteUrl || null, privacyUrl || null, tosUrl || null,
      ]
    );
    return res.status(201).json({ success: true, id: ins.insertId, slotRole });
  } catch (err) {
    console.error("Create meta-app-pool slot error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── EDIT A SLOT ────────────────────────────────────────────────────────────
router.patch("/settings/meta-app-pool/:id", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [[slot]] = await pool.query("SELECT id FROM meta_app_pool WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!slot) return res.status(404).json({ success: false, message: "Slot not found" });

    const {
      label, appId, appSecret, systemUserToken, whatsappConfigId, whatsappConfigIdCatalog,
      verifyToken, businessManagerLabel, appName, siteUrl, privacyUrl, tosUrl, isActive,
    } = req.body;

    await pool.query(
      `UPDATE meta_app_pool SET
         label = COALESCE(?, label), business_manager_label = COALESCE(?, business_manager_label),
         app_id = COALESCE(?, app_id), app_secret = COALESCE(?, app_secret),
         system_user_token = COALESCE(?, system_user_token), whatsapp_config_id = COALESCE(?, whatsapp_config_id),
         whatsapp_config_id_catalog = COALESCE(?, whatsapp_config_id_catalog), verify_token = COALESCE(?, verify_token),
         app_name = COALESCE(?, app_name), site_url = COALESCE(?, site_url), privacy_url = COALESCE(?, privacy_url),
         tos_url = COALESCE(?, tos_url), is_active = COALESCE(?, is_active), is_configured = 1
       WHERE id = ?`,
      [
        label?.trim() || null, businessManagerLabel?.trim() || null, appId || null, appSecret || null,
        systemUserToken?.trim() || null, whatsappConfigId?.trim() || null, whatsappConfigIdCatalog?.trim() || null,
        verifyToken?.trim() || null, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null,
        typeof isActive === "boolean" ? (isActive ? 1 : 0) : null, req.params.id,
      ]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Edit meta-app-pool slot error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE A STANDBY SLOT (never the ACTIVE one) ─────────────────────────
router.delete("/settings/meta-app-pool/:id", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [[slot]] = await pool.query("SELECT id, slot_role FROM meta_app_pool WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!slot) return res.status(404).json({ success: false, message: "Slot not found" });
    if (slot.slot_role === "ACTIVE") {
      return res.status(400).json({ success: false, message: "Can't delete the active app — promote a standby first." });
    }
    await pool.query("DELETE FROM meta_app_pool WHERE id = ?", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete meta-app-pool slot error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── PROMOTE A STANDBY TO ACTIVE (manual, or called by the failover module) ─
export async function promoteSlot(conn, agencyId, slotId) {
  const [[target]] = await conn.query(
    "SELECT id, platform_group FROM meta_app_pool WHERE id = ? AND agency_id = ?",
    [slotId, agencyId]
  );
  if (!target) throw new Error("Slot not found");

  await conn.query(
    "UPDATE meta_app_pool SET slot_role = 'STANDBY' WHERE agency_id = ? AND platform_group = ? AND slot_role = 'ACTIVE' AND id != ?",
    [agencyId, target.platform_group, slotId]
  );
  await conn.query("UPDATE meta_app_pool SET slot_role = 'ACTIVE' WHERE id = ?", [slotId]);
  return target.platform_group;
}

router.post("/settings/meta-app-pool/:id/promote", async (req, res) => {
  const agencyId = await resolveAgencyId(req);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const platformGroup = await promoteSlot(conn, agencyId, req.params.id);
    await conn.commit();
    return res.json({ success: true, platformGroup });
  } catch (err) {
    await conn.rollback();
    console.error("Promote meta-app-pool slot error:", err);
    return res.status(err.message === "Slot not found" ? 404 : 500).json({ success: false, message: err.message === "Slot not found" ? err.message : "Server error" });
  } finally {
    conn.release();
  }
});

// ─── TEST A SLOT'S CREDENTIALS ─────────────────────────────────────────────
router.post("/settings/meta-app-pool/:id/test", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [[slot]] = await pool.query("SELECT app_id, app_secret FROM meta_app_pool WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!slot) return res.status(404).json({ success: false, message: "Slot not found" });
    const result = await testMetaAppCredentials(slot.app_id, slot.app_secret);
    if (!result.healthy) return res.status(400).json({ success: false, message: result.error?.message || "Connection failed" });
    return res.json({ success: true, message: "Meta App connection successful", appName: result.appName });
  } catch (err) {
    console.error("Test meta-app-pool slot error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TOGGLE THE WHATSAPP NEW-ONBOARDING REDIRECT (Phase 3) ────────────────
// Manual admin fallback for Tech-Provider-suspension detection — flips the
// flag that GET /settings/meta-app/app-id and POST /channels/whatsapp/
// embedded-signup check to redirect NEW connect attempts to a standby,
// without ever touching existing WhatsApp integrations.
router.patch("/settings/meta-app-pool/:id/onboarding-block", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [[slot]] = await pool.query("SELECT id FROM meta_app_pool WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!slot) return res.status(404).json({ success: false, message: "Slot not found" });
    const blocked = Boolean(req.body.blocked);
    await pool.query(
      `UPDATE meta_app_pool SET new_onboarding_blocked = ?, new_onboarding_blocked_reason = ?, new_onboarding_blocked_at = ? WHERE id = ?`,
      [blocked ? 1 : 0, blocked ? (req.body.reason?.trim() || "Manually flagged by admin") : null, blocked ? new Date() : null, req.params.id]
    );
    return res.json({ success: true, blocked });
  } catch (err) {
    console.error("Toggle onboarding-block error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
