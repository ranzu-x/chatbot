import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";

/**
 * Periodically processes scheduled drip sequence messages
 */
export async function processDripSequences() {
  try {
    // Find active subscribers due for execution
    const [subscribers] = await pool.query(
      `SELECT ss.id as sub_id, ss.sequence_id, ss.contact_id, ss.current_step,
              s.agency_id, s.platform, c.external_id, c.name, c.phone
       FROM sequence_subscribers ss
       JOIN sequences s ON s.id = ss.sequence_id
       JOIN contacts c  ON c.id = ss.contact_id
       WHERE ss.status = 'ACTIVE' AND ss.next_run_at <= NOW() AND s.is_active = 1
       LIMIT 50`
    );

    for (const sub of subscribers) {
      try {
        // Fetch sequence item for current step
        const [items] = await pool.query(
          "SELECT * FROM sequence_items WHERE sequence_id = ? AND step_number = ?",
          [sub.sequence_id, sub.current_step]
        );

        if (!items.length) {
          // No step found, mark sequence completed
          await pool.query(
            "UPDATE sequence_subscribers SET status = 'COMPLETED' WHERE id = ?",
            [sub.sub_id]
          );
          continue;
        }

        const step = items[0];

        // Fetch active integration
        const [integrations] = await pool.query(
          "SELECT * FROM integrations WHERE agency_id = ? AND platform = ? AND is_active = 1 LIMIT 1",
          [sub.agency_id, sub.platform]
        );

        if (integrations.length) {
          let bodyText = step.message_body || "";
          bodyText = bodyText
            .replace(/\{\{name\}\}/gi, sub.name || "Customer")
            .replace(/\{\{phone\}\}/gi, sub.phone || "");

          await sendPlatformMessage(sub.platform, integrations[0], sub.external_id, {
            type: "TEXT",
            body: bodyText,
          });
        }

        // Check if next step exists
        const nextStepNum = sub.current_step + 1;
        const [nextItems] = await pool.query(
          "SELECT * FROM sequence_items WHERE sequence_id = ? AND step_number = ?",
          [sub.sequence_id, nextStepNum]
        );

        if (nextItems.length) {
          const delayMins = nextItems[0].delay_minutes || 60;
          await pool.query(
            `UPDATE sequence_subscribers 
             SET current_step = ?, next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
             WHERE id = ?`,
            [nextStepNum, delayMins, sub.sub_id]
          );
        } else {
          // Sequence completed!
          await pool.query(
            "UPDATE sequence_subscribers SET status = 'COMPLETED' WHERE id = ?",
            [sub.sub_id]
          );
        }
      } catch (subErr) {
        console.error(`Error processing sequence subscriber #${sub.sub_id}:`, subErr.message);
      }
    }
  } catch (err) {
    console.error("Drip sequence processing error:", err);
  }
}

/**
 * Start 1-minute interval background timer for drip sequences
 */
export function startSequenceScheduler() {
  console.log("⏱️ Drip Sequence Scheduler started (runs every 60 seconds)");
  setInterval(processDripSequences, 60000);
}
