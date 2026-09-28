/**
 * Bot export / import (Bot Manager → Keyword Based Bots; format in
 * utils/flowTransfer.js).
 *
 *   GET  /flows/:id/export   the file (JSON) — secrets and account-bound links removed
 *   POST /flows/import       { file, integrationId, name? } → a NEW flow on that bot
 *
 * An import never overwrites anything: it always creates a new flow, switched
 * OFF so it can't start answering before it has been checked, plus new copies
 * of the User Input Flows it uses. Custom fields and labels are matched by key /
 * name in the workspace (created when missing); sequences, other flows,
 * templates and campaigns are matched by name on the target bot, else the link
 * is cleared and reported. Everything is written in one transaction.
 *
 * Team members need bot_manager.special for both (middleware/teamPermissions.js;
 * GETs aren't gated there, so the export checks it itself).
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { getMemberPermissionKeys } from "../middleware/permissionMiddleware.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { getOwnedIntegration, findOutOfScopeRefs, describeOutOfScope } from "../utils/botScope.js";
import { SYSTEM_FIELDS } from "../utils/systemFields.js";
import {
  FORMAT, FORMAT_VERSION, MIN_READER_VERSION, stripSecrets, stripAccountBound, collectRefs, visitRefs,
  validateExportFile, channelWarnings, componentMap, uniqueName,
} from "../utils/flowTransfer.js";

const router = express.Router();
const guard = [authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_bot_manager")];

const agencyOf = (req) => req.tenant?.agencyId || req.user?.agencyId;
const parse = (v, fallback = []) => { try { return typeof v === "string" ? JSON.parse(v || "null") ?? fallback : (v ?? fallback); } catch { return fallback; } };
const idList = (set) => [...(set || [])];

async function canTransfer(req) {
  if ((req.tenant?.role || req.user?.role) !== "USER") return true;
  const keys = await getMemberPermissionKeys(req.user.id, agencyOf(req));
  return Boolean(keys?.has("bot_manager.special"));
}

// Names of referenced records, only from THIS workspace.
async function namesOf(table, nameCol, agencyId, ids, extra = "") {
  if (!ids.length) return [];
  const [rows] = await pool.query(`SELECT id, ${nameCol} AS name${extra} FROM ${table} WHERE agency_id = ? AND id IN (?)`, [agencyId, ids]);
  return rows;
}

// ── EXPORT ────────────────────────────────────────────────────────
router.get("/flows/:id/export", ...guard, async (req, res) => {
  try {
    if (!(await canTransfer(req))) {
      return res.status(403).json({ success: false, code: "TEAM_PERMISSION_DENIED", permission: "bot_manager.special", message: "Your team role doesn't allow exporting bots." });
    }
    const agencyId = agencyOf(req);
    const [[flow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!flow) return res.status(404).json({ success: false, message: "Flow not found" });
    if (flow.trigger_type === "QUICK_ACTION") return res.status(400).json({ success: false, message: "Quick Action replies can't be exported." });

    const warnings = [];
    const { value: nodes, removed } = stripSecrets(parse(flow.nodes_json));
    const { value: edges } = stripSecrets(parse(flow.edges_json));
    if (removed.length) warnings.push(`${removed.length} credential setting(s) were left out of the file.`);
    const unbound = stripAccountBound(nodes);
    if (unbound.length) warnings.push("Google Sheet / auto responder list choices were left out (they belong to this account).");

    // User Input Flows used by the flow are bundled in full (their own references too).
    const refs = collectRefs(nodes);
    const uifIds = idList(refs.userInputFlows);
    const [uifRows] = uifIds.length
      ? await pool.query("SELECT id, name, nodes_json, edges_json FROM user_input_flows WHERE agency_id = ? AND id IN (?)", [agencyId, uifIds])
      : [[]];
    const userInputFlows = uifRows.map((u) => {
      const uNodes = stripSecrets(parse(u.nodes_json)).value;
      stripAccountBound(uNodes);
      for (const [kind, ids] of Object.entries(collectRefs(uNodes))) ids.forEach((id) => (refs[kind] ||= new Set()).add(id));
      return { ref: u.id, name: u.name, nodes: uNodes, edges: stripSecrets(parse(u.edges_json)).value };
    });

    const [fieldRows] = refs.customFields?.size
      ? await pool.query("SELECT id, name, field_key, field_type, options FROM custom_field_definitions WHERE agency_id = ? AND id IN (?)", [agencyId, idList(refs.customFields)])
      : [[]];
    const labels = await namesOf("labels", "name", agencyId, idList(refs.labels), ", color");

    const file = {
      format: FORMAT,
      version: FORMAT_VERSION,
      minReaderVersion: MIN_READER_VERSION,
      exportedAt: new Date().toISOString(),
      flow: {
        name: flow.name,
        platform: flow.platform,
        triggerType: flow.trigger_type,
        triggerKeyword: flow.trigger_keyword,
        nodes,
        edges,
      },
      components: {
        userInputFlows,
        customFields: fieldRows.map((f) => ({ ref: f.id, name: f.name, key: f.field_key, type: f.field_type, options: parse(f.options, []) })),
        labels: labels.map((l) => ({ ref: l.id, name: l.name, color: l.color })),
        sequences: (await namesOf("sequences", "name", agencyId, idList(refs.sequences))).map((r) => ({ ref: r.id, name: r.name })),
        flows: (await namesOf("flows", "name", agencyId, idList(refs.flows).filter((id) => id !== flow.id))).map((r) => ({ ref: r.id, name: r.name })),
        whatsappTemplates: (await namesOf("whatsapp_templates", "template_name", agencyId, idList(refs.whatsappTemplates), ", language")).map((r) => ({ ref: r.id, name: r.name, language: r.language })),
        messengerTemplates: (await namesOf("messenger_utility_templates", "name", agencyId, idList(refs.messengerTemplates), ", language")).map((r) => ({ ref: r.id, name: r.name, language: r.language })),
        httpApiCampaigns: (await namesOf("http_api_campaigns", "name", agencyId, idList(refs.httpApiCampaigns))).map((r) => ({ ref: r.id, name: r.name })),
        appointmentCampaigns: (await namesOf("appointment_campaigns", "name", agencyId, idList(refs.appointmentCampaigns))).map((r) => ({ ref: r.id, name: r.name })),
      },
      selfRef: flow.id,
      notes: warnings,
    };
    return res.json({ success: true, file, warnings });
  } catch (err) {
    console.error("Flow export error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ── IMPORT ────────────────────────────────────────────────────────
router.post("/flows/import", ...guard, async (req, res) => {
  const agencyId = agencyOf(req);
  const integrationId = req.body?.integrationId;
  let raw = req.body?.file;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return res.status(400).json({ success: false, code: "INVALID_FILE", message: "The file isn't valid JSON." }); }
  }
  const checked = validateExportFile(raw);
  if (!checked.ok) return res.status(400).json({ success: false, code: "INVALID_FILE", message: checked.error });

  const integration = await getOwnedIntegration(agencyId, integrationId);
  if (!integration) return res.status(404).json({ success: false, message: "Choose one of your bot accounts to import into." });
  if (String(integration.platform).toUpperCase() === "TIKTOK") return res.status(400).json({ success: false, message: "TikTok bot accounts don't use flows." });

  const { file } = checked;
  const warnings = [...checked.warnings];
  const platform = String(integration.platform).toUpperCase();
  if (file.flow.platform && file.flow.platform !== platform) {
    warnings.push(`The bot was made for ${file.flow.platform} and is imported onto ${platform}. Check every element before switching it on.`);
  }
  warnings.push(...channelWarnings(file.flow.nodes, platform));

  const comps = file.components;
  const uifMap = componentMap(comps.userInputFlows);
  const fieldMap = componentMap(comps.customFields);
  const labelMap = componentMap(comps.labels);

  const conn = await pool.getConnection();
  try {
    if (uifMap.size) await assertLimit(agencyId, "max_user_input_flows", uifMap.size, req.user?.id);
    await conn.beginTransaction();

    const unlinked = {};
    const note = (kind, name) => { (unlinked[kind] ||= new Set()).add(name || "(unnamed)"); };
    const cache = new Map(); // `${kind}:${ref}` -> new value (null = unlinked)

    // Custom fields: same key in this workspace (revived if removed), else created. A system key maps to "sys:<key>".
    const resolveField = async (ref) => {
      const item = fieldMap.get(ref);
      if (!item) { note("customFields", `#${ref}`); return null; }
      const key = String(item.key || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 90);
      if (!key) { note("customFields", item.name); return null; }
      if (SYSTEM_FIELDS.some((f) => f.key === key)) return `sys:${key}`;
      const [[found]] = await conn.query("SELECT id, is_active FROM custom_field_definitions WHERE agency_id = ? AND field_key = ?", [agencyId, key]);
      if (found) {
        if (!found.is_active) await conn.query("UPDATE custom_field_definitions SET is_active = 1 WHERE id = ?", [found.id]);
        return found.id;
      }
      const type = ["TEXT", "NUMBER", "DATE", "SELECT"].includes(item.type) ? item.type : "TEXT";
      const [[{ sort }]] = await conn.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort FROM custom_field_definitions WHERE agency_id = ?", [agencyId]);
      const [ins] = await conn.query(
        "INSERT INTO custom_field_definitions (agency_id, name, field_key, field_type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [agencyId, String(item.name || key).slice(0, 100), key, type, type === "SELECT" ? JSON.stringify(Array.isArray(item.options) ? item.options.slice(0, 100) : []) : null, sort]
      );
      return ins.insertId;
    };

    // Labels: same name (case-insensitive) in this workspace, else created.
    const resolveLabel = async (ref) => {
      const item = labelMap.get(ref);
      const name = String(item?.name || "").trim().slice(0, 100);
      if (!name) { note("labels", `#${ref}`); return null; }
      const [[found]] = await conn.query("SELECT id FROM labels WHERE agency_id = ? AND LOWER(name) = LOWER(?)", [agencyId, name]);
      if (found) return found.id;
      const color = /^#[0-9a-f]{3,8}$/i.test(item.color || "") ? item.color : "#2563eb";
      const [ins] = await conn.query("INSERT INTO labels (agency_id, name, color) VALUES (?, ?, ?)", [agencyId, name, color]);
      return ins.insertId;
    };

    // Matched by name on the target bot account (bot-scope rule), else unlinked.
    const BY_NAME = {
      sequences: { list: "sequences", sql: "SELECT id FROM sequences WHERE agency_id = ? AND integration_id = ? AND name = ? LIMIT 1" },
      flows: { list: "flows", sql: "SELECT id FROM flows WHERE agency_id = ? AND integration_id = ? AND name = ? AND trigger_type <> 'QUICK_ACTION' LIMIT 1" },
      messengerTemplates: { list: "messengerTemplates", sql: "SELECT id FROM messenger_utility_templates WHERE agency_id = ? AND integration_id = ? AND name = ? LIMIT 1" },
      whatsappTemplates: { list: "whatsappTemplates", sql: "SELECT id FROM whatsapp_templates WHERE agency_id = ? AND integration_id = ? AND template_name = ? AND (? IS NULL OR language = ?) LIMIT 1", lang: true },
      httpApiCampaigns: { list: "httpApiCampaigns", sql: "SELECT id FROM http_api_campaigns WHERE agency_id = ? AND ? IS NOT NULL AND name = ? LIMIT 1" },
      appointmentCampaigns: { list: "appointmentCampaigns", sql: "SELECT id FROM appointment_campaigns WHERE agency_id = ? AND ? IS NOT NULL AND name = ? LIMIT 1" },
    };
    const byNameMaps = Object.fromEntries(Object.entries(BY_NAME).map(([kind, def]) => [kind, componentMap(comps[def.list])]));

    const uifNewIds = new Map();
    let resolveUif; // defined below (needs remapNodes)

    const resolve = async (kind, ref) => {
      const cacheKey = `${kind}:${ref}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      let value = null;
      if (kind === "customFields") value = await resolveField(ref);
      else if (kind === "labels") value = await resolveLabel(ref);
      else if (kind === "userInputFlows") value = await resolveUif(ref);
      else if (kind === "flows" && Number(ref) === Number(raw.selfRef)) value = "__SELF__";
      else if (BY_NAME[kind]) {
        const item = byNameMaps[kind].get(ref);
        if (item?.name) {
          const def = BY_NAME[kind];
          const params = def.lang ? [agencyId, integration.id, item.name, item.language || null, item.language || null] : [agencyId, integration.id, item.name];
          const [[found]] = await conn.query(def.sql, params);
          value = found ? found.id : null;
        }
        if (value === null) note(kind, item?.name || `#${ref}`);
      } else {
        note(kind, `#${ref}`);
      }
      cache.set(cacheKey, value);
      return value;
    };

    // Rewrites every reference in a node list (two passes: collect, then replace — the visitor is sync).
    const remapNodes = async (nodes) => {
      const wanted = [];
      visitRefs(nodes, ({ kind, id }) => { wanted.push([kind, id]); return undefined; });
      for (const [kind, id] of wanted) await resolve(kind, id);
      visitRefs(nodes, ({ kind, id }) => {
        const v = cache.get(`${kind}:${id}`);
        return v === undefined ? null : v;
      });
      // Display-name snapshots next to cleared ids would lie — clear them too.
      for (const n of nodes) {
        const d = n?.data;
        if (!d || typeof d !== "object") continue;
        if (d.userInputFlowId === null) d.userInputFlowName = "";
        if (d.sequenceId === null) d.sequenceName = "";
        if (d.flowId === null) d.flowName = "";
        if (d.messengerTemplateId === null) d.messengerTemplateName = "";
        if (n.type === "whatsappTemplate" && d.templateId === null) { d.templateName = ""; d.templateMeta = null; }
        if (d.autoResponderId !== undefined) {
          // Re-link an auto responder by its connection name in this workspace; its list must be re-chosen.
          const [[ar]] = d.autoResponderName
            ? await conn.query("SELECT id FROM auto_responder_integrations WHERE agency_id = ? AND name = ? LIMIT 1", [agencyId, d.autoResponderName])
            : [[null]];
          d.autoResponderId = ar ? ar.id : null;
          if (!ar && d.autoResponderName) note("autoResponders", d.autoResponderName);
        }
      }
      return nodes;
    };

    const [existingUifNames] = await conn.query("SELECT name FROM user_input_flows WHERE agency_id = ? AND integration_id = ?", [agencyId, integration.id]);
    const uifNames = new Set(existingUifNames.map((r) => r.name));
    resolveUif = async (ref) => {
      if (uifNewIds.has(ref)) return uifNewIds.get(ref);
      const item = uifMap.get(ref);
      if (!item || !Array.isArray(item.nodes)) { note("userInputFlows", `#${ref}`); return null; }
      uifNewIds.set(ref, null); // guards a (malformed) self reference
      const uNodes = await remapNodes(JSON.parse(JSON.stringify(item.nodes)));
      const uEdges = Array.isArray(item.edges) ? item.edges : [];
      const name = uniqueName(String(item.name || "Imported form").slice(0, 180), uifNames);
      uifNames.add(name);
      const [ins] = await conn.query(
        "INSERT INTO user_input_flows (agency_id, name, platform, integration_id, nodes_json, edges_json) VALUES (?, ?, ?, ?, ?, ?)",
        [agencyId, name, platform, integration.id, JSON.stringify(uNodes), JSON.stringify(uEdges)]
      );
      uifNewIds.set(ref, ins.insertId);
      return ins.insertId;
    };

    const nodes = await remapNodes(JSON.parse(JSON.stringify(file.flow.nodes)));
    stripAccountBound(nodes);
    // The flow's own id (a button looping back to this bot) is filled in after the insert.
    const [existingNames] = await conn.query("SELECT name FROM flows WHERE agency_id = ? AND integration_id = ?", [agencyId, integration.id]);
    const name = uniqueName(String(req.body?.name || file.flow.name).trim().slice(0, 180) || file.flow.name, existingNames.map((r) => r.name));

    const [ins] = await conn.query(
      `INSERT INTO flows (agency_id, integration_id, name, platform, trigger_keyword, trigger_type, nodes_json, edges_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [agencyId, integration.id, name, platform, file.flow.triggerKeyword, file.flow.triggerType, "[]", JSON.stringify(file.flow.edges)]
    );
    const newFlowId = ins.insertId;
    const finalNodesJson = JSON.stringify(nodes).replace(/"__SELF__"/g, String(newFlowId));
    await conn.query("UPDATE flows SET nodes_json = ? WHERE id = ?", [finalNodesJson, newFlowId]);

    await conn.commit();

    // Last line of defence: the result must only point at this bot's own components.
    // Checked after the commit — the check reads through the pool, which can't see
    // this transaction's new forms — and undone if anything points elsewhere.
    const bad = await findOutOfScopeRefs({ agencyId, integrationId: integration.id, nodes: JSON.parse(finalNodesJson) });
    if (bad.length) {
      await pool.query("DELETE FROM flows WHERE id = ? AND agency_id = ?", [newFlowId, agencyId]);
      const created = [...uifNewIds.values()].filter(Boolean);
      if (created.length) await pool.query("DELETE FROM user_input_flows WHERE id IN (?) AND agency_id = ?", [created, agencyId]);
      return res.status(400).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: describeOutOfScope(bad, integration.id) });
    }

    const LABELS = {
      customFields: "custom fields", labels: "labels", userInputFlows: "User Input Flows", sequences: "sequences",
      flows: "other flows", whatsappTemplates: "WhatsApp templates", messengerTemplates: "Utility templates",
      httpApiCampaigns: "HTTP API campaigns", appointmentCampaigns: "appointment campaigns", autoResponders: "auto responders",
    };
    for (const [kind, names] of Object.entries(unlinked)) {
      warnings.push(`Not found on this bot, so unlinked — ${LABELS[kind] || kind}: ${[...names].slice(0, 8).join(", ")}${names.size > 8 ? ", …" : ""}. Re-select them in the builder.`);
    }
    if (uifNewIds.size) warnings.push(`${[...uifNewIds.values()].filter(Boolean).length} User Input Flow(s) were created for this bot.`);

    return res.status(201).json({
      success: true,
      message: "Bot imported — it's switched off until you turn it on.",
      flowId: newFlowId,
      flow: { id: newFlowId, name, platform, integration_id: integration.id, is_active: 0 },
      warnings,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.status) return res.status(err.status).json({ success: false, message: err.message, code: err.code });
    console.error("Flow import error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

export default router;
