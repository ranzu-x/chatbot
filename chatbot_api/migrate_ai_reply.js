/**
 * Migration: AI Reply system (multi-provider, multi-agent, routed)
 * Run: node migrate_ai_reply.js
 *
 * Replaces the old singleton `ai_agents` prototype (routes/ai.js,
 * services/aiService.js — a single agent per agency, plaintext API key,
 * never wired into the real inbound pipeline) with a real multi-agent
 * system: reusable, channel-independent Agents with their own prompt,
 * routing rules, knowledge base, and an explicit action allow-list, backed
 * by agency-supplied provider credentials encrypted at rest (see
 * utils/cryptoVault.js), activated per bot/integration.
 *
 * NOTE: this intentionally does NOT touch or migrate the old `ai_agents`/
 * `knowledge_sources`/`knowledge_chunks`/`ai_chat_logs` tables — those have
 * no CREATE TABLE anywhere in this repo (created out-of-band, never wired
 * to the live message pipeline), so there is nothing load-bearing to carry
 * forward. They are left as-is; routes/ai.js and the old AI Agent page are
 * retired in a later phase once this system is live.
 *
 * Safe to re-run — every statement is guarded by an existence check.
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
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].cnt > 0;
}

async function createIfMissing(conn, table, ddl) {
  if (await tableExists(conn, table)) {
    console.log(`⏭️  ${table} already exists`);
    return;
  }
  await conn.query(ddl);
  console.log(`✅ ${table} created`);
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

/**
 * A pre-existing `ai_agents` table already lives in this DB — the old
 * singleton prototype's (routes/ai.js) `UNIQUE KEY (agency_id)` shape, one
 * row per agency, columns like `api_key`/`temperature`/`provider` that this
 * new multi-agent schema doesn't use. It structurally CANNOT hold more than
 * one agent per agency, so it can't just be ALTERed in place — it's renamed
 * out of the way, a fresh multi-row `ai_agents` is created, and its one
 * existing row per agency (if any) is carried forward as that agency's
 * first "General Agent", per the confirmed "replace entirely" decision.
 * Detected by the ABSENCE of `is_default` (a column only the new shape has)
 * — idempotent: a second run sees the new shape already in place and does
 * nothing here.
 */
async function migrateLegacySingletonAiAgents(conn) {
  if (!(await tableExists(conn, "ai_agents"))) return; // nothing to migrate — fresh install path
  if (await columnExists(conn, "ai_agents", "is_default")) return; // already the new shape

  console.log("🔁 Found the old single-agent-per-agency `ai_agents` table — migrating it out of the way...");

  // Every table below was (re-)created fresh by an earlier partial run of
  // THIS migration and is empty (0 rows) — dropping and recreating them is
  // safe and is what makes their FK constraints bind to the NEW ai_agents
  // instead of the soon-to-be-renamed old one. Order matters: children
  // before whatever they reference.
  const dependentTables = [
    "ai_knowledge_chunks",
    "ai_agent_knowledge_sources",
    "ai_agent_actions",
    "ai_agent_routing_rules",
    "ai_reply_active_agents",
    "ai_reply_settings",
  ];
  for (const t of dependentTables) {
    if (await tableExists(conn, t)) {
      await conn.query(`DROP TABLE \`${t}\``);
      console.log(`   ↳ dropped empty ${t} (will be recreated against the new ai_agents below)`);
    }
  }

  if (!(await tableExists(conn, "ai_agents_legacy_singleton"))) {
    await conn.query("RENAME TABLE ai_agents TO ai_agents_legacy_singleton");
    console.log("   ↳ renamed ai_agents → ai_agents_legacy_singleton");
  }
}

