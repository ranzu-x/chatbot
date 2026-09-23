/**
 * Google Sheets connection — one per agency, connected once from Settings,
 * then used as a User Input Flow's optional export destination.
 * See utils/googleSheets.js for the underlying OAuth/Sheets API calls.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import * as googleSheets from "../utils/googleSheets.js";

// Keep in step with IMPORT_MAX_ROWS in routes/contacts.js.
const SHEET_IMPORT_MAX_ROWS = 50000;

const router = express.Router();

// The callback is hit directly by Google's redirect (no Authorization header) —
// registered BEFORE the authMiddleware gate below, which only applies to the
// routes registered after it on this router.
router.get("/integrations/google-sheets/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error) {
    return res.redirect(`${frontendUrl}/settings/google-sheets?connected=0&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${frontendUrl}/settings/google-sheets?connected=0&reason=missing_code`);
  }

  try {
    const agencyId = Number(state);
    if (!agencyId) throw new Error("Invalid state");
    const { email } = await googleSheets.handleOAuthCallback(agencyId, code);
    return res.redirect(`${frontendUrl}/settings/google-sheets?connected=1&email=${encodeURIComponent(email || "")}`);
  } catch (err) {
    console.error("Google Sheets OAuth callback failed:", err.message);
    return res.redirect(`${frontendUrl}/settings/google-sheets?connected=0&reason=${encodeURIComponent(err.message)}`);
  }
});

router.use("/integrations/google-sheets", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_google_sheets"));

router.get("/integrations/google-sheets/auth-url", async (req, res) => {
  try {
    if (!googleSheets.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: "Google Sheets isn't configured on this server yet (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).",
      });
    }
    const url = googleSheets.getAuthUrl(req.user.agencyId);
    return res.json({ success: true, url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

router.get("/integrations/google-sheets/status", async (req, res) => {
  try {
    const status = await googleSheets.getStatus(req.user.agencyId);
    return res.json({ success: true, ...status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/integrations/google-sheets", async (req, res) => {
  try {
    await googleSheets.disconnect(req.user.agencyId);
    return res.json({ success: true, message: "Google account disconnected" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/integrations/google-sheets/spreadsheets", async (req, res) => {
  try {
    const files = await googleSheets.listSpreadsheets(req.user.agencyId);
    return res.json({ success: true, spreadsheets: files });
  } catch (err) {
    console.error("List spreadsheets failed:", err.message);
    return res.status(400).json({ success: false, message: err.message || "Failed to list spreadsheets" });
  }
});

router.get("/integrations/google-sheets/spreadsheets/:id/tabs", async (req, res) => {
  try {
    const tabs = await googleSheets.listTabs(req.user.agencyId, req.params.id);
    return res.json({ success: true, tabs });
  } catch (err) {
    console.error("List tabs failed:", err.message);
    return res.status(400).json({ success: false, message: err.message || "Failed to list tabs" });
  }
});

// One tab's cells, for the subscriber import. Capped at the import limit so a huge
// sheet fails here with a clear message instead of timing out further along.
router.get("/integrations/google-sheets/spreadsheets/:id/values", async (req, res) => {
  try {
    const tab = String(req.query.tab || "").trim();
    if (!tab) return res.status(400).json({ success: false, message: "Choose a tab" });
    const range = "'" + tab.replace(/'/g, "''") + "'"; // A1 notation needs quotes around tab names
    const values = await googleSheets.readSheetValues(req.user.agencyId, req.params.id, range, { raw: true });
    if (values.length - 1 > SHEET_IMPORT_MAX_ROWS) {
      return res.status(400).json({ success: false, message: `This tab has ${(values.length - 1).toLocaleString()} rows. Imports are limited to ${SHEET_IMPORT_MAX_ROWS.toLocaleString()} at a time — split it into several tabs.` });
    }
    return res.json({ success: true, values });
  } catch (err) {
    console.error("Read sheet values failed:", err.message);
    return res.status(400).json({ success: false, message: err.message || "Failed to read the sheet" });
  }
});

export default router;
