/**
 * One-time rotation: replaces every existing webchat_widgets.widget_key with
 * a cryptographically random value.
 *
 * The old scheme (`wc_<agencyId>_<timestamp>`) embedded the tenant id
 * directly and only varied by millisecond — guessable/enumerable, and the
 * public widgetKey is the sole authorization handle an embed script carries
 * (see routes/webchat.js). New widgets already get a random key (see
 * routes/channels.js's POST /channels/webchat); this script closes the gap
 * for widgets created before that change.
 *
 * THIS BREAKS EVERY ALREADY-PASTED EMBED SNIPPET — a widget's `data-key`
 * attribute on the customer's own site stops resolving the moment its row's
 * key changes here, until the customer re-copies the new embed code from the
 * dashboard. That is the explicit, accepted tradeoff for closing the
 * guessable-key gap on already-issued widgets (as opposed to only hardening
 * generation going forward). Every old->new mapping is written to both the
 * console and a timestamped log file so whoever runs this has a durable
 * reference for going back to each affected customer.
 *
 * Safe to re-run (each run simply rotates again — idempotent in the sense
 * that it never errors or duplicates, though obviously every run invalidates
 * whatever keys were current before it).
 * Run: node migrate_widget_key_rotation.js
 */
import mysql from "mysql2/promise";
import crypto from "crypto";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  multipleStatements: true,
});

const dbName = process.env.DB_NAME;

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\nRunning widget-key rotation on database: ${dbName}\n`);

    const [widgets] = await conn.query(
      "SELECT id, agency_id, name, widget_key FROM webchat_widgets ORDER BY id"
    );

    if (!widgets.length) {
      console.log("No widgets found — nothing to rotate.\n");
      return;
    }

    const logLines = [
      `Widget key rotation — ${new Date().toISOString()}`,
      `${widgets.length} widget(s)\n`,
      "id\tagency_id\tname\told_key\tnew_key",
    ];

    for (const w of widgets) {
      const newKey = `wc_${crypto.randomBytes(24).toString("hex")}`;
      await conn.query("UPDATE webchat_widgets SET widget_key = ? WHERE id = ?", [newKey, w.id]);
      const line = `${w.id}\t${w.agency_id}\t${w.name}\t${w.widget_key}\t${newKey}`;
      console.log(line);
      logLines.push(line);
    }

    const logPath = `widget_key_rotation_${Date.now()}.log`;
    fs.writeFileSync(logPath, logLines.join("\n") + "\n");
    console.log(`\nRotated ${widgets.length} widget key(s). Mapping written to ${logPath}`);
    console.log("Every affected customer must re-copy their embed <script> tag from the dashboard.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
