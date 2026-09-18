/**
 * Migration: WhatsApp Shopify/WooCommerce integration.
 *
 * commerce_connections — one row per agency+platform store connection
 * (Shopify OAuth access token, or WooCommerce static REST consumer key/
 * secret), credentials encrypted at rest via utils/cryptoVault.js, same
 * discipline as agency_payment_gateways/platform_payment_gateways.
 * commerce_products / commerce_orders — synced catalog + order data, kept
 * for product lookups a bot flow can use ("buy this" messages) and for
 * matching an inbound WhatsApp order/message back to a known contact.
 *
 * Safe to re-run.
 * Run: node migrate_commerce_integration.js
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

async function tableExists(conn, table) {
  const [[row]] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return Boolean(row);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\nRunning commerce-integration migration on database: ${dbName}\n`);

    if (await tableExists(conn, "commerce_connections")) {
      console.log("skip: commerce_connections already exists");
    } else {
      await conn.query(`
        CREATE TABLE commerce_connections (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          agency_id       INT NOT NULL,
          platform        ENUM('SHOPIFY','WOOCOMMERCE') NOT NULL,
          store_domain    VARCHAR(191) NOT NULL,
          credentials     TEXT NOT NULL,
          is_active       TINYINT(1) NOT NULL DEFAULT 1,
          last_synced_at  DATETIME NULL,
          last_sync_error TEXT NULL,
          created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_commerce_conn_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          UNIQUE KEY uq_commerce_agency_platform (agency_id, platform)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created commerce_connections");
    }

    if (await tableExists(conn, "commerce_products")) {
      console.log("skip: commerce_products already exists");
    } else {
      await conn.query(`
        CREATE TABLE commerce_products (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          connection_id       INT NOT NULL,
          external_product_id VARCHAR(100) NOT NULL,
          title               VARCHAR(255) NOT NULL,
          price               DECIMAL(10,2) NULL,
          currency            VARCHAR(10) NULL,
          image_url           TEXT NULL,
          product_url         TEXT NULL,
          raw_json            JSON NULL,
          synced_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_commerce_products_conn FOREIGN KEY (connection_id) REFERENCES commerce_connections(id) ON DELETE CASCADE,
          UNIQUE KEY uq_commerce_product (connection_id, external_product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created commerce_products");
    }

    if (await tableExists(conn, "commerce_orders")) {
      console.log("skip: commerce_orders already exists");
    } else {
      await conn.query(`
        CREATE TABLE commerce_orders (
          id                INT AUTO_INCREMENT PRIMARY KEY,
          connection_id     INT NOT NULL,
          contact_id        INT NULL,
          external_order_id VARCHAR(100) NOT NULL,
          status            VARCHAR(50) NULL,
          total             DECIMAL(10,2) NULL,
          currency          VARCHAR(10) NULL,
          raw_json          JSON NULL,
          created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_commerce_orders_conn FOREIGN KEY (connection_id) REFERENCES commerce_connections(id) ON DELETE CASCADE,
          CONSTRAINT fk_commerce_orders_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
          UNIQUE KEY uq_commerce_order (connection_id, external_order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created commerce_orders");
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
