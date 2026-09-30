/**
 * AI Credits & add-ons (utils/aiCredits/*, routes/aiCredits.js, routes/adminAiCredits.js).
 *
 *   ai_credit_wallets        one row per workspace. Two separate sources:
 *                              package_*   this period's allowance from the plan
 *                                          (packages → feature_ai_tokens
 *                                          maxAiTokensPerMonth; NULL = unlimited),
 *                                          reset with the existing monthly period
 *                              purchased_balance   add-on credits: never expire,
 *                                          never reset, survive plan changes
 *                            held_* = credits reserved by AI calls in flight.
 *   ai_platform_pool         the Super Admin's platform AI resource (single row)
 *   ai_credit_holds          one row per in-flight reservation (released by the
 *                            job if a process dies mid-call)
 *   ai_credit_transactions   the ledger — every change, with before/after
 *   ai_credit_addons         add-on catalogue (no expiry: add-ons never expire)
 *   ai_credit_purchases      add-on orders; credited once, on verified payment
 *   ai_usage                 every metered AI call (provider, model, tokens,
 *                            credits, bot, agent, feature, package/reseller)
 *   platform_settings        ai_credit_settings (rates, consumption order…)
 *   ai_platform_pool         opened with an initial balance (see OPENING_BALANCE)
 *
 * Safe to re-run.
 * Run: node migrate_ai_credits.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

// AI is blocked when the platform pool is empty (decided with the user), so the
// pool starts with a balance or AI would stop right after deploying. The Super
// Admin adjusts it in Super Admin → AI Credits.
const OPENING_BALANCE = Number(process.env.AI_PLATFORM_OPENING_CREDITS || 10_000_000);

const DEFAULT_SETTINGS = {
  // Credits per token (1 credit = 1 token by default, so the existing per-package
  // "AI Token" monthly limits keep their meaning as credit allowances).
  defaultRates: { inputPerToken: 1, outputPerToken: 1 },
  // Per provider / model overrides: [{ provider, model, inputPerToken, outputPerToken }] ("*" model = whole provider)
  modelRates: [],
  // Calls that return no token counts (estimated from their input / output).
  embeddingPerToken: 1,
  transcriptionCreditsPerCall: 300,
  minimumCreditsPerCall: 1,
  // Which balance an AI call uses first. PACKAGE_FIRST keeps purchased credits for when the plan runs out.
  consumptionOrder: ["PACKAGE", "PURCHASED"],
  lowPlatformBalanceWarning: 500_000,
};

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_credit_wallets (
        agency_id               INT NOT NULL PRIMARY KEY,
        package_period_start    DATETIME NULL,
        package_allowance       BIGINT NULL COMMENT 'NULL = unlimited for this period',
        package_used            BIGINT NOT NULL DEFAULT 0,
        held_package            BIGINT NOT NULL DEFAULT 0,
        purchased_balance       BIGINT NOT NULL DEFAULT 0,
        held_purchased          BIGINT NOT NULL DEFAULT 0,
        lifetime_used           BIGINT NOT NULL DEFAULT 0,
        lifetime_purchased      BIGINT NOT NULL DEFAULT 0,
        updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_aicw_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT chk_aicw_nonneg CHECK (package_used >= 0 AND held_package >= 0 AND purchased_balance >= 0 AND held_purchased >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_credit_wallets ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_platform_pool (
        id            TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
        balance       BIGINT NOT NULL DEFAULT 0,
        held          BIGINT NOT NULL DEFAULT 0,
        total_added   BIGINT NOT NULL DEFAULT 0,
        total_used    BIGINT NOT NULL DEFAULT 0,
        updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT chk_aipp_single CHECK (id = 1),
        CONSTRAINT chk_aipp_nonneg CHECK (balance >= 0 AND held >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_platform_pool ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_credit_holds (
        id             BIGINT AUTO_INCREMENT PRIMARY KEY,
        agency_id      INT NOT NULL,
        held_package   BIGINT NOT NULL DEFAULT 0,
        held_purchased BIGINT NOT NULL DEFAULT 0,
        held_platform  BIGINT NOT NULL DEFAULT 0,
        feature        VARCHAR(40) NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_aich_created (created_at),
        KEY idx_aich_agency (agency_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_credit_holds ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id               BIGINT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        reseller_id      INT NULL COMMENT 'parent reseller at the time (RESELLER_CUSTOMER)',
        package_id       INT NULL COMMENT 'plan at the time',
        user_id          INT NULL,
        resource         VARCHAR(20) NOT NULL DEFAULT 'PLATFORM',
        feature          VARCHAR(40) NOT NULL,
        capability       VARCHAR(40) NULL,
        provider         VARCHAR(40) NULL,
        model            VARCHAR(100) NULL,
        input_tokens     INT NULL,
        output_tokens    INT NULL,
        total_tokens     INT NULL,
        estimated        TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = the provider returned no token counts',
        credits          BIGINT NOT NULL DEFAULT 0,
        credits_package  BIGINT NOT NULL DEFAULT 0,
        credits_purchased BIGINT NOT NULL DEFAULT 0,
        uncovered        BIGINT NOT NULL DEFAULT 0 COMMENT 'cost above the reservation that could not be charged',
        integration_id   INT NULL,
        agent_id         INT NULL,
        conversation_id  INT NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_aiu_agency_created (agency_id, created_at),
        KEY idx_aiu_created (created_at),
        KEY idx_aiu_reseller_created (reseller_id, created_at),
        KEY idx_aiu_package_created (package_id, created_at),
        KEY idx_aiu_user (user_id),
        KEY idx_aiu_provider_model (provider, model),
        KEY idx_aiu_integration (integration_id),
        KEY idx_aiu_agent (agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_usage ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_credit_addons (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(120) NOT NULL,
        description  VARCHAR(500) NULL,
        credits      BIGINT NOT NULL,
        price        DECIMAL(12,2) NOT NULL,
        currency     CHAR(3) NOT NULL DEFAULT 'USD',
        is_active    TINYINT(1) NOT NULL DEFAULT 1,
        sort_order   INT NOT NULL DEFAULT 0,
        deleted_at   DATETIME NULL COMMENT 'soft delete — old purchases keep pointing at it',
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_aica_active (is_active, deleted_at, sort_order),
        CONSTRAINT chk_aica_positive CHECK (credits > 0 AND price >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_credit_addons ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_credit_purchases (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        user_id          INT NULL,
        addon_id         INT NULL,
        addon_name       VARCHAR(120) NOT NULL,
        credits          BIGINT NOT NULL,
        price            DECIMAL(12,2) NOT NULL,
        currency         CHAR(3) NOT NULL,
        charged_amount   DECIMAL(12,2) NULL COMMENT 'what the gateway was asked for (BDT gateways convert)',
        charged_currency CHAR(3) NULL,
        provider         VARCHAR(20) NOT NULL,
        status           ENUM('PENDING','PAID','FAILED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING',
        reference_token  CHAR(48) NOT NULL,
        gateway_ref      VARCHAR(191) NULL COMMENT 'Stripe session id / gateway transaction id',
        invoice_id       INT NULL,
        refunded_credits BIGINT NOT NULL DEFAULT 0,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at          DATETIME NULL,
        UNIQUE KEY uq_aicp_reference (reference_token),
        UNIQUE KEY uq_aicp_gateway_ref (provider, gateway_ref),
        KEY idx_aicp_agency (agency_id, created_at),
        KEY idx_aicp_status (status, created_at),
        CONSTRAINT fk_aicp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_credit_purchases ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ai_credit_transactions (
        id               BIGINT AUTO_INCREMENT PRIMARY KEY,
        scope            ENUM('ACCOUNT','PLATFORM') NOT NULL DEFAULT 'ACCOUNT',
        agency_id        INT NULL COMMENT 'NULL for platform-pool rows',
        user_id          INT NULL,
        type             VARCHAR(40) NOT NULL COMMENT 'PACKAGE_CREDIT_GRANTED, PACKAGE_CREDIT_RESET, ADDON_PURCHASE, AI_USAGE, ADMIN_ADJUSTMENT, REFUND, PLATFORM_CREDIT_ADDED…',
        bucket           ENUM('PACKAGE','PURCHASED','PLATFORM') NOT NULL,
        amount           BIGINT NOT NULL COMMENT 'signed: + adds, - removes',
        balance_before   BIGINT NULL,
        balance_after    BIGINT NULL,
        source           VARCHAR(60) NULL,
        purchase_id      INT NULL,
        usage_id         BIGINT NULL,
        idempotency_key  VARCHAR(120) NULL,
        metadata         JSON NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_aict_idem (idempotency_key),
        KEY idx_aict_agency_created (agency_id, created_at),
        KEY idx_aict_scope_created (scope, created_at),
        KEY idx_aict_type (type, created_at),
        KEY idx_aict_user (user_id),
        KEY idx_aict_purchase (purchase_id),
        KEY idx_aict_usage (usage_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ai_credit_transactions ready");

    // Platform pool, opened once.
    await conn.beginTransaction();
    const [ins] = await conn.query("INSERT IGNORE INTO ai_platform_pool (id, balance, total_added) VALUES (1, ?, ?)", [OPENING_BALANCE, OPENING_BALANCE]);
    if (ins.affectedRows) {
      await conn.query(
        `INSERT INTO ai_credit_transactions (scope, type, bucket, amount, balance_before, balance_after, source, idempotency_key, metadata)
         VALUES ('PLATFORM', 'PLATFORM_CREDIT_ADDED', 'PLATFORM', ?, 0, ?, 'migration', 'platform:opening', JSON_OBJECT('note', 'Opening balance'))`,
        [OPENING_BALANCE, OPENING_BALANCE]
      );
      console.log(`✅ platform pool opened with ${OPENING_BALANCE.toLocaleString()} credits`);
    }
    await conn.commit();

    await conn.query(
      "INSERT IGNORE INTO platform_settings (setting_key, value) VALUES ('ai_credit_settings', ?)",
      [JSON.stringify(DEFAULT_SETTINGS)]
    );
    console.log("✅ ai_credit_settings ready");

    await recordMigration(pool, "migrate_ai_credits.js");
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
