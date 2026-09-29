/**
 * Growth tools — trackable chat links + QR codes (utils/growthLinks.js).
 *
 *   GET  /go/:code                      PUBLIC: counts the click, redirects to the chat
 *   GET  /growth-links?integrationId=   the bot account's links (+ share / chat URLs)
 *   POST /growth-links                  create    PUT /growth-links/:id   update
 *   DELETE /growth-links/:id            delete    GET /growth-links/:id/qr?format=png|svg
 *
 * Mounted with the public routers in index.js (the /go redirect has no login);
 * every /growth-links route scopes itself to the caller's workspace.
 */
import express from "express";
import QRCode from "qrcode";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { SUPPORTED_PLATFORMS, newCode, shareUrl, chatUrl, resolveClick, DEFAULT_PREFILL } from "../utils/growthLinks.js";

const router = express.Router();

// ─── Public redirect ─────────────────────────────────────────────────────────
router.get("/go/:code", async (req, res) => {
  try {
    const url = await resolveClick(req.params.code);
    if (!url) {
      return res.status(404).type("html").send(
        "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<title>Link not available</title><body style=\"font-family:system-ui,sans-serif;display:flex;min-height:90vh;align-items:center;justify-content:center;color:#334155\">"
        + "<p>This link is no longer available.</p></body>"
      );
    }
    res.set("Cache-Control", "no-store"); // every scan / click must reach us to be counted
    return res.redirect(302, url);
  } catch (err) {
    console.error("[Growth] redirect:", err.message);
    return res.status(500).send("Something went wrong");
  }
});

// ─── Management ──────────────────────────────────────────────────────────────
router.use("/growth-links", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_bot_manager"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user?.agencyId;
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });

async function loadIntegration(agencyId, integrationId) {
  const [[row]] = await pool.query(
    `SELECT i.id, i.platform, i.name, i.fb_page_id, i.ig_username, i.wa_display_phone, tb.bot_username AS tg_bot_username
       FROM integrations i LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
      WHERE i.id = ? AND i.agency_id = ?`,
    [integrationId, agencyId]
  );
  return row || null;
}

function present(link, integration) {
  return {
    id: link.id,
    name: link.name,
    code: link.code,
    integrationId: link.integration_id,
    flowId: link.flow_id,
    flowName: link.flow_name || null,
    labelId: link.label_id,
    labelName: link.label_name || null,
    prefillText: link.prefill_text || "",
    isActive: Boolean(link.is_active),
    clicks: link.clicks,
    starts: link.starts,
    newSubscribers: link.new_subscribers,
    lastClickAt: link.last_click_at,
    createdAt: link.created_at,
    shareUrl: shareUrl(link.code),
    chatUrl: chatUrl(link, integration),
  };
}

/** Checks the fields sent; returns { values } or { error }. */
async function cleanInput(agencyId, integrationId, body, { partial = false } = {}) {
  const values = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) return { error: "Give the link a name" };
    if (name.length > 120) return { error: "The name is too long (120 characters at most)" };
    values.name = name;
  }
  if (body.flowId !== undefined) {
    if (body.flowId === null || body.flowId === "") values.flow_id = null;
    else {
      // Bot scope: only a flow of this same bot account.
      const [[flow]] = await pool.query(
        "SELECT id FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND trigger_type <> 'QUICK_ACTION'",
        [body.flowId, agencyId, integrationId]
      );
      if (!flow) return { error: "Choose a flow of this bot account" };
      values.flow_id = flow.id;
    }
  }
  if (body.labelId !== undefined) {
    if (body.labelId === null || body.labelId === "") values.label_id = null;
    else {
      const [[label]] = await pool.query("SELECT id FROM labels WHERE id = ? AND agency_id = ?", [body.labelId, agencyId]);
      if (!label) return { error: "Label not found" };
      values.label_id = label.id;
    }
  }
  if (body.prefillText !== undefined) {
    const text = String(body.prefillText || "").trim();
    if (text.length > 300) return { error: "The pre-filled message is too long (300 characters at most)" };
    values.prefill_text = text || null;
  }
  if (body.isActive !== undefined) values.is_active = body.isActive ? 1 : 0;
  return { values };
}

const LINK_SELECT = `
  SELECT gl.*, f.name AS flow_name, l.name AS label_name
    FROM growth_links gl
    LEFT JOIN flows f ON f.id = gl.flow_id AND f.agency_id = gl.agency_id
    LEFT JOIN labels l ON l.id = gl.label_id AND l.agency_id = gl.agency_id`;

