/**
 * Read-only diagnostic: lists every webchat_widgets row with no
 * allowed_domains configured. Since routes/webchat.js now rejects any public
 * widget request for a widget with no configured website ("This Chat Widget
 * has not been configured with an authorized website yet."), every widget
 * listed here is currently non-functional on its embedding site until its
 * owner sets one — this script is how an operator finds out who to notify.
 *
 * Never writes anything. Safe to run anytime.
 * Run: node audit_unconfigured_widgets.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const dbName = process.env.DB_NAME;

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);

    const [rows] = await conn.query(
      `SELECT w.id, w.agency_id, a.name AS agency_name, w.name AS widget_name, w.widget_key, w.is_active
         FROM webchat_widgets w
         LEFT JOIN agencies a ON a.id = w.agency_id
        WHERE w.allowed_domains IS NULL OR TRIM(w.allowed_domains) = ''
        ORDER BY w.agency_id, w.id`
    );

    if (!rows.length) {
      console.log("Every widget has a website configured. Nothing to report.\n");
      return;
    }

    console.log(`\n${rows.length} widget(s) with no website configured (currently disabled on the public embed):\n`);
    console.log("widget_id\tagency_id\tagency_name\twidget_name\tactive");
    for (const r of rows) {
      console.log(`${r.id}\t${r.agency_id}\t${r.agency_name || "(unknown)"}\t${r.widget_name}\t${r.is_active ? "yes" : "no"}`);
    }
    console.log("\nEach of these needs a website URL set (Bot Manager -> Engagement -> Chat Widget) before it will work again.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