/** Carries each agency's old singleton row forward as its first "General Agent". */
async function seedGeneralAgentsFromLegacy(conn) {
  if (!(await tableExists(conn, "ai_agents_legacy_singleton"))) return;
  const [legacyRows] = await conn.query("SELECT agency_id, name, system_prompt, is_active FROM ai_agents_legacy_singleton");
  for (const row of legacyRows) {
    const [[existing]] = await conn.query(
      "SELECT id FROM ai_agents WHERE agency_id = ? AND is_default = 1 LIMIT 1",
      [row.agency_id]
    );
    if (existing) continue; // already migrated (re-run safety)
    await conn.query(
      `INSERT INTO ai_agents (agency_id, name, description, system_prompt, is_active, is_default)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [row.agency_id, "General Agent", "Carried forward from the previous single-agent AI setup.", row.system_prompt, row.is_active]
    );
    console.log(`   ↳ agency ${row.agency_id}: seeded "General Agent" from its old AI Agent config`);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running AI Reply migration on database: ${dbName}\n`);

    // ──────────────────────────────────────────────────────────────────
    // 1. ai_providers — BYOK credentials, one row per agency+provider
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_providers", `
      CREATE TABLE ai_providers (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        agency_id         INT NOT NULL,
        provider          ENUM('openai','anthropic','gemini','deepseek','mimo','grok') NOT NULL,
        enabled           TINYINT(1) NOT NULL DEFAULT 0,
        credentials       TEXT NOT NULL,          -- AES-256-GCM encrypted JSON: {"apiKey": "..."}
        default_model     VARCHAR(100) NULL,
        last_verified_at  DATETIME NULL,
        last_verify_status ENUM('ok','error') NULL,
        last_verify_error VARCHAR(500) NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_aip_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_agency_provider (agency_id, provider)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 2. ai_agents — multi-row, channel-independent
    // ──────────────────────────────────────────────────────────────────
    await migrateLegacySingletonAiAgents(conn);
    await createIfMissing(conn, "ai_agents", `
      CREATE TABLE ai_agents (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        agency_id           INT NOT NULL,
        name                VARCHAR(150) NOT NULL,
        description         VARCHAR(500) NULL,
        system_prompt       TEXT NULL,
        is_active           TINYINT(1) NOT NULL DEFAULT 1,
        is_default          TINYINT(1) NOT NULL DEFAULT 0,
        preferred_provider  VARCHAR(50) NULL,     -- optional override; NULL = resolveCapability() picks
        preferred_model     VARCHAR(100) NULL,
        created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_aia_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        KEY idx_aia_agency (agency_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await seedGeneralAgentsFromLegacy(conn);

    // ──────────────────────────────────────────────────────────────────
    // 3. ai_agent_routing_rules — one row per agent (keywords + semantic
    //    example phrases + priority); example_embeddings caches each
    //    phrase's embedding at save-time so routing never re-embeds an
    //    agent's own examples on every incoming message.
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_agent_routing_rules", `
      CREATE TABLE ai_agent_routing_rules (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        agent_id            INT NOT NULL,
        keywords             JSON NULL,           -- ["price","pricing","cost", ...]
        example_phrases      JSON NULL,           -- ["what would i have to pay...", ...]
        example_embeddings   JSON NULL,           -- [[0.01,-0.02,...], ...] — same order as example_phrases
        priority             INT NOT NULL DEFAULT 0,
        created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_aarr_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_agent (agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 4. ai_agent_actions — explicit allow-list; each action_type maps 1:1
    //    to an existing action primitive (applyLabelToContact,
    //    enrollContactsInSequence, the flow-session-jump, conversation
    //    assignment) — see utils/aiActions.js (Phase 6).
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_agent_actions", `
      CREATE TABLE ai_agent_actions (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        agent_id      INT NOT NULL,
        action_type   ENUM('add_label','remove_label','start_flow','start_sequence','stop_sequence','assign_human') NOT NULL,
        config        JSON NULL,                  -- e.g. {"labelId":3} / {"flowId":12} / {"sequenceId":5}
        enabled       TINYINT(1) NOT NULL DEFAULT 1,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_aaa_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
        KEY idx_aaa_agent (agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 5. ai_agent_knowledge_sources
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_agent_knowledge_sources", `
      CREATE TABLE ai_agent_knowledge_sources (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        agent_id          INT NOT NULL,
        type              ENUM('text','file','url','google_sheet','image') NOT NULL,
        title             VARCHAR(255) NULL,
        source_ref        TEXT NULL,              -- raw text (type='text'), URL, or /uploads/... file path
        status            ENUM('pending','indexed','error') NOT NULL DEFAULT 'pending',
        error_message     VARCHAR(500) NULL,
        last_indexed_at   DATETIME NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_aaks_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
        KEY idx_aaks_agent (agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 6. ai_knowledge_chunks — agent_id denormalized onto the chunk itself
    //    so retrieval never needs to join through the source row.
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_knowledge_chunks", `
      CREATE TABLE ai_knowledge_chunks (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        source_id     INT NOT NULL,
        agent_id      INT NOT NULL,
        content       TEXT NOT NULL,
        embedding     JSON NULL,                  -- float array; NULL until indexed
        token_count   INT NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_akc_source FOREIGN KEY (source_id) REFERENCES ai_agent_knowledge_sources(id) ON DELETE CASCADE,
        CONSTRAINT fk_akc_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
        KEY idx_akc_agent (agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 7. ai_reply_settings — one row per bot/integration
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_reply_settings", `
      CREATE TABLE ai_reply_settings (
        id                     INT AUTO_INCREMENT PRIMARY KEY,
        integration_id         INT NOT NULL,
        agency_id              INT NOT NULL,
        enabled                TINYINT(1) NOT NULL DEFAULT 0,
        trigger_mode           ENUM('ALWAYS','FALLBACK') NOT NULL DEFAULT 'FALLBACK',
        default_agent_id       INT NULL,
        confidence_threshold   DECIMAL(3,2) NOT NULL DEFAULT 0.68,
        created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ars_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
        CONSTRAINT fk_ars_default_agent FOREIGN KEY (default_agent_id) REFERENCES ai_agents(id) ON DELETE SET NULL,
        UNIQUE KEY uniq_integration (integration_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 8. ai_reply_active_agents — which Agents are live on which bot
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_reply_active_agents", `
      CREATE TABLE ai_reply_active_agents (
        integration_id  INT NOT NULL,
        agent_id        INT NOT NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (integration_id, agent_id),
        CONSTRAINT fk_araa_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
        CONSTRAINT fk_araa_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ──────────────────────────────────────────────────────────────────
    // 9. ai_message_logs — replaces the old ai_chat_logs; feeds a
    //    debugging view (which provider/agent handled it, how it was
    //    routed, what it cost, what it did).
    // ──────────────────────────────────────────────────────────────────
    await createIfMissing(conn, "ai_message_logs", `
      CREATE TABLE ai_message_logs (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        agency_id         INT NOT NULL,
        conversation_id   INT NULL,
        integration_id    INT NULL,
        agent_id          INT NULL,
        provider_used     VARCHAR(50) NULL,
        model_used        VARCHAR(100) NULL,
        input_type        VARCHAR(20) NULL,
        routing_method    ENUM('keyword','embedding','default') NULL,
        actions_executed  JSON NULL,
        tokens_used       INT NULL,
        latency_ms        INT NULL,
        error             VARCHAR(500) NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_aml_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        KEY idx_aml_agency_created (agency_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("\n✅ Migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
