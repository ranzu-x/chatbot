/**
 * Messenger Utility templates + Human Agent setting (per Facebook Page / Instagram account).
 *
 *   GET    /messenger-utility/accounts/:integrationId/status        can this Page send Utility messages? + Human Agent flag
 *   PATCH  /messenger-utility/accounts/:integrationId/human-agent   { enabled } — owner only
 *   GET    /messenger-utility/templates?integrationId=&status=      the Page's templates (our mirror)
 *   POST   /messenger-utility/templates/sync                        { integrationId } — pull from Meta
 *   POST   /messenger-utility/templates/validate                    { draft } — pre-checks only, nothing saved
 *   POST   /messenger-utility/templates                             { integrationId, draft } — custom template
 *   POST   /messenger-utility/templates/from-library                { integrationId, name, language, libraryTemplateName, buttonInputs }
 *   DELETE /messenger-utility/templates/:id
 *   GET    /messenger-utility/library?integrationId=&q=&language=   Meta's pre-approved Utility library
 *
 * TENANT-LOCKED: no raw SQL in this file — tenantDb(req) for workspace rows,
 * utils/messengerUtility.js for Meta and the mirror table. A template belongs
 * to one Page (bot scope): every call names its Page, which must be this
 * workspace's own FACEBOOK integration.
 */
import express from "express";
import fs from "fs";
import path from "path";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { tenantDb } from "../utils/tenantDb.js";
import { emitToAgency } from "../utils/socket.js";
import {
  checkUtilityAccess, syncPageTemplates, searchTemplateLibrary, createPageTemplate, deletePageTemplate,
  uploadHeaderImage, upsertTemplateFromMeta, fetchPageTemplates, validateTemplateDraft, buildCreatePayload,
  describeMessengerTemplate,
} from "../utils/messengerUtility.js";

const router = express.Router();
router.use("/messenger-utility", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_messenger_utility"));
const ownerOnly = roleMiddleware("RESELLER", "ADMIN");

const TABLE = "messenger_utility_templates";
const fail = (res, err, fallback = "Server error") => {
  if (!err.status) console.error("[messenger-utility]", err);
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : fallback, code: err.code, metaError: err.metaError || undefined });
};
const badRequest = (message, code) => Object.assign(new Error(message), { status: 400, code });

/** The caller's own active Page (or, with allowInstagram, IG account). 404 otherwise — never another tenant's. */
async function ownedAccount(req, integrationId, { allowInstagram = false } = {}) {
  const id = Number(integrationId);
  const row = id ? await tenantDb(req).getOwned("integrations", id) : null;
  const platforms = allowInstagram ? ["FACEBOOK", "INSTAGRAM"] : ["FACEBOOK"];
  if (!row || !platforms.includes(String(row.platform).toUpperCase())) {
    throw Object.assign(new Error(allowInstagram ? "Facebook Page or Instagram account not found" : "Facebook Page not found"), { status: 404 });
  }
  return row;
}

function toClient(t) {
  return { ...t, components_json: undefined, components: typeof t.components_json === "string" ? JSON.parse(t.components_json || "[]") : (t.components_json || []), meta: describeMessengerTemplate(t) };
}

// ─── Account status + Human Agent ────────────────────────────────────────────
router.get("/messenger-utility/accounts/:integrationId/status", async (req, res) => {
  try {
    const account = await ownedAccount(req, req.params.integrationId, { allowInstagram: true });
    const utility = String(account.platform).toUpperCase() === "FACEBOOK" ? await checkUtilityAccess(account) : null;
    return res.json({
      success: true,
      platform: account.platform,
      humanAgentEnabled: Boolean(account.human_agent_enabled),
      utility,
    });
  } catch (err) {
    return fail(res, err);
  }
});