router.get("/growth-links", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.query.integrationId);
    if (!integration) return bad(res, "Bot account not found", 404);
    const [rows] = await pool.query(`${LINK_SELECT} WHERE gl.agency_id = ? AND gl.integration_id = ? ORDER BY gl.created_at DESC`, [agencyId, integration.id]);
    return res.json({
      success: true,
      supported: SUPPORTED_PLATFORMS.includes(String(integration.platform).toUpperCase()),
      platform: integration.platform,
      defaultPrefill: DEFAULT_PREFILL,
      links: rows.map((r) => present(r, integration)),
    });
  } catch (err) {
    console.error("[Growth] list:", err);
    return bad(res, "Server error", 500);
  }
});

router.post("/growth-links", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.body.integrationId);
    if (!integration) return bad(res, "Bot account not found", 404);
    if (!SUPPORTED_PLATFORMS.includes(String(integration.platform).toUpperCase())) {
      return bad(res, "Chat links work for WhatsApp, Messenger, Instagram and Telegram bot accounts");
    }
    const { values, error } = await cleanInput(agencyId, integration.id, req.body);
    if (error) return bad(res, error);
    let id = null;
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      try {
        const [ins] = await pool.query(
          "INSERT INTO growth_links (agency_id, integration_id, flow_id, label_id, name, code, prefill_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [agencyId, integration.id, values.flow_id ?? null, values.label_id ?? null, values.name, newCode(), values.prefill_text ?? null]
        );
        id = ins.insertId;
      } catch (e) {
        if (e.code !== "ER_DUP_ENTRY") throw e; // code clash: try another
      }
    }
    const [[row]] = await pool.query(`${LINK_SELECT} WHERE gl.id = ? AND gl.agency_id = ?`, [id, agencyId]);
    return res.status(201).json({ success: true, link: present(row, integration) });
  } catch (err) {
    console.error("[Growth] create:", err);
    return bad(res, "Server error", 500);
  }
});

async function ownedLink(agencyId, id) {
  const [[row]] = await pool.query("SELECT * FROM growth_links WHERE id = ? AND agency_id = ?", [id, agencyId]);
  return row || null;
}

router.put("/growth-links/:id", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const link = await ownedLink(agencyId, req.params.id);
    if (!link) return bad(res, "Link not found", 404);
    const { values, error } = await cleanInput(agencyId, link.integration_id, req.body, { partial: true });
    if (error) return bad(res, error);
    const cols = Object.keys(values);
    if (cols.length) {
      await pool.query(
        `UPDATE growth_links SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND agency_id = ?`,
        [...cols.map((c) => values[c]), link.id, agencyId]
      );
    }
    const integration = await loadIntegration(agencyId, link.integration_id);
    const [[row]] = await pool.query(`${LINK_SELECT} WHERE gl.id = ? AND gl.agency_id = ?`, [link.id, agencyId]);
    return res.json({ success: true, link: present(row, integration) });
  } catch (err) {
    console.error("[Growth] update:", err);
    return bad(res, "Server error", 500);
  }
});

router.delete("/growth-links/:id", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [r] = await pool.query("DELETE FROM growth_links WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!r.affectedRows) return bad(res, "Link not found", 404);
    return res.json({ success: true });
  } catch (err) {
    console.error("[Growth] delete:", err);
    return bad(res, "Server error", 500);
  }
});

// QR code of the trackable address (so scans are counted too).
router.get("/growth-links/:id/qr", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const link = await ownedLink(agencyId, req.params.id);
    if (!link) return bad(res, "Link not found", 404);
    const url = shareUrl(link.code);
    const fileBase = `qr-${String(link.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || link.code}`;
    if (req.query.format === "svg") {
      const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
      res.type("image/svg+xml");
      if (req.query.download) res.set("Content-Disposition", `attachment; filename="${fileBase}.svg"`);
      return res.send(svg);
    }
    const png = await QRCode.toBuffer(url, { type: "png", width: 720, margin: 2, errorCorrectionLevel: "M" });
    res.type("image/png");
    if (req.query.download) res.set("Content-Disposition", `attachment; filename="${fileBase}.png"`);
    return res.send(png);
  } catch (err) {
    console.error("[Growth] qr:", err);
    return bad(res, "Server error", 500);
  }
});

export default router;
