import pool from "../db.js";

/**
 * Per-step flow analytics (table flow_step_stats, migrate_flow_analytics.js).
 *
 * The engine calls bumpStepStat as things happen:
 *   reached    utils/flowEngine.js main loop — a step ran
 *   sent/failed flowEngine sendMsg — the step's message went out / was refused
 *   clicked    a tapped button / quick reply / list item (handle btn-0…), or a
 *              Randomizer branch taken (handle branch-0…)
 *   delivered/read  trackMessageReceipt, from the channel's receipt webhooks
 *
 * Counting never gets in the way of a conversation: every write here swallows
 * its own errors. The stats row's agency comes from the flow itself.
 */
const FIELDS = new Set(["reached", "sent", "failed", "delivered", "read_count", "clicked"]);

export async function bumpStepStat({ flowId, nodeId, handle = "", field, by = 1 }) {
  if (!flowId || !nodeId || !FIELDS.has(field)) return;
  try {
    await pool.query(
      `INSERT INTO flow_step_stats (agency_id, flow_id, node_id, handle, stat_date, ${field})
       SELECT agency_id, id, ?, ?, CURDATE(), ? FROM flows WHERE id = ?
       ON DUPLICATE KEY UPDATE ${field} = ${field} + VALUES(${field})`,
      [String(nodeId).slice(0, 191), String(handle || "").slice(0, 64), by, flowId]
    );
  } catch (err) {
    console.error("[FlowStats] bump failed:", err.message);
  }
}

/**
 * A delivery or read receipt for one stored message. Counts it once per
 * message (the first receipt of each kind, claimed atomically on
 * delivered_at / read_at) and only for messages a flow step sent (their
 * metadata carries flowId / nodeId). A read implies delivered.
 */
export async function trackMessageReceipt(messageId, kind) {
  if (!messageId) return;
  try {
    const [[m]] = await pool.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.flowId')) AS flowId,
              JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.nodeId')) AS nodeId
         FROM messages WHERE id = ? AND direction = 'OUTBOUND'`,
      [messageId]
    );
    const tracked = m && m.flowId && m.flowId !== "null" && m.nodeId && m.nodeId !== "null";
    const [d] = await pool.query("UPDATE messages SET delivered_at = NOW() WHERE id = ? AND delivered_at IS NULL", [messageId]);
    if (tracked && d.changedRows) await bumpStepStat({ flowId: Number(m.flowId), nodeId: m.nodeId, field: "delivered" });
    if (kind === "read") {
      const [r] = await pool.query("UPDATE messages SET read_at = NOW(), is_read = 1 WHERE id = ? AND read_at IS NULL", [messageId]);
      if (tracked && r.changedRows) await bumpStepStat({ flowId: Number(m.flowId), nodeId: m.nodeId, field: "read_count" });
    }
  } catch (err) {
    console.error("[FlowStats] receipt failed:", err.message);
  }
}

/** Randomizer: picks a branch index by weight (weights need not add up to 100). */
export function pickWeightedBranch(branches, rand = Math.random) {
  const weights = (Array.isArray(branches) ? branches : []).map((b) => Math.max(0, Number(b?.weight) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return -1;
  if (total <= 0) return Math.floor(rand() * weights.length);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1;
}

/**
 * Totals per step and per output for one flow of this workspace over the
 * last `days` days (0 = all time), plus flow entries per day.
 */
export async function getFlowAnalytics(agencyId, flowId, days = 30, startNodeId = null) {
  const since = Number(days) > 0 ? Math.min(3650, Math.floor(Number(days))) : null;
  const dateClause = since ? " AND stat_date >= CURDATE() - INTERVAL ? DAY" : "";
  const params = since ? [flowId, agencyId, since - 1] : [flowId, agencyId];
  const [rows] = await pool.query(
    `SELECT node_id, handle, SUM(reached) reached, SUM(sent) sent, SUM(failed) failed,
            SUM(delivered) delivered, SUM(read_count) read_count, SUM(clicked) clicked
       FROM flow_step_stats WHERE flow_id = ? AND agency_id = ?${dateClause}
      GROUP BY node_id, handle`,
    params
  );
  const steps = {};
  for (const r of rows) {
    // A Message Block runs as "<blockId>~<itemId>" steps — counted on the block.
    const nodeId = String(r.node_id).split("~")[0];
    const step = (steps[nodeId] ||= { reached: 0, sent: 0, failed: 0, delivered: 0, read: 0, clicked: 0, outputs: {} });
    const c = { reached: Number(r.reached), sent: Number(r.sent), failed: Number(r.failed), delivered: Number(r.delivered), read: Number(r.read_count), clicked: Number(r.clicked) };
    if (r.handle) {
      step.outputs[r.handle] = (step.outputs[r.handle] || 0) + c.clicked;
    } else {
      // A block's elements run one after another: the block was reached as
      // often as its first (most-reached) element; all its messages count.
      if (String(r.node_id).includes("~")) step.reached = Math.max(step.reached, c.reached);
      else step.reached += c.reached;
      step.sent += c.sent; step.failed += c.failed; step.delivered += c.delivered; step.read += c.read; step.clicked += c.clicked;
    }
  }

  // Entries per day = how often the Start step ran.
  let daily = [];
  if (startNodeId) {
    const [rows2] = await pool.query(
      `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') d, SUM(reached) n
         FROM flow_step_stats WHERE flow_id = ? AND agency_id = ? AND node_id = ? AND handle = ''${dateClause}
        GROUP BY stat_date ORDER BY stat_date`,
      since ? [flowId, agencyId, startNodeId, since - 1] : [flowId, agencyId, startNodeId]
    );
    daily = rows2.map((d) => ({ date: d.d, entries: Number(d.n) }));
  }
  return { days: since || 0, steps, daily };
}