router.patch("/messenger-utility/accounts/:integrationId/human-agent", ownerOnly, async (req, res) => {
  try {
    const account = await ownedAccount(req, req.params.integrationId, { allowInstagram: true });
    const enabled = req.body?.enabled ? 1 : 0;
    await tenantDb(req).updateOwned("integrations", account.id, { human_agent_enabled: enabled });
    emitToAgency(req.tenant.agencyId, "integration_updated", { integrationId: account.id, humanAgentEnabled: Boolean(enabled) });
    return res.json({ success: true, humanAgentEnabled: Boolean(enabled), message: enabled ? "Human Agent replies turned on" : "Human Agent replies turned off" });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── Templates ───────────────────────────────────────────────────────────────
router.get("/messenger-utility/templates", async (req, res) => {
  try {
    const account = await ownedAccount(req, req.query.integrationId);
    const where = { integration_id: account.id };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const rows = await tenantDb(req).list(TABLE, { where, orderBy: "name" });
    return res.json({ success: true, templates: rows.map(toClient) });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/messenger-utility/templates/sync", async (req, res) => {
  try {
    const account = await ownedAccount(req, req.body?.integrationId);
    const result = await syncPageTemplates(req.tenant.agencyId, account);
    emitToAgency(req.tenant.agencyId, "messenger_template_update", { integrationId: account.id });
    return res.json({ success: true, ...result, message: `Synced ${result.synced} template(s) from Meta` });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/messenger-utility/templates/validate", async (req, res) => {
  const { errors, warnings } = validateTemplateDraft(req.body?.draft || {});
  return res.json({ success: true, errors, warnings });
});

/** Reads an uploaded /uploads/<file> image (JPEG/PNG) — only from the uploads folder. */
function readUploadedImage(url) {
  const m = /^\/?uploads\/([^/\\]+)$/.exec(String(url || "").replace(/^https?:\/\/[^/]+/i, ""));
  if (!m) throw badRequest("Upload the header image first (JPEG or PNG)");
  const file = path.resolve("uploads", m[1]);
  if (!file.startsWith(path.resolve("uploads") + path.sep) || !fs.existsSync(file)) throw badRequest("The header image file was not found — upload it again");
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : [".jpg", ".jpeg"].includes(ext) ? "image/jpeg" : null;
  if (!mime) throw badRequest("The header image must be a JPEG or PNG");
  const buffer = fs.readFileSync(file);
  if (buffer.length > 5 * 1024 * 1024) throw badRequest("The header image must be 5 MB or smaller");
  return { buffer, mime, publicPath: `/uploads/${m[1]}` };
}

router.post("/messenger-utility/templates", async (req, res) => {
  try {
    const account = await ownedAccount(req, req.body?.integrationId);
    const draft = req.body?.draft || {};
    const { errors, warnings } = validateTemplateDraft(draft);
    if (errors.length) return res.status(400).json({ success: false, code: "TEMPLATE_INVALID", message: errors[0], errors, warnings });

    let headerHandle = null;
    let headerMediaUrl = null;
    if (String(draft.header?.type).toUpperCase() === "IMAGE") {
      const img = readUploadedImage(draft.header.imageUrl);
      headerHandle = await uploadHeaderImage(account, img.buffer, img.mime);
      headerMediaUrl = img.publicPath;
    }
    const payload = buildCreatePayload(draft, { headerHandle });
    const created = await createPageTemplate(account, payload);

    const id = await upsertTemplateFromMeta(req.tenant.agencyId, account.id, {
      id: created.id, name: payload.name, language: payload.language, category: created.category || "UTILITY",
      status: created.status || "PENDING", components: payload.components, parameter_format: payload.parameter_format,
    }, { source: "CUSTOM", headerMediaUrl, createdBy: req.user.id });
    emitToAgency(req.tenant.agencyId, "messenger_template_update", { integrationId: account.id, templateId: id });
    const row = await tenantDb(req).getOwned(TABLE, id);
    return res.status(201).json({
      success: true,
      template: row ? toClient(row) : null,
      warnings,
      message: created.status === "APPROVED" ? "Template approved by Meta" : `Template submitted — Meta says ${String(created.status || "PENDING").toLowerCase()}`,
    });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/messenger-utility/templates/from-library", async (req, res) => {
  try {
    const account = await ownedAccount(req, req.body?.integrationId);
    const { name, language, libraryTemplateName } = req.body || {};
    if (!/^[a-z0-9_]{1,512}$/.test(String(name || ""))) throw badRequest("Template name: lowercase letters, numbers and underscores only");
    if (!language) throw badRequest("Choose a language");
    if (!libraryTemplateName) throw badRequest("Choose a template from Meta's library");
    const buttonInputs = (Array.isArray(req.body.buttonInputs) ? req.body.buttonInputs : [])
      .filter((b) => b && b.type)
      .map((b) => {
        const type = String(b.type).toUpperCase();
        if (type === "URL") {
          const base = String(b.baseUrl || "").trim();
          if (!/^https:\/\/[^\s]+$/i.test(base)) throw badRequest(`Enter the https:// link for the "${b.text || "link"}" button`);
          return { type, ...(b.text ? { text: String(b.text).slice(0, 20) } : {}), url: { base_url: base } };
        }
        return { type, ...(b.text ? { text: String(b.text).slice(0, 20) } : {}) };
      });

    const created = await createPageTemplate(account, {
      name, language, category: "UTILITY", library_template_name: libraryTemplateName,
      ...(buttonInputs.length ? { library_template_button_inputs: buttonInputs } : {}),
    });
    // The library clone's components come from Meta — read them back.
    const remote = (await fetchPageTemplates(account)).find((t) => t.name === name && t.language === language);
    const id = await upsertTemplateFromMeta(req.tenant.agencyId, account.id, remote || {
      id: created.id, name, language, category: created.category || "UTILITY", status: created.status || "PENDING", components: [],
    }, { source: "LIBRARY", libraryTemplateName, createdBy: req.user.id });
    emitToAgency(req.tenant.agencyId, "messenger_template_update", { integrationId: account.id, templateId: id });
    const row = await tenantDb(req).getOwned(TABLE, id);
    return res.status(201).json({ success: true, template: row ? toClient(row) : null, message: "Template added from Meta's library" });
  } catch (err) {
    return fail(res, err);
  }
});

router.delete("/messenger-utility/templates/:id", async (req, res) => {
  try {
    const row = await tenantDb(req).getOwned(TABLE, Number(req.params.id));
    if (!row) return res.status(404).json({ success: false, message: "Template not found" });
    const account = await ownedAccount(req, row.integration_id);
    await deletePageTemplate(account, { name: row.name, metaTemplateId: row.meta_template_id });
    await tenantDb(req).deleteOwned(TABLE, row.id);
    emitToAgency(req.tenant.agencyId, "messenger_template_update", { integrationId: account.id, templateId: row.id, deleted: true });
    return res.json({ success: true, message: "Template deleted from the Page" });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/messenger-utility/library", async (req, res) => {
  try {
    const account = await ownedAccount(req, req.query.integrationId);
    const items = await searchTemplateLibrary(account, { query: String(req.query.q || "").slice(0, 100), language: String(req.query.language || "en").slice(0, 10) });
    return res.json({ success: true, templates: items });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
