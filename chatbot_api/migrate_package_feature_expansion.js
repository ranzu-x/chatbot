/**
 * Migration: Package Manager feature expansion.
 *
 * Widens packages.billing_cycle to add 'quarterly', adds a provider column
 * (+ a provider-scoped unique key) to invoices so non-Stripe gateways can
 * record payments without colliding with stripe_invoice_id, and registers
 * the new `modules` rows needed to let a package toggle/limit every
 * previously-ungated feature (message credits, AI tokens, user input flows,
 * live chat translator, social posting, WhatsApp flows/calling/webhook-
 * workflow/commerce, Google Sheets, API developer). Enforcement of these
 * modules is wired up separately in the route files — this migration only
 * creates the registry rows and schema room for it.
 *
 * Safe to re-run.
 * Run: node migrate_package_feature_expansion.js
 */
import mysql from "mysql2/promise";
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

async function columnExists(conn, table, column) {
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return Boolean(row);
}

async function indexExists(conn, table, indexName) {
  const [[row]] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, indexName]
  );
  return Boolean(row);
}

const NEW_MODULES = [
  { key: "feature_message_credits", display_name: "Message Credit Limit", module_type: "feature", category: "messaging", sort_order: 20 },
  { key: "feature_ai_tokens", display_name: "AI Token Limit", module_type: "feature", category: "ai", sort_order: 21 },
  { key: "feature_user_input_flows", display_name: "User Input Flow Limit", module_type: "feature", category: "automation", sort_order: 22 },
  { key: "feature_live_chat_translator", display_name: "Live Chat Translator", module_type: "feature", category: "live_chat", sort_order: 23 },
  { key: "feature_social_posting", display_name: "Social Posting", module_type: "feature", category: "social", sort_order: 24 },
  { key: "feature_whatsapp_flows", display_name: "WhatsApp Flows", module_type: "feature", category: "whatsapp", sort_order: 25 },
  { key: "feature_whatsapp_calling", display_name: "WhatsApp Calling", module_type: "feature", category: "whatsapp", sort_order: 26 },
  { key: "feature_whatsapp_webhook_workflow", display_name: "WhatsApp Webhook Workflow", module_type: "feature", category: "whatsapp", sort_order: 27 },
  { key: "feature_whatsapp_commerce", display_name: "WhatsApp Shopify/WooCommerce Integration", module_type: "feature", category: "whatsapp", sort_order: 28 },
  { key: "feature_google_sheets", display_name: "Google Sheet", module_type: "feature", category: "integrations", sort_order: 29 },
  { key: "feature_api_developer", display_name: "API Developer", module_type: "feature", category: "developer", sort_order: 30 },
];

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\nRunning package-feature-expansion migration on database: ${dbName}\n`);

    // 1. packages.billing_cycle -> add 'quarterly'
    const [[cycleCol]] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'packages' AND COLUMN_NAME = 'billing_cycle'`,
      [dbName]
    );
    if (cycleCol && cycleCol.COLUMN_TYPE.includes("quarterly")) {
      console.log("skip: packages.billing_cycle already includes quarterly");
    } else {
      await conn.query(
        `ALTER TABLE packages MODIFY COLUMN billing_cycle ENUM('monthly','quarterly','yearly','lifetime','free') NOT NULL DEFAULT 'monthly'`
      );
      console.log("done: packages.billing_cycle now includes quarterly");
    }

    // 2. invoices.provider + gateway_txn_id + unique key
    if (await columnExists(conn, "invoices", "provider")) {
      console.log("skip: invoices.provider already exists");
    } else {
      await conn.query(
        `ALTER TABLE invoices ADD COLUMN provider ENUM('STRIPE','SSLCOMMERZ','PORTWALLET','AAMARPAY') NOT NULL DEFAULT 'STRIPE' AFTER package_id`
      );
      console.log("done: invoices.provider added");
    }
    if (await columnExists(conn, "invoices", "gateway_txn_id")) {
      console.log("skip: invoices.gateway_txn_id already exists");
    } else {
      await conn.query(`ALTER TABLE invoices ADD COLUMN gateway_txn_id VARCHAR(191) NULL AFTER provider`);
      console.log("done: invoices.gateway_txn_id added");
    }
    if (await indexExists(conn, "invoices", "uq_invoices_provider_txn")) {
      console.log("skip: uq_invoices_provider_txn already exists");
    } else {
      await conn.query(
        `ALTER TABLE invoices ADD UNIQUE KEY uq_invoices_provider_txn (provider, gateway_txn_id)`
      );
      console.log("done: uq_invoices_provider_txn added");
    }

    // 3. New modules rows
    for (const m of NEW_MODULES) {
      const [[existing]] = await conn.query(`SELECT id FROM modules WHERE \`key\` = ?`, [m.key]);
      if (existing) {
        console.log(`skip: module ${m.key} already exists`);
        continue;
      }
      await conn.query(
        `INSERT INTO modules (\`key\`, display_name, module_type, category, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)`,
        [m.key, m.display_name, m.module_type, m.category, m.sort_order]
      );
      console.log(`done: module ${m.key} created`);
    }

    console.log("\nMigration complete.\n");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
