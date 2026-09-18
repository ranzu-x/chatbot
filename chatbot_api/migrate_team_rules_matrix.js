/**
 * Migration: Team Rules Matrix (Granular Roles & Permissions).
 *
 * Seeds granular permissions for all 22 verified features into the permissions table:
 *   - Connect Account (Update, Delete, Special)
 *   - Subscribers (Create, Update, Delete, Special)
 *   - Bot Manager (Create, Update, Delete, Special)
 *   - Live Chat (Create, Update, Delete, Special, Advanced, Widget)
 *   - Broadcast (Create, Update, Delete, Special)
 *   - Social Posting (Create, Update, Delete, Special)
 *   - Comment Automation (Create, Update, Delete, Special)
 *   - WhatsApp - Appointment System (Create, Update, Delete, Special)
 *   - WhatsApp - Click Ads (Create, Update, Delete, Special)
 *   - WhatsApp - Calling (Create, Update, Delete, Special)
 *   - WhatsApp - Carousel Template (Create, Update, Delete, Special)
 *   - WhatsApp - Webhook Workflow (Create, Update, Delete, Special)
 *   - WhatsApp - Flows (Create, Update, Delete, Special)
 *   - WhatsApp - Catalog (Create, Update, Delete, Special)
 *   - Webchat Bot (Create, Update, Delete, Special)
 *   - WhatsApp - WordPress/Shopify Integration (Create, Update, Delete, Special)
 *   - Integration - HTTP API (Create, Update, Delete, Special)
 *   - Google - Google Sheet (Create, Update, Delete, Special)
 *   - Google - Connect Account (Update, Delete, Special)
 *   - Control Panel - User & Team (Create, Update, Delete, Special)
 *   - Control Panel - Settings (Create, Update, Delete, Special)
 *   - Control Panel - Transactions (Create, Update, Delete, Special)
 *   - Control Panel - Package & Role (Create, Update, Delete, Special)
 *   - AI Agent (Create, Update, Delete, Special)
 *   - AI Assistant (Create, Update, Delete, Special)
 *
 * Safe to re-run.
 * Run: node migrate_team_rules_matrix.js
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

export const TEAM_RULES_DEFINITIONS = [
  // ── Channels & Accounts ──────────────────────────────────────────
  {
    feature: "Connect Account",
    featureKey: "connect_account",
    category: "Channels & Accounts",
    scope: "AGENCY",
    actions: [
      { key: "connect_account.update", action: "update", label: "Connect Account: Update / Reconnect" },
      { key: "connect_account.delete", action: "delete", label: "Connect Account: Delete / Disconnect" },
      { key: "connect_account.special", action: "special", label: "Connect Account: Special (Activation & Sync)" },
    ],
  },
  {
    feature: "Webchat Bot",
    featureKey: "webchat_bot",
    category: "Channels & Accounts",
    scope: "AGENCY",
    actions: [
      { key: "webchat_bot.create", action: "create", label: "Webchat Bot: Create Widget" },
      { key: "webchat_bot.update", action: "update", label: "Webchat Bot: Update & Customize" },
      { key: "webchat_bot.delete", action: "delete", label: "Webchat Bot: Delete Widget" },
      { key: "webchat_bot.special", action: "special", label: "Webchat Bot: Special (Embed & Whitelist)" },
    ],
  },

  // ── Contacts & CRM ──────────────────────────────────────────────
  {
    feature: "Subscribers",
    featureKey: "subscribers",
    category: "Contacts & CRM",
    scope: "AGENCY",
    actions: [
      { key: "subscribers.create", action: "create", label: "Subscribers: Create Contact" },
      { key: "subscribers.update", action: "update", label: "Subscribers: Update Contact" },
      { key: "subscribers.delete", action: "delete", label: "Subscribers: Delete Contact" },
      { key: "subscribers.special", action: "special", label: "Subscribers: Special (Bulk Actions & Import/Export)" },
    ],
  },

  // ── Live Chat & Messaging ───────────────────────────────────────
  {
    feature: "Live Chat",
    featureKey: "live_chat",
    category: "Live Chat & Messaging",
    scope: "AGENCY",
    actions: [
      { key: "live_chat.create", action: "create", label: "Live Chat: Start Conversation" },
      { key: "live_chat.update", action: "update", label: "Live Chat: Reply & Send Message" },
      { key: "live_chat.delete", action: "delete", label: "Live Chat: Clear & Delete History" },
      { key: "live_chat.special", action: "special", label: "Live Chat: Special (Assign, Resolve & Takeover)" },
      { key: "live_chat.advanced", action: "advanced", label: "Live Chat - Advanced: Canned Replies & Internal Notes" },
      { key: "live_chat.widget", action: "widget", label: "Live Chat - Widget: Webchat Settings & Live Preview" },
    ],
  },

  // ── Automations & Bot Manager ───────────────────────────────────
  {
    feature: "Bot Manager",
    featureKey: "bot_manager",
    category: "Automations",
    scope: "AGENCY",
    actions: [
      { key: "bot_manager.create", action: "create", label: "Bot Manager: Create Bot Flow" },
      { key: "bot_manager.update", action: "update", label: "Bot Manager: Edit & Publish Flow" },
      { key: "bot_manager.delete", action: "delete", label: "Bot Manager: Delete Flow" },
      { key: "bot_manager.special", action: "special", label: "Bot Manager: Special (Export/Import & Duplicate)" },
    ],
  },
  {
    feature: "Comment Automation",
    featureKey: "comment_automation",
    category: "Automations",
    scope: "AGENCY",
    actions: [
      { key: "comment_automation.create", action: "create", label: "Comment Automation: Create Rule" },
      { key: "comment_automation.update", action: "update", label: "Comment Automation: Edit Rule" },
      { key: "comment_automation.delete", action: "delete", label: "Comment Automation: Delete Rule" },
      { key: "comment_automation.special", action: "special", label: "Comment Automation: Special (Private DM Auto-Reply)" },
    ],
  },

  // ── Marketing & Campaigns ───────────────────────────────────────
  {
    feature: "Broadcast",
    featureKey: "broadcast",
    category: "Marketing",
    scope: "AGENCY",
    actions: [
      { key: "broadcast.create", action: "create", label: "Broadcast: Create Campaign" },
      { key: "broadcast.update", action: "update", label: "Broadcast: Edit Campaign" },
      { key: "broadcast.delete", action: "delete", label: "Broadcast: Delete Campaign" },
      { key: "broadcast.special", action: "special", label: "Broadcast: Special (A/B Testing & Instant Send)" },
    ],
  },
  {
    feature: "Social Posting",
    featureKey: "social_posting",
    category: "Marketing",
    scope: "AGENCY",
    actions: [
      { key: "social_posting.create", action: "create", label: "Social Posting: Create Post" },
      { key: "social_posting.update", action: "update", label: "Social Posting: Edit Scheduled Post" },
      { key: "social_posting.delete", action: "delete", label: "Social Posting: Delete Post" },
      { key: "social_posting.special", action: "special", label: "Social Posting: Special (Publish Immediately)" },
    ],
  },

  // ── WhatsApp Suite ──────────────────────────────────────────────
  {
    feature: "WhatsApp - Appointment System",
    featureKey: "wa_appointment",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_appointment.create", action: "create", label: "WhatsApp Appointment: Create Service/Slot" },
      { key: "wa_appointment.update", action: "update", label: "WhatsApp Appointment: Edit Service/Booking" },
      { key: "wa_appointment.delete", action: "delete", label: "WhatsApp Appointment: Delete Service/Booking" },
      { key: "wa_appointment.special", action: "special", label: "WhatsApp Appointment: Special (Reschedule & Slots)" },
    ],
  },
  {
    feature: "WhatsApp - Click Ads",
    featureKey: "wa_click_ads",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_click_ads.create", action: "create", label: "WhatsApp Click Ads: Create Ad Trigger" },
      { key: "wa_click_ads.update", action: "update", label: "WhatsApp Click Ads: Edit Ad Trigger" },
      { key: "wa_click_ads.delete", action: "delete", label: "WhatsApp Click Ads: Delete Ad Trigger" },
      { key: "wa_click_ads.special", action: "special", label: "WhatsApp Click Ads: Special (Referral Flow Routing)" },
    ],
  },
  {
    feature: "WhatsApp - Calling",
    featureKey: "wa_calling",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_calling.create", action: "create", label: "WhatsApp Calling: Initiate Outbound Call" },
      { key: "wa_calling.update", action: "update", label: "WhatsApp Calling: Configure Call Settings" },
      { key: "wa_calling.delete", action: "delete", label: "WhatsApp Calling: Delete Call History" },
      { key: "wa_calling.special", action: "special", label: "WhatsApp Calling: Special (Manage Call Permissions)" },
    ],
  },
  {
    feature: "WhatsApp - Carousel Template",
    featureKey: "wa_carousel_template",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_carousel_template.create", action: "create", label: "WhatsApp Carousel Template: Create Template" },
      { key: "wa_carousel_template.update", action: "update", label: "WhatsApp Carousel Template: Edit Cards/Buttons" },
      { key: "wa_carousel_template.delete", action: "delete", label: "WhatsApp Carousel Template: Delete Template" },
      { key: "wa_carousel_template.special", action: "special", label: "WhatsApp Carousel Template: Special (Submit to Meta)" },
    ],
  },
  {
    feature: "WhatsApp - Webhook Workflow",
    featureKey: "wa_webhook_workflow",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_webhook_workflow.create", action: "create", label: "WhatsApp Webhook Workflow: Create Workflow" },
      { key: "wa_webhook_workflow.update", action: "update", label: "WhatsApp Webhook Workflow: Edit Relay URL" },
      { key: "wa_webhook_workflow.delete", action: "delete", label: "WhatsApp Webhook Workflow: Delete Workflow" },
      { key: "wa_webhook_workflow.special", action: "special", label: "WhatsApp Webhook Workflow: Special (Verify Signature)" },
    ],
  },
  {
    feature: "WhatsApp - Flows",
    featureKey: "wa_flows",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_flows.create", action: "create", label: "WhatsApp Flows: Register Flow" },
      { key: "wa_flows.update", action: "update", label: "WhatsApp Flows: Update Flow Screens" },
      { key: "wa_flows.delete", action: "delete", label: "WhatsApp Flows: Delete Flow" },
      { key: "wa_flows.special", action: "special", label: "WhatsApp Flows: Special (Sync with Meta & Test)" },
    ],
  },
  {
    feature: "WhatsApp - Catalog",
    featureKey: "wa_catalog",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_catalog.create", action: "create", label: "WhatsApp Catalog: Add Catalog Item" },
      { key: "wa_catalog.update", action: "update", label: "WhatsApp Catalog: Update Catalog" },
      { key: "wa_catalog.delete", action: "delete", label: "WhatsApp Catalog: Delete Catalog Link" },
      { key: "wa_catalog.special", action: "special", label: "WhatsApp Catalog: Special (Meta Commerce Sync)" },
    ],
  },
  {
    feature: "WhatsApp - WordPress/Shopify Integration",
    featureKey: "wa_shopify_integration",
    category: "WhatsApp Suite",
    scope: "AGENCY",
    actions: [
      { key: "wa_shopify_integration.create", action: "create", label: "Shopify Integration: Connect Store" },
      { key: "wa_shopify_integration.update", action: "update", label: "Shopify Integration: Edit Credentials" },
      { key: "wa_shopify_integration.delete", action: "delete", label: "Shopify Integration: Disconnect Store" },
      { key: "wa_shopify_integration.special", action: "special", label: "Shopify Integration: Special (Sync Products & Orders)" },
    ],
  },

  // ── Integrations & External APIs ─────────────────────────────────
  {
    feature: "Integration - HTTP API",
    featureKey: "integration_http_api",
    category: "Integrations & APIs",
    scope: "AGENCY",
    actions: [
      { key: "integration_http_api.create", action: "create", label: "HTTP API: Create Inbound/Outbound Webhook" },
      { key: "integration_http_api.update", action: "update", label: "HTTP API: Edit Headers & Endpoints" },
      { key: "integration_http_api.delete", action: "delete", label: "HTTP API: Delete Webhook" },
      { key: "integration_http_api.special", action: "special", label: "HTTP API: Special (Test Trigger & Raw Payload)" },
    ],
  },
  {
    feature: "Google - Google Sheet",
    featureKey: "google_sheets",
    category: "Integrations & APIs",
    scope: "AGENCY",
    actions: [
      { key: "google_sheets.create", action: "create", label: "Google Sheet: Link Sheet" },
      { key: "google_sheets.update", action: "update", label: "Google Sheet: Edit Mapping" },
      { key: "google_sheets.delete", action: "delete", label: "Google Sheet: Unlink Sheet" },
      { key: "google_sheets.special", action: "special", label: "Google Sheet: Special (Sync & Auto-Export)" },
    ],
  },
  {
    feature: "Google - Connect Account",
    featureKey: "google_connect_account",
    category: "Integrations & APIs",
    scope: "AGENCY",
    actions: [
      { key: "google_connect_account.update", action: "update", label: "Google Connect Account: Re-authenticate" },
      { key: "google_connect_account.delete", action: "delete", label: "Google Connect Account: Disconnect Account" },
      { key: "google_connect_account.special", action: "special", label: "Google Connect Account: Special (Grant Scopes)" },
    ],
  },

  // ── AI & Intelligence ───────────────────────────────────────────
  {
    feature: "AI Agent",
    featureKey: "ai_agent",
    category: "AI & Intelligence",
    scope: "AGENCY",
    actions: [
      { key: "ai_agent.create", action: "create", label: "AI Agent: Create Persona" },
      { key: "ai_agent.update", action: "update", label: "AI Agent: Edit Knowledge & Settings" },
      { key: "ai_agent.delete", action: "delete", label: "AI Agent: Delete Agent" },
      { key: "ai_agent.special", action: "special", label: "AI Agent: Special (Knowledge Training & Test Chat)" },
    ],
  },
  {
    feature: "AI Assistant",
    featureKey: "ai_assistant",
    category: "AI & Intelligence",
    scope: "AGENCY",
    actions: [
      { key: "ai_assistant.create", action: "create", label: "AI Assistant: Create Rewrite Preset" },
      { key: "ai_assistant.update", action: "update", label: "AI Assistant: Configure Assistant" },
      { key: "ai_assistant.delete", action: "delete", label: "AI Assistant: Remove Preset" },
      { key: "ai_assistant.special", action: "special", label: "AI Assistant: Special (Inbox Live Rewrite)" },
    ],
  },

  // ── Control Panel ───────────────────────────────────────────────
  {
    feature: "Control Panel - User & Team",
    featureKey: "control_panel_user_team",
    category: "Control Panel",
    scope: "AGENCY",
    actions: [
      { key: "control_panel_user_team.create", action: "create", label: "User & Team: Invite Member" },
      { key: "control_panel_user_team.update", action: "update", label: "User & Team: Edit Member & Role" },
      { key: "control_panel_user_team.delete", action: "delete", label: "User & Team: Remove Member" },
      { key: "control_panel_user_team.special", action: "special", label: "User & Team: Special (Channel Access & Passwords)" },
    ],
  },
  {
    feature: "Control Panel - Settings",
    featureKey: "control_panel_settings",
    category: "Control Panel",
    scope: "AGENCY",
    actions: [
      { key: "control_panel_settings.create", action: "create", label: "Settings: Add App Credentials" },
      { key: "control_panel_settings.update", action: "update", label: "Settings: Edit Workspace Settings" },
      { key: "control_panel_settings.delete", action: "delete", label: "Settings: Clear Credentials" },
      { key: "control_panel_settings.special", action: "special", label: "Settings: Special (White-label & Webhooks)" },
    ],
  },
  {
    feature: "Control Panel - Transactions",
    featureKey: "control_panel_transactions",
    category: "Control Panel",
    scope: "AGENCY",
    actions: [
      { key: "control_panel_transactions.create", action: "create", label: "Transactions: Add Payment Method" },
      { key: "control_panel_transactions.update", action: "update", label: "Transactions: Change Plan / Billing" },
      { key: "control_panel_transactions.delete", action: "delete", label: "Transactions: Cancel Subscription" },
      { key: "control_panel_transactions.special", action: "special", label: "Transactions: Special (Download Invoices & PDF)" },
    ],
  },
  {
    feature: "Control Panel - Package & Role",
    featureKey: "control_panel_package_role",
    category: "Control Panel",
    scope: "AGENCY",
    actions: [
      { key: "control_panel_package_role.create", action: "create", label: "Package & Role: Create Role / Package" },
      { key: "control_panel_package_role.update", action: "update", label: "Package & Role: Edit Permissions" },
      { key: "control_panel_package_role.delete", action: "delete", label: "Package & Role: Delete Custom Role" },
      { key: "control_panel_package_role.special", action: "special", label: "Package & Role: Special (Clone & Default Roles)" },
    ],
  },
];

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running Team Rules Matrix migration on: ${dbName}\n`);

    // 1. Seed all granular permissions into `permissions` table
    let count = 0;
    for (const item of TEAM_RULES_DEFINITIONS) {
      for (const act of item.actions) {
        await conn.query(
          `INSERT INTO permissions (permission_key, label, category, scope_type)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE label=VALUES(label), category=VALUES(category), scope_type=VALUES(scope_type)`,
          [act.key, act.label, item.category, item.scope]
        );
        count++;
      }
    }
    console.log(`✅ Seeded ${count} granular team rules permissions into \`permissions\` table`);

    // 2. Grant all granular permissions to Owner and Super Admin roles
    const allGranularKeys = TEAM_RULES_DEFINITIONS.flatMap(item => item.actions.map(a => a.key));

    // Get system roles: owner (AGENCY), super_admin (PLATFORM), reseller_owner (RESELLER)
    const [systemRoles] = await conn.query(
      `SELECT id, slug, scope_type FROM roles WHERE slug IN ('owner', 'super_admin', 'reseller_owner', 'manager', 'agent', 'bot_builder', 'marketing', 'viewer')`
    );

    for (const role of systemRoles) {
      if (['owner', 'super_admin', 'reseller_owner'].includes(role.slug)) {
        for (const key of allGranularKeys) {
          await conn.query(
            `INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`,
            [role.id, key]
          );
        }
        console.log(`✅ Granted all ${allGranularKeys.length} rules to ${role.slug}`);
      } else if (role.slug === 'manager') {
        // Manager gets everything except deleting workspace-critical control panel settings
        const managerKeys = allGranularKeys.filter(k => !k.includes('control_panel_transactions.delete') && !k.includes('control_panel_package_role.delete'));
        for (const key of managerKeys) {
          await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`, [role.id, key]);
        }
        console.log(`✅ Granted ${managerKeys.length} rules to manager`);
      } else if (role.slug === 'agent') {
        // Live Chat agent rules
        const agentKeys = allGranularKeys.filter(k =>
          k.startsWith('live_chat.') || k.startsWith('subscribers.') || k.startsWith('ai_assistant.') || k.startsWith('wa_calling.')
        );
        for (const key of agentKeys) {
          await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`, [role.id, key]);
        }
        console.log(`✅ Granted ${agentKeys.length} rules to agent`);
      } else if (role.slug === 'bot_builder') {
        // Bot builder rules
        const botKeys = allGranularKeys.filter(k =>
          k.startsWith('bot_manager.') || k.startsWith('wa_') || k.startsWith('ai_agent.') || k.startsWith('webchat_bot.') || k.startsWith('integration_http_api.') || k.startsWith('google_sheets.')
        );
        for (const key of botKeys) {
          await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`, [role.id, key]);
        }
        console.log(`✅ Granted ${botKeys.length} rules to bot_builder`);
      } else if (role.slug === 'marketing') {
        // Marketing rules
        const marketingKeys = allGranularKeys.filter(k =>
          k.startsWith('broadcast.') || k.startsWith('social_posting.') || k.startsWith('subscribers.') || k.startsWith('comment_automation.')
        );
        for (const key of marketingKeys) {
          await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`, [role.id, key]);
        }
        console.log(`✅ Granted ${marketingKeys.length} rules to marketing`);
      }
    }

    console.log("\n🎉 Team Rules Matrix migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

// Auto-run if invoked directly
if (process.argv[1]?.endsWith("migrate_team_rules_matrix.js")) {
  run();
}
