import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";

const router = express.Router();
router.use("/sequences", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_sequences"));

// A sequence sends from ONE explicit channel account — never "whichever
// active integration for this platform comes back first" (see
// utils/sequenceRunner.js's now-fixed fallback, and the identical bug fixed
// earlier for Broadcasting, routes/broadcasts.js). Only auto-picks when
// there's exactly one candidate; otherwise the caller must choose explicitly.
async function resolveDefaultIntegrationId(agencyId, platform) {
  const [rows] = await pool.query(
    "SELECT id FROM integrations WHERE agency_id = ? AND platform = ? AND is_active = 1",
    [agencyId, platform]
  );
  return rows.length === 1 ? rows[0].id : null;
}

async function validateIntegration(agencyId, platform, integrationId) {
  if (!integrationId) return null;
  const [[row]] = await pool.query(
    "SELECT id FROM integrations WHERE id = ? AND agency_id = ? AND platform = ? AND is_active = 1",
    [integrationId, agencyId, platform]
  );
  return row ? integrationId : null;
}

/**
 * Enrolls one or more contacts into a Sequence. Shared by the HTTP
 * subscribe route below AND the "Start Sequence" Flow Builder node /
 * button action (utils/flowEngine.js) so there's exactly one implementation
 * of the enrollment rules:
 *  - Already ACTIVE in this sequence → no-op (skip), never double-enrolled.
 *  - Previously COMPLETED/STOPPED/PAUSED in this sequence → restarts from
 *    the beginning (explicit re-enrollment, not silently ignored).
 *  - Concurrent enrollment in OTHER sequences is unaffected — this only
 *    ever touches rows for `sequenceId`.
 * Returns the number of contacts actually (re)started.
 */
export async function enrollContactsInSequence(sequenceId, agencyId, { contactId, targetPlatform, enrolledVia = null } = {}) {
  const [seqRows] = await pool.query("SELECT * FROM sequences WHERE id = ? AND agency_id = ?", [sequenceId, agencyId]);
  if (!seqRows.length) return { enrolled: 0, error: "Sequence not found" };

  let targetContacts = [];
  if (contactId) {
    const [c] = await pool.query("SELECT id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
    targetContacts = c;
  } else {
    let q = "SELECT id FROM contacts WHERE agency_id = ?";
    const p = [agencyId];
    if (targetPlatform) { q += " AND platform = ?"; p.push(targetPlatform); }
    const [c] = await pool.query(q, p);
    targetContacts = c;
  }

  let enrolledCount = 0;
  for (const c of targetContacts) {
    const [existing] = await pool.query(
      "SELECT id, status FROM sequence_subscribers WHERE sequence_id = ? AND contact_id = ?",
      [sequenceId, c.id]
    );

    if (!existing.length) {
      await pool.query(
        `INSERT INTO sequence_subscribers
         (sequence_id, contact_id, current_node_id, next_run_at, status, enrolled_via, subscribed_at)
         VALUES (?, ?, NULL, NOW(), 'ACTIVE', ?, NOW())`,
        [sequenceId, c.id, enrolledVia]
      );
      enrolledCount++;
    } else if (existing[0].status !== "ACTIVE") {
      await pool.query(
        `UPDATE sequence_subscribers
         SET status = 'ACTIVE', current_node_id = NULL, next_run_at = NOW(), enrolled_via = ?, subscribed_at = NOW()
         WHERE id = ?`,
        [enrolledVia, existing[0].id]
      );
      enrolledCount++;
    }
    // else: already ACTIVE — no-op, per the dedupe rule above.
  }

  return { enrolled: enrolledCount };
}

/** Stops a contact's enrollment in a Sequence. Shared by the HTTP unsubscribe
 * route and the "Stop Sequence" Flow Builder node / button action. */
export async function unsubscribeContactFromSequence(sequenceId, agencyId, contactId) {
  const [seqRows] = await pool.query("SELECT id FROM sequences WHERE id = ? AND agency_id = ?", [sequenceId, agencyId]);
  if (!seqRows.length) return { stopped: 0, error: "Sequence not found" };

  const [result] = await pool.query(
    "UPDATE sequence_subscribers SET status = 'STOPPED' WHERE sequence_id = ? AND contact_id = ? AND status = 'ACTIVE'",
    [sequenceId, contactId]
  );
  return { stopped: result.affectedRows };
}

// ─── LIST SEQUENCES ───────────────────────────────────────────────────────────
router.get("/sequences", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId } = req.query;
    let sql = `SELECT s.*, i.name as integration_name, i.wa_display_phone,
              (SELECT COUNT(*) FROM sequence_subscribers WHERE sequence_id = s.id) as subscriber_count,
              (SELECT COUNT(*) FROM sequence_subscribers WHERE sequence_id = s.id AND status = 'ACTIVE') as active_count,
              (SELECT COUNT(*) FROM sequence_subscribers WHERE sequence_id = s.id AND status = 'COMPLETED') as completed_count,
              (SELECT COUNT(*) FROM sequence_subscriber_log sl JOIN sequence_subscribers ss ON ss.id = sl.subscriber_id
                WHERE ss.sequence_id = s.id AND sl.status = 'SENT') as sent_count,
              (SELECT COUNT(*) FROM sequence_subscriber_log sl JOIN sequence_subscribers ss ON ss.id = sl.subscriber_id
                WHERE ss.sequence_id = s.id AND sl.status = 'SKIPPED_WINDOW') as skipped_count,
              (SELECT COUNT(*) FROM sequence_subscriber_log sl JOIN sequence_subscribers ss ON ss.id = sl.subscriber_id
                WHERE ss.sequence_id = s.id AND sl.status = 'FAILED') as failed_count,
              (SELECT MAX(sl.created_at) FROM sequence_subscriber_log sl JOIN sequence_subscribers ss ON ss.id = sl.subscriber_id
                WHERE ss.sequence_id = s.id) as last_activity_at
       FROM sequences s
       LEFT JOIN integrations i ON i.id = s.integration_id
       WHERE s.agency_id = ?`;
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      sql += " AND s.integration_id = ?";
      params.push(integrationId);
    }
    sql += " ORDER BY s.updated_at DESC";
    const [sequences] = await pool.query(sql, params);

    // How many actual messages this sequence sends — everything except the
    // Start node and Wait (timing-only) nodes. JSON_LENGTH would count those
    // too, so this is computed here rather than in SQL. Used by the "Start
    // Sequence" node card (FlowBuilderPage.jsx) and the Sequences list page.
    for (const seq of sequences) {
      try {
        const nodes = JSON.parse(seq.nodes_json || "[]");
        seq.message_count = nodes.filter((n) => n.type !== "start" && n.type !== "wait").length;
      } catch {
        seq.message_count = 0;
      }
    }

    return res.json({ success: true, sequences });
  } catch (err) {
    console.error("List sequences error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET SEQUENCE DETAILS ─────────────────────────────────────────────────────
router.get("/sequences/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [seqs] = await pool.query(
      `SELECT s.*, i.name as integration_name, i.wa_display_phone
       FROM sequences s
       LEFT JOIN integrations i ON i.id = s.integration_id
       WHERE s.id = ? AND s.agency_id = ?`,
      [req.params.id, agencyId]
    );
    if (!seqs.length) {
      return res.status(404).json({ success: false, message: "Sequence not found" });
    }

    const [subscribers] = await pool.query(
      `SELECT ss.*, c.name as contact_name, c.phone, c.email, c.platform
       FROM sequence_subscribers ss
       JOIN contacts c ON c.id = ss.contact_id
       WHERE ss.sequence_id = ?
       ORDER BY ss.subscribed_at DESC
       LIMIT 200`,
      [req.params.id]
    );

    return res.json({ success: true, sequence: seqs[0], subscribers });
  } catch (err) {
    console.error("Get sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELIVERY LOG (Sequence Message report drill-down) ───────────────────────
// One row per attempted send (SENT / SKIPPED_WINDOW / FAILED), with the
// contact name and the actual step's label so a skip/failure is
// self-diagnosable from the Bot Manager report — this is exactly what
// surfaced the real "wrong integration picked → stale conversation → looked
// outside the window" bug (see utils/sequenceRunner.js) directly from real
// data instead of guessing.
router.get("/sequences/:id/log", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [seqs] = await pool.query("SELECT * FROM sequences WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!seqs.length) return res.status(404).json({ success: false, message: "Sequence not found" });

    const [rows] = await pool.query(
      `SELECT sl.id, sl.node_id, sl.status, sl.detail, sl.created_at,
              c.id as contact_id, c.name as contact_name, c.phone, c.email
       FROM sequence_subscriber_log sl
       JOIN sequence_subscribers ss ON ss.id = sl.subscriber_id
       JOIN contacts c ON c.id = ss.contact_id
       WHERE ss.sequence_id = ?
       ORDER BY sl.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );

    let nodeLabels = {};
    try {
      const nodes = JSON.parse(seqs[0].nodes_json || "[]");
      nodeLabels = Object.fromEntries(nodes.map((n) => [n.id, n.data?.label || n.type]));
    } catch { /* leave labels empty, node ids alone still identify the step */ }

    const log = rows.map((r) => ({ ...r, node_label: nodeLabels[r.node_id] || r.node_id }));
    return res.json({ success: true, log });
  } catch (err) {
    console.error("Get sequence log error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE SEQUENCE ──────────────────────────────────────────────────────────
router.post("/sequences", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, platform = "WHATSAPP" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Sequence name is required" });
    }

    let integrationId = await validateIntegration(agencyId, platform, req.body.integrationId);
    if (!integrationId) {
      integrationId = await resolveDefaultIntegrationId(agencyId, platform);
    }
    if (!integrationId) {
      return res.status(400).json({
        success: false,
        message: req.body.integrationId
          ? "That account isn't a valid, active integration for this platform."
          : "Choose which connected account this sequence should send from.",
      });
    }

    const [seqResult] = await pool.query(
      "INSERT INTO sequences (agency_id, name, platform, integration_id, is_active, nodes_json, edges_json, created_at) VALUES (?, ?, ?, ?, 1, NULL, NULL, NOW())",
      [agencyId, name.trim(), platform, integrationId]
    );

    const [created] = await pool.query("SELECT * FROM sequences WHERE id = ?", [seqResult.insertId]);
    return res.status(201).json({ success: true, sequence: created[0] });
  } catch (err) {
    console.error("Create sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE SEQUENCE (canvas save / rename / active toggle) ──────────────────
router.put("/sequences/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [owned] = await pool.query("SELECT id, platform, integration_id FROM sequences WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!owned.length) return res.status(404).json({ success: false, message: "Sequence not found" });

    // Accepts nodes_json/edges_json as already-serialized strings, matching
    // flowAPI/userInputFlowAPI's convention (the Flow Builder pre-serializes
    // before calling update) — not raw arrays.
    const { name, nodes_json, edges_json, isActive, integrationId } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push("name = ?"); params.push(name); }
    if (nodes_json !== undefined) { fields.push("nodes_json = ?"); params.push(nodes_json); }
    if (edges_json !== undefined) { fields.push("edges_json = ?"); params.push(edges_json); }
    if (isActive !== undefined) { fields.push("is_active = ?"); params.push(isActive ? 1 : 0); }
    if (integrationId !== undefined) {
      const validated = await validateIntegration(agencyId, owned[0].platform, integrationId);
      if (!validated) {
        return res.status(400).json({ success: false, message: "That account isn't a valid, active integration for this platform." });
      }
      fields.push("integration_id = ?"); params.push(validated);
    }
    // Note: `platform` is intentionally NOT editable here, same reasoning as
    // user_input_flows.platform — a Sequence authored for one channel's node
    // set shouldn't silently start being interpreted as another channel's.

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    params.push(req.params.id);
    await pool.query(`UPDATE sequences SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`, params);

    const [updated] = await pool.query("SELECT * FROM sequences WHERE id = ?", [req.params.id]);
    return res.json({ success: true, sequence: updated[0] });
  } catch (err) {
    console.error("Update sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ENROLL / SUBSCRIBE CONTACTS TO SEQUENCE ─────────────────────────────────
router.post("/sequences/:id/subscribe", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactId, targetPlatform } = req.body;
    const result = await enrollContactsInSequence(req.params.id, agencyId, { contactId, targetPlatform, enrolledVia: "API" });
    if (result.error) return res.status(404).json({ success: false, message: result.error });
    return res.json({ success: true, message: `Enrolled ${result.enrolled} contact(s) into the sequence.` });
  } catch (err) {
    console.error("Subscribe sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── STOP A CONTACT'S ENROLLMENT ──────────────────────────────────────────────
router.post("/sequences/:id/unsubscribe", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactId } = req.body;
    if (!contactId) return res.status(400).json({ success: false, message: "contactId is required" });
    const result = await unsubscribeContactFromSequence(req.params.id, agencyId, contactId);
    if (result.error) return res.status(404).json({ success: false, message: result.error });
    return res.json({ success: true, message: result.stopped ? "Stopped" : "Contact was not actively enrolled" });
  } catch (err) {
    console.error("Unsubscribe sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE SEQUENCE ─────────────────────────────────────────────────────────
router.delete("/sequences/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [owned] = await pool.query("SELECT id FROM sequences WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!owned.length) return res.status(404).json({ success: false, message: "Sequence not found" });

    // Refuse while any Flow still references this sequence via a
    // startSequenceAction/stopSequenceAction node — same guard shape as
    // user_input_flows' delete route (nodes_json is a JSON blob, not a real
    // FK, so this is a LIKE scan rather than a relational constraint).
    const [referencing] = await pool.query(
      `SELECT id, name FROM flows WHERE agency_id = ? AND (nodes_json LIKE ? OR nodes_json LIKE ?)`,
      [agencyId, `%"sequenceId":${req.params.id}%`, `%"sequenceId":"${req.params.id}"%`]
    );
    if (referencing.length) {
      return res.status(409).json({
        success: false,
        message: `Can't delete — still used by flow(s): ${referencing.map((f) => f.name).join(", ")}. Remove the Start/Stop Sequence node there first.`,
      });
    }

    await pool.query("DELETE FROM sequences WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Sequence deleted" });
  } catch (err) {
    console.error("Delete sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
