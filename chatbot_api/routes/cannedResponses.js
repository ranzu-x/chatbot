/**
 * Canned responses (quick replies).
 *
 * TENANT-LOCKED: no raw SQL in this file. Every read and write goes through
 * tenantDb(req), which adds the caller's workspace to every statement, so a
 * response id from another workspace can't be read, edited or deleted here.
 * `npm run lint:tenant` fails if raw queries are added.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { tenantDb } from "../utils/tenantDb.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const TABLE = "quick_replies";

// Shortcut is optional (e.g. "greeting" for a "/greeting" match in the
// composer) — strip a leading slash if the agent typed one, normalize
// to lowercase so matching is case-insensitive.
const normalizeShortcut = (shortcut) => (shortcut ? shortcut.trim().replace(/^\//, "").toLowerCase() || null : null);

// ─── LIST CANNED RESPONSES ───────────────────────────────────────────────────
router.get("/canned-responses", async (req, res) => {
  try {
    const cannedResponses = await tenantDb(req).list(TABLE, { orderBy: "title" });
    return res.json({ success: true, cannedResponses });
  } catch (err) {
    console.error("List canned responses error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE CANNED RESPONSE ──────────────────────────────────────────────────
router.post("/canned-responses", async (req, res) => {
  try {
    const db = tenantDb(req);
    const { title, body, shortcut } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: "Title and body are required" });
    }

    const id = await db.insert(TABLE, { title, shortcut: normalizeShortcut(shortcut), body, created_at: new Date() });
    emitToAgency(db.agencyId, "canned_response_updated", { reason: "created" });
    return res.status(201).json({ success: true, cannedResponse: await db.getOwned(TABLE, id) });
  } catch (err) {
    console.error("Create canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE CANNED RESPONSE ──────────────────────────────────────────────────
router.put("/canned-responses/:id", async (req, res) => {
  try {
    const db = tenantDb(req);
    const { title, body, shortcut } = req.body;

    const changed = await db.updateOwned(TABLE, req.params.id, { title, shortcut: normalizeShortcut(shortcut), body });
    if (!changed) {
      return res.status(404).json({ success: false, message: "Canned response not found" });
    }

    emitToAgency(db.agencyId, "canned_response_updated", { reason: "updated" });
    return res.json({ success: true, cannedResponse: await db.getOwned(TABLE, req.params.id) });
  } catch (err) {
    console.error("Update canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE CANNED RESPONSE ──────────────────────────────────────────────────
router.delete("/canned-responses/:id", async (req, res) => {
  try {
    const db = tenantDb(req);
    await db.deleteOwned(TABLE, req.params.id);
    emitToAgency(db.agencyId, "canned_response_updated", { reason: "deleted" });
    return res.json({ success: true, message: "Canned response deleted" });
  } catch (err) {
    console.error("Delete canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
