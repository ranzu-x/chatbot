import pool from './db.js';

/**
 * Migration: Shopify / WooCommerce store automation (order notifications,
 * COD verification, abandoned-cart recovery over WhatsApp).
 *
 * commerce_connections — now many stores per workspace (profile `name`),
 *   Shopify via an Admin API access token OR client id + secret (client
 *   credentials grant, 24h token refreshed by utils/commerceService.js),
 *   WooCommerce via consumer key + secret. `orders_cursor` / `carts_cursor`
 *   are the "updated since" marks the poller (utils/commerceEvents.js) reads
 *   from; they start at connect time so existing orders are never messaged.
 * commerce_orders — one row per store order the poller has seen, with the
 *   fields campaigns need (phone, COD flag, fulfilment...) and cod_status.
 * commerce_carts — abandoned checkouts (Shopify abandonedCheckouts; WooCommerce
 *   checkout-draft / pending / failed orders).
 * commerce_campaigns — Automation → Commerce campaigns.
 * commerce_campaign_sends — one row per (campaign, event): the dedupe key,
 *   the delay queue (send_at) and the delivery log.
 *
 * Safe to re-run.
 */
async function addColumn(table, column, ddl) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`✅ Added ${table}.${column}`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log(`ℹ️ ${table}.${column} already exists`);
    else throw e;
  }
}

async function indexExists(table, name) {
  const [rows] = await pool.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [name]);
  return rows.length > 0;
}

