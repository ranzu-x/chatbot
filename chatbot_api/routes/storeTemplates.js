/**
 * Default WhatsApp templates for store automation (utils/storeTemplatePresets.js).
 *
 *   GET  /store-templates?integrationId=          every default + its template's status on that number
 *   POST /store-templates          { integrationId, keys }   submit the chosen defaults to Meta (one click)
 *   POST /store-templates/refresh  { integrationId }         pull their review status from Meta
 *
 * TENANT-LOCKED: no raw SQL here — the number is loaded with tenantDb(req),
 * the rest goes through utils/storeTemplatePresets.js.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { tenantDb } from "../utils/tenantDb.js";
import { listStorePresets, createStorePresets, refreshStorePresets } from "../utils/storeTemplatePresets.js";

const router = express.Router();
router.use("/store-templates", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_whatsapp_commerce"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

async function loadNumber(req, id) {
  const row = id ? await tenantDb(req).getOwned("integrations", id) : null;
  return row && String(row.platform).toUpperCase() === "WHATSAPP" && row.is_active !== 0 ? row : null;
}

const fail = (res, err) => {
  if (!err.status) console.error("[Store templates]", err);
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Server error" });
};

router.get("/store-templates", async (req, res) => {
  try {
    const integration = await loadNumber(req, req.query.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    return res.json({ success: true, presets: await listStorePresets(agencyOf(req), integration) });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/store-templates", async (req, res) => {
  try {
    const integration = await loadNumber(req, req.body?.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    const results = await createStorePresets(agencyOf(req), integration, req.body?.keys);
    const failed = results.filter((r) => !r.ok);
    return res.status(failed.length === results.length ? 400 : 201).json({
      success: failed.length < results.length,
      message: failed.length === results.length ? failed[0].message : undefined,
      results,
      presets: await listStorePresets(agencyOf(req), integration),
    });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/store-templates/refresh", async (req, res) => {
  try {
    const integration = await loadNumber(req, req.body?.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    return res.json({ success: true, presets: await refreshStorePresets(agencyOf(req), integration) });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
