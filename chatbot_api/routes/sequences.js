import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ─── LIST SEQUENCES ───────────────────────────────────────────────────────────
router.get("/sequences", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [sequences] = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM sequence_items WHERE sequence_id = s.id) as step_count,
              (SELECT COUNT(*) FROM sequence_subscribers WHERE sequence_id = s.id) as subscriber_count
       FROM sequences s
       WHERE s.agency_id = ?
       ORDER BY s.created_at DESC`,
      [agencyId]
    );

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
      "SELECT * FROM sequences WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!seqs.length) {
      return res.status(404).json({ success: false, message: "Sequence not found" });
    }

    const [items] = await pool.query(
      "SELECT * FROM sequence_items WHERE sequence_id = ? ORDER BY step_number ASC",
      [req.params.id]
    );

    const [subscribers] = await pool.query(
      `SELECT ss.*, c.name as contact_name, c.phone, c.email, c.platform
       FROM sequence_subscribers ss
       JOIN contacts c ON c.id = ss.contact_id
       WHERE ss.sequence_id = ?
       ORDER BY ss.subscribed_at DESC`,
      [req.params.id]
    );

    return res.json({ success: true, sequence: seqs[0], items, subscribers });
  } catch (err) {
    console.error("Get sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE DRIP SEQUENCE ─────────────────────────────────────────────────────
router.post("/sequences", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, platform = "WHATSAPP", steps = [] } = req.body;

    if (!name || steps.length === 0) {
      return res.status(400).json({ success: false, message: "Sequence name and at least one step are required" });
    }

    const [seqResult] = await pool.query(
      "INSERT INTO sequences (agency_id, name, platform, is_active, created_at) VALUES (?, ?, ?, 1, NOW())",
      [agencyId, name, platform]
    );

    const sequenceId = seqResult.insertId;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await pool.query(
        "INSERT INTO sequence_items (sequence_id, delay_minutes, message_body, step_number) VALUES (?, ?, ?, ?)",
        [sequenceId, parseInt(step.delayMinutes || 0), step.messageBody, i + 1]
      );
    }

    const [created] = await pool.query("SELECT * FROM sequences WHERE id = ?", [sequenceId]);

    return res.status(201).json({ success: true, message: "Drip sequence created", sequence: created[0] });
  } catch (err) {
    console.error("Create sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ENROLL / SUBSCRIBE CONTACTS TO SEQUENCE ─────────────────────────────────
router.post("/sequences/:id/subscribe", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactId, targetPlatform } = req.body;

    const [seqs] = await pool.query(
      "SELECT * FROM sequences WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!seqs.length) {
      return res.status(404).json({ success: false, message: "Sequence not found" });
    }

    const [items] = await pool.query(
      "SELECT delay_minutes FROM sequence_items WHERE sequence_id = ? AND step_number = 1",
      [req.params.id]
    );

    const initialDelayMins = items.length ? items[0].delay_minutes : 0;

    let targetContacts = [];
    if (contactId) {
      const [c] = await pool.query("SELECT id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
      targetContacts = c;
    } else {
      let q = "SELECT id FROM contacts WHERE agency_id = ?";
      const p = [agencyId];
      if (targetPlatform) {
        q += " AND platform = ?";
        p.push(targetPlatform);
      }
      const [c] = await pool.query(q, p);
      targetContacts = c;
    }

    let enrolledCount = 0;
    for (const c of targetContacts) {
      // Upsert subscriber
      const [existing] = await pool.query(
        "SELECT id FROM sequence_subscribers WHERE sequence_id = ? AND contact_id = ?",
        [req.params.id, c.id]
      );

      if (!existing.length) {
        await pool.query(
          `INSERT INTO sequence_subscribers 
           (sequence_id, contact_id, current_step, next_run_at, status, subscribed_at)
           VALUES (?, ?, 1, DATE_ADD(NOW(), INTERVAL ? MINUTE), 'ACTIVE', NOW())`,
          [req.params.id, c.id, initialDelayMins]
        );
        enrolledCount++;
      }
    }

    return res.json({ success: true, message: `Enrolled ${enrolledCount} contacts into drip sequence!` });
  } catch (err) {
    console.error("Subscribe sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE SEQUENCE ─────────────────────────────────────────────────────────
router.delete("/sequences/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM sequences WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Sequence deleted" });
  } catch (err) {
    console.error("Delete sequence error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