async function run() {
  console.log('Running commerce automation migration...');

  // ── connections ──
  await addColumn('commerce_connections', 'name', 'VARCHAR(120) NULL AFTER platform');
  await addColumn('commerce_connections', 'auth_mode', "ENUM('ACCESS_TOKEN','CLIENT_CREDENTIALS','WOO_KEYS') NULL AFTER store_domain");
  await addColumn('commerce_connections', 'access_token_expires_at', 'DATETIME NULL AFTER credentials');
  await addColumn('commerce_connections', 'store_name', 'VARCHAR(191) NULL');
  await addColumn('commerce_connections', 'currency', 'VARCHAR(10) NULL');
  await addColumn('commerce_connections', 'orders_cursor', 'DATETIME NULL');
  await addColumn('commerce_connections', 'carts_cursor', 'DATETIME NULL');
  await addColumn('commerce_connections', 'last_polled_at', 'DATETIME NULL');
  await addColumn('commerce_connections', 'last_poll_error', 'TEXT NULL');
  if (!(await indexExists('commerce_connections', 'uq_commerce_store'))) {
    await pool.query('ALTER TABLE commerce_connections ADD UNIQUE KEY uq_commerce_store (agency_id, platform, store_domain)');
    console.log('✅ uq_commerce_store');
  }
  if (await indexExists('commerce_connections', 'uq_commerce_agency_platform')) {
    await pool.query('ALTER TABLE commerce_connections DROP INDEX uq_commerce_agency_platform');
    console.log('✅ dropped one-store-per-platform limit');
  }
  await pool.query("UPDATE commerce_connections SET auth_mode = IF(platform = 'SHOPIFY', 'ACCESS_TOKEN', 'WOO_KEYS') WHERE auth_mode IS NULL");
  await pool.query('UPDATE commerce_connections SET orders_cursor = NOW(), carts_cursor = NOW() WHERE orders_cursor IS NULL');

  // ── orders ──
  await addColumn('commerce_orders', 'order_number', 'VARCHAR(64) NULL AFTER external_order_id');
  await addColumn('commerce_orders', 'customer_name', 'VARCHAR(191) NULL');
  await addColumn('commerce_orders', 'customer_phone', 'VARCHAR(40) NULL');
  await addColumn('commerce_orders', 'financial_status', 'VARCHAR(40) NULL');
  await addColumn('commerce_orders', 'fulfillment_status', 'VARCHAR(40) NULL');
  await addColumn('commerce_orders', 'payment_method', 'VARCHAR(120) NULL');
  await addColumn('commerce_orders', 'is_cod', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('commerce_orders', 'cod_status', "ENUM('PENDING','CONFIRMED','CANCELLED') NULL");
  await addColumn('commerce_orders', 'cod_responded_at', 'DATETIME NULL');
  await addColumn('commerce_orders', 'order_url', 'TEXT NULL');
  await addColumn('commerce_orders', 'external_created_at', 'DATETIME NULL');
  await addColumn('commerce_orders', 'external_updated_at', 'DATETIME NULL');
  await addColumn('commerce_orders', 'updated_at', 'DATETIME NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commerce_carts (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      connection_id         INT NOT NULL,
      external_checkout_id  VARCHAR(100) NOT NULL,
      customer_name         VARCHAR(191) NULL,
      customer_phone        VARCHAR(40) NULL,
      total                 DECIMAL(12,2) NULL,
      currency              VARCHAR(10) NULL,
      items_summary         TEXT NULL,
      recovery_url          TEXT NULL,
      status                ENUM('OPEN','RECOVERED','CLOSED') NOT NULL DEFAULT 'OPEN',
      external_created_at   DATETIME NULL,
      external_updated_at   DATETIME NULL,
      raw_json              JSON NULL,
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_commerce_carts_conn FOREIGN KEY (connection_id) REFERENCES commerce_connections(id) ON DELETE CASCADE,
      UNIQUE KEY uq_commerce_cart (connection_id, external_checkout_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ commerce_carts');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commerce_campaigns (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      agency_id             INT NOT NULL,
      connection_id         INT NOT NULL,
      integration_id        INT NOT NULL,
      name                  VARCHAR(150) NOT NULL,
      trigger_event         ENUM('ORDER_CREATED','ORDER_PAID','ORDER_SHIPPED','ORDER_DELIVERED','ORDER_CANCELLED','ORDER_REFUNDED','COD_VERIFICATION','ABANDONED_CART') NOT NULL,
      template_id           INT NOT NULL,
      variable_map          JSON NULL,
      delay_minutes         INT NOT NULL DEFAULT 0,
      default_country_code  VARCHAR(6) NULL,
      label_id              INT NULL,
      sequence_id           INT NULL,
      cod_confirm_action    ENUM('NOTE','PROCESSING') NOT NULL DEFAULT 'NOTE',
      cod_cancel_action     ENUM('NOTE','CANCEL') NOT NULL DEFAULT 'CANCEL',
      cod_confirm_reply     VARCHAR(1000) NULL,
      cod_cancel_reply      VARCHAR(1000) NULL,
      is_active             TINYINT(1) NOT NULL DEFAULT 1,
      created_by            INT NULL,
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_commerce_campaign_lookup (connection_id, trigger_event, is_active),
      CONSTRAINT fk_commerce_campaign_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      CONSTRAINT fk_commerce_campaign_conn FOREIGN KEY (connection_id) REFERENCES commerce_connections(id) ON DELETE CASCADE,
      CONSTRAINT fk_commerce_campaign_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ commerce_campaigns');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commerce_campaign_sends (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      agency_id        INT NOT NULL,
      campaign_id      INT NOT NULL,
      event_key        VARCHAR(191) NOT NULL,
      order_id         INT NULL,
      cart_id          INT NULL,
      phone            VARCHAR(40) NULL,
      contact_id       INT NULL,
      conversation_id  INT NULL,
      message_id       INT NULL,
      status           ENUM('SCHEDULED','SENDING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'SCHEDULED',
      error            TEXT NULL,
      send_at          DATETIME NOT NULL,
      sent_at          DATETIME NULL,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_commerce_send (campaign_id, event_key),
      KEY idx_commerce_send_due (status, send_at),
      KEY idx_commerce_send_agency (agency_id, created_at),
      CONSTRAINT fk_commerce_send_campaign FOREIGN KEY (campaign_id) REFERENCES commerce_campaigns(id) ON DELETE CASCADE,
      CONSTRAINT fk_commerce_send_order FOREIGN KEY (order_id) REFERENCES commerce_orders(id) ON DELETE SET NULL,
      CONSTRAINT fk_commerce_send_cart FOREIGN KEY (cart_id) REFERENCES commerce_carts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ commerce_campaign_sends');

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
