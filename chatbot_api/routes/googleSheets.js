/**
 * Google Sheets connection — one per agency, connected once from Settings,
 * then used as a User Input Flow's optional export destination.
 * See utils/googleSheets.js for the underlying OAuth/Sheets API calls.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import * as googleSheets from "../utils/googleSheets.js";

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

router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

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

export default router;
