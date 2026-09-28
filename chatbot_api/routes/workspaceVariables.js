/**
 * Subscriber Manager → Fields & Variables: workspace variables
 * ({{var.<key>}}, utils/workspaceVariables.js) and the read-only list of
 * system fields (utils/systemFields.js). Custom fields stay in
 * routes/customFields.js. Writes need subscribers.update for team members
 * (middleware/teamPermissions.js).
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { SYSTEM_FIELDS } from "../utils/systemFields.js";
import { VAR_KEY_RE, slugifyVarKey, invalidateWorkspaceVariables } from "../utils/workspaceVariables.js";

const router = express.Router();
router.use("/workspace-variables", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const MAX_VARIABLES = 500;
const MAX_VALUE = 2000;
const agencyOf = (req) => req.tenant?.agencyId || req.user?.agencyId;

function clean(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "Name is required" };
    if (name.length > 100) return { error: "Name can be at most 100 characters" };
    out.name = name;
  }
  if (body.value !== undefined) {
    const value = String(body.value ?? "");
    if (value.length > MAX_VALUE) return { error: `Value can be at most ${MAX_VALUE} characters` };
    out.value = value;
  }
  if (body.description !== undefined) out.description = String(body.description ?? "").trim().slice(0, 255) || null;
  return { values: out };
}

/** Flows of this workspace whose content uses {{var.key}} (for a safe delete). */
async function usageOf(agencyId, key) {
  const [rows] = await pool.query(
    "SELECT id, name FROM flows WHERE agency_id = ? AND nodes_json LIKE ? LIMIT 20",
    [agencyId, `%{{var.${key}}}%`]
  );
  return rows;
}

router.get("/workspace-variables/system-fields", (req, res) => {
  res.json({ success: true, fields: SYSTEM_FIELDS.map(({ key, label, type, placeholder }) => ({ key, label, type, placeholder, ref: `sys:${key}` })) });
});

router.get("/workspace-variables", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, var_key, name, value, description, updated_at FROM workspace_variables WHERE agency_id = ? ORDER BY name ASC LIMIT ?",
      [agencyOf(req), MAX_VARIABLES]
    );
    return res.json({ success: true, variables: rows });
  } catch (err) {
    console.error("GET /workspace-variables error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/workspace-variables", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const { values, error } = clean(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });
    const key = req.body?.key ? String(req.body.key).trim().toLowerCase() : slugifyVarKey(values.name);
    if (!VAR_KEY_RE.test(key)) return res.status(400).json({ success: false, message: "The key must start with a letter and use only a–z, 0–9 and _ (max 64)." });
    if (["contact", "order"].includes(key)) return res.status(400).json({ success: false, message: "That key is reserved" });
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM workspace_variables WHERE agency_id = ?", [agencyId]);
    if (n >= MAX_VARIABLES) return res.status(400).json({ success: false, message: `A workspace can have at most ${MAX_VARIABLES} variables.` });
    const [[dup]] = await pool.query("SELECT id FROM workspace_variables WHERE agency_id = ? AND var_key = ?", [agencyId, key]);
    if (dup) return res.status(409).json({ success: false, message: `A variable with the key "${key}" already exists` });
    const [result] = await pool.query(
      "INSERT INTO workspace_variables (agency_id, var_key, name, value, description) VALUES (?, ?, ?, ?, ?)",
      [agencyId, key, values.name, values.value ?? "", values.description ?? null]
    );
    invalidateWorkspaceVariables(agencyId);
    const [[row]] = await pool.query("SELECT id, var_key, name, value, description, updated_at FROM workspace_variables WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, variable: row, message: "Variable created" });
  } catch (err) {
    console.error("POST /workspace-variables error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// The key never changes (messages already use it); name, value and description do.
router.put("/workspace-variables/:id", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const { values, error } = clean(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ success: false, message: error });
    const cols = Object.keys(values);
    if (!cols.length) return res.status(400).json({ success: false, message: "Nothing to update" });
    const [result] = await pool.query(
      `UPDATE workspace_variables SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND agency_id = ?`,
      [...cols.map((c) => values[c]), req.params.id, agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Variable not found" });
    invalidateWorkspaceVariables(agencyId);
    const [[row]] = await pool.query("SELECT id, var_key, name, value, description, updated_at FROM workspace_variables WHERE id = ?", [req.params.id]);
    return res.json({ success: true, variable: row, message: "Variable updated" });
  } catch (err) {
    console.error("PUT /workspace-variables error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Refused while a flow still uses it, unless ?force=1 (the token then sends as empty text).
router.delete("/workspace-variables/:id", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[row]] = await pool.query("SELECT id, var_key FROM workspace_variables WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!row) return res.status(404).json({ success: false, message: "Variable not found" });
    if (req.query.force !== "1") {
      const used = await usageOf(agencyId, row.var_key);
      if (used.length) {
        return res.status(409).json({
          success: false, code: "VARIABLE_IN_USE", flows: used,
          message: `{{var.${row.var_key}}} is used in ${used.length}${used.length === 20 ? "+" : ""} flow(s): ${used.slice(0, 3).map((f) => f.name).join(", ")}`,
        });
      }
    }
    await pool.query("DELETE FROM workspace_variables WHERE id = ? AND agency_id = ?", [row.id, agencyId]);
    invalidateWorkspaceVariables(agencyId);
    return res.json({ success: true, message: "Variable deleted" });
  } catch (err) {
    console.error("DELETE /workspace-variables error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
