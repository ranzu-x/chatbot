/**
 * Team Rules Matrix Configuration.
 *
 * Defines the 22 verified features and their granular actions:
 *   - Create
 *   - Update
 *   - Delete
 *   - Special
 *   (plus Advanced & Widget sub-rules for Inbox)
 */

export const TEAM_RULES_CATEGORIES = [
  {
    id: 'channels',
    name: 'Channels & Accounts',
    icon: 'Radio',
    description: 'Connect and manage WhatsApp, Facebook, Instagram, Telegram, TikTok, and Webchat accounts.',
    features: [
      {
        id: 'connect_account',
        name: 'Connect Account',
        description: 'Connect, reconnect, and configure external messaging channels and phone numbers.',
        actions: [
          { key: 'connect_account.update', type: 'update', label: 'Update / Reconnect' },
          { key: 'connect_account.delete', type: 'delete', label: 'Delete / Disconnect' },
          { key: 'connect_account.special', type: 'special', label: 'Special (Sync & Register)' },
        ],
      },
      {
        id: 'webchat_bot',
        name: 'Webchat Bot',
        description: 'Website Live Chat widget, customization, allowed domains, and embedded snippets.',
        actions: [
          { key: 'webchat_bot.create', type: 'create', label: 'Create Widget' },
          { key: 'webchat_bot.update', type: 'update', label: 'Update Widget' },
          { key: 'webchat_bot.delete', type: 'delete', label: 'Delete Widget' },
          { key: 'webchat_bot.special', type: 'special', label: 'Special (Embed Snippet)' },
        ],
      },
    ],
  },
  {
    id: 'contacts',
    name: 'Contacts & CRM',
    icon: 'Users',
    description: 'Manage subscribers, contact profiles, custom fields, tags, and bulk operations.',
    features: [
      {
        id: 'subscribers',
        name: 'Subscribers',
        description: 'Manage workspace contact records, segmentation, tags, and customer metadata.',
        actions: [
          { key: 'subscribers.create', type: 'create', label: 'Create Contact' },
          { key: 'subscribers.update', type: 'update', label: 'Update Contact' },
          { key: 'subscribers.delete', type: 'delete', label: 'Delete Contact' },
          { key: 'subscribers.special', type: 'special', label: 'Special (Import/Export & Bulk)' },
        ],
      },
    ],
  },
  {
    id: 'live_chat',
    name: 'Inbox & Messaging',
    icon: 'MessageSquare',
    description: 'Human agent inbox, real-time messaging, conversation assignment, and internal collaboration.',
    features: [
      {
        id: 'live_chat',
        name: 'Inbox',
        description: 'Inbox conversations, human agent replies, canned messages, and widget configuration.',
        actions: [
          { key: 'live_chat.create', type: 'create', label: 'Start Chat' },
          { key: 'live_chat.update', type: 'update', label: 'Reply & Send' },
          { key: 'live_chat.delete', type: 'delete', label: 'Clear History' },
          { key: 'live_chat.special', type: 'special', label: 'Special (Takeover & Assign)' },
          { key: 'live_chat.advanced', type: 'extra', label: 'Inbox - Advanced (Canned Replies)' },
          { key: 'live_chat.widget', type: 'extra', label: 'Inbox - Widget (Preview & Embed)' },
        ],
      },
    ],
  },
  {
    id: 'automations',
    name: 'Automations',
    icon: 'Zap',
    description: 'Visual Flow Bot Builder, keyword replies, triggers, and post comment automation.',
    features: [
      {
        id: 'bot_manager',
        name: 'Bot Manager',
        description: 'Interactive conversational visual flows, keyword triggers, and bot rules.',
        actions: [
          { key: 'bot_manager.create', type: 'create', label: 'Create Flow' },
          { key: 'bot_manager.update', type: 'update', label: 'Edit & Publish' },
          { key: 'bot_manager.delete', type: 'delete', label: 'Delete Flow' },
          { key: 'bot_manager.special', type: 'special', label: 'Special (Export & Clone)' },
        ],
      },
      {
        id: 'comment_automation',
        name: 'Comment Automation',
        description: 'Automatic Facebook/Instagram post comment replies and instant private DMs.',
        actions: [
          { key: 'comment_automation.create', type: 'create', label: 'Create Rule' },
          { key: 'comment_automation.update', type: 'update', label: 'Edit Rule' },
          { key: 'comment_automation.delete', type: 'delete', label: 'Delete Rule' },
          { key: 'comment_automation.special', type: 'special', label: 'Special (Private DM Reply)' },
        ],
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: 'Share2',
    description: 'Multi-channel outbound broadcasts, drip sequences, and scheduled social media posts.',
    features: [
      {
        id: 'broadcast',
        name: 'Broadcast',
        description: 'Outbound campaign broadcasting with scheduling, targeting, and A/B testing.',
        actions: [
          { key: 'broadcast.create', type: 'create', label: 'Create Campaign' },
          { key: 'broadcast.update', type: 'update', label: 'Edit Campaign' },
          { key: 'broadcast.delete', type: 'delete', label: 'Delete Campaign' },
          { key: 'broadcast.special', type: 'special', label: 'Special (A/B Test & Send)' },
        ],
      },
      {
        id: 'social_posting',
        name: 'Social Posting',
        description: 'Multi-platform social media post scheduler, publisher, and engagement tracker.',
        actions: [
          { key: 'social_posting.create', type: 'create', label: 'Create Post' },
          { key: 'social_posting.update', type: 'update', label: 'Edit Post' },
          { key: 'social_posting.delete', type: 'delete', label: 'Delete Post' },
          { key: 'social_posting.special', type: 'special', label: 'Special (Publish Now)' },
        ],
      },
    ],
  },
  {
    id: 'whatsapp_suite',
    name: 'WhatsApp Suite',
    icon: 'MessageCircle',
    description: 'Specialized WhatsApp Business Cloud API features: Calling, Flows, Templates, and Commerce.',
    features: [
      {
        id: 'wa_appointment',
        name: 'WhatsApp - Appointment System',
        description: 'Automated booking calendar, available time slots, appointment rescheduling, and reminders.',
        actions: [
          { key: 'wa_appointment.create', type: 'create', label: 'Create Slot/Service' },
          { key: 'wa_appointment.update', type: 'update', label: 'Edit Booking' },
          { key: 'wa_appointment.delete', type: 'delete', label: 'Cancel Booking' },
          { key: 'wa_appointment.special', type: 'special', label: 'Special (Slots Manager)' },
        ],
      },
      {
        id: 'wa_click_ads',
        name: 'WhatsApp - Click Ads',
        description: 'Click-to-WhatsApp (CTWA) Ads referral triggers and automated routing.',
        actions: [
          { key: 'wa_click_ads.create', type: 'create', label: 'Create Ad Trigger' },
          { key: 'wa_click_ads.update', type: 'update', label: 'Edit Trigger' },
          { key: 'wa_click_ads.delete', type: 'delete', label: 'Delete Trigger' },
          { key: 'wa_click_ads.special', type: 'special', label: 'Special (Ad Referral Routing)' },
        ],
      },
      {
        id: 'wa_calling',
        name: 'WhatsApp - Calling',
        description: 'WhatsApp Cloud Audio Calling, WebRTC call panel, call permissions, and logs.',
        actions: [
          { key: 'wa_calling.create', type: 'create', label: 'Make Call' },
          { key: 'wa_calling.update', type: 'update', label: 'Call Settings' },
          { key: 'wa_calling.delete', type: 'delete', label: 'Delete Call Log' },
          { key: 'wa_calling.special', type: 'special', label: 'Special (Call Permissions)' },
        ],
      },
      {
        id: 'wa_carousel_template',
        name: 'WhatsApp - Carousel Template',
        description: 'Interactive WhatsApp Carousel templates with multi-card carousels and dynamic buttons.',
        actions: [
          { key: 'wa_carousel_template.create', type: 'create', label: 'Create Carousel' },
          { key: 'wa_carousel_template.update', type: 'update', label: 'Edit Cards' },
          { key: 'wa_carousel_template.delete', type: 'delete', label: 'Delete Carousel' },
          { key: 'wa_carousel_template.special', type: 'special', label: 'Special (Submit to Meta)' },
        ],
      },
      {
        id: 'wa_webhook_workflow',
        name: 'WhatsApp - Webhook Workflow',
        description: 'Inbound Webhook workflows, relay URLs, and cryptographic signature verification.',
        actions: [
          { key: 'wa_webhook_workflow.create', type: 'create', label: 'Create Workflow' },
          { key: 'wa_webhook_workflow.update', type: 'update', label: 'Edit Relay URL' },
          { key: 'wa_webhook_workflow.delete', type: 'delete', label: 'Delete Workflow' },
          { key: 'wa_webhook_workflow.special', type: 'special', label: 'Special (Verify Signature)' },
        ],
      },
      {
        id: 'wa_flows',
        name: 'WhatsApp - Flows',
        description: 'Native WhatsApp interactive forms, screen encryption, and data collection.',
        actions: [
          { key: 'wa_flows.create', type: 'create', label: 'Register Flow' },
          { key: 'wa_flows.update', type: 'update', label: 'Update Screens' },
          { key: 'wa_flows.delete', type: 'delete', label: 'Delete Flow' },
          { key: 'wa_flows.special', type: 'special', label: 'Special (Sync with Meta)' },
        ],
      },
      {
        id: 'wa_catalog',
        name: 'WhatsApp - Catalog',
        description: 'Product catalog sync with Meta Commerce Manager and in-chat shopping messages.',
        actions: [
          { key: 'wa_catalog.create', type: 'create', label: 'Add Catalog Item' },
          { key: 'wa_catalog.update', type: 'update', label: 'Update Catalog' },
          { key: 'wa_catalog.delete', type: 'delete', label: 'Delete Item' },
          { key: 'wa_catalog.special', type: 'special', label: 'Special (Meta Commerce Sync)' },
        ],
      },
      {
        id: 'wa_shopify_integration',
        name: 'WhatsApp - WordPress/Shopify Integration',
        description: 'Connect Shopify store domain & API credentials to sync product catalog and orders.',
        actions: [
          { key: 'wa_shopify_integration.create', type: 'create', label: 'Connect Store' },
          { key: 'wa_shopify_integration.update', type: 'update', label: 'Edit Credentials' },
          { key: 'wa_shopify_integration.delete', type: 'delete', label: 'Disconnect Store' },
          { key: 'wa_shopify_integration.special', type: 'special', label: 'Special (Sync Products & Orders)' },
        ],
      },
    ],
  },
  {
    id: 'integrations',
    name: 'Integrations & APIs',
    icon: 'Layers',
    description: 'External data connections, Google Sheets sync, and HTTP Webhook endpoints.',
    features: [
      {
        id: 'integration_http_api',
        name: 'Integration - HTTP API',
        description: 'Execute outbound HTTP requests from bot nodes and listen for inbound webhook triggers.',
        actions: [
          { key: 'integration_http_api.create', type: 'create', label: 'Create Endpoint' },
          { key: 'integration_http_api.update', type: 'update', label: 'Edit Headers' },
          { key: 'integration_http_api.delete', type: 'delete', label: 'Delete Endpoint' },
          { key: 'integration_http_api.special', type: 'special', label: 'Special (Test Payload)' },
        ],
      },
      {
        id: 'google_sheets',
        name: 'Google - Google Sheet',
        description: 'Export User Input Flow responses and sync knowledge bases with Google Spreadsheets.',
        actions: [
          { key: 'google_sheets.create', type: 'create', label: 'Link Sheet' },
          { key: 'google_sheets.update', type: 'update', label: 'Edit Mapping' },
          { key: 'google_sheets.delete', type: 'delete', label: 'Unlink Sheet' },
          { key: 'google_sheets.special', type: 'special', label: 'Special (Sync & Auto-Export)' },
        ],
      },
      {
        id: 'google_connect_account',
        name: 'Google - Connect Account',
        description: 'Connect and authenticate Google OAuth account for Sheets and Workspace integrations.',
        actions: [
          { key: 'google_connect_account.update', type: 'update', label: 'Re-authenticate' },
          { key: 'google_connect_account.delete', type: 'delete', label: 'Disconnect' },
          { key: 'google_connect_account.special', type: 'special', label: 'Special (Grant Scopes)' },
        ],
      },
    ],
  },
  {
    id: 'ai',
    name: 'AI & Intelligence',
    icon: 'Sparkles',
    description: 'AI Agents, document knowledge bases, prompt rules, and live composer assistant.',
    features: [
      {
        id: 'ai_agent',
        name: 'AI Agent',
        description: 'Train custom AI personas with text, URLs, PDF files, and routing rules.',
        actions: [
          { key: 'ai_agent.create', type: 'create', label: 'Create Agent' },
          { key: 'ai_agent.update', type: 'update', label: 'Edit Knowledge' },
          { key: 'ai_agent.delete', type: 'delete', label: 'Delete Agent' },
          { key: 'ai_agent.special', type: 'special', label: 'Special (Train & Test Chat)' },
        ],
      },
      {
        id: 'ai_assistant',
        name: 'AI Assistant',
        description: 'Live Inbox AI composer assistant, message rewrite, tone changer, and prompt presets.',
        actions: [
          { key: 'ai_assistant.create', type: 'create', label: 'Create Preset' },
          { key: 'ai_assistant.update', type: 'update', label: 'Configure Preset' },
          { key: 'ai_assistant.delete', type: 'delete', label: 'Remove Preset' },
          { key: 'ai_assistant.special', type: 'special', label: 'Special (Live Rewrite)' },
        ],
      },
    ],
  },
  {
    id: 'control_panel',
    name: 'Control Panel',
    icon: 'Settings',
    description: 'Workspace administration, team permissions, billing transactions, and system settings.',
    features: [
      {
        id: 'control_panel_user_team',
        name: 'Control Panel - User & Team',
        description: 'Invite team members, assign workspace roles, and control per-channel access.',
        actions: [
          { key: 'control_panel_user_team.create', type: 'create', label: 'Invite Member' },
          { key: 'control_panel_user_team.update', type: 'update', label: 'Edit Member' },
          { key: 'control_panel_user_team.delete', type: 'delete', label: 'Remove Member' },
          { key: 'control_panel_user_team.special', type: 'special', label: 'Special (Channel Access)' },
        ],
      },
      {
        id: 'control_panel_settings',
        name: 'Control Panel - Settings',
        description: 'Workspace profile, custom branding, Meta App credentials, and webhook endpoints.',
        actions: [
          { key: 'control_panel_settings.create', type: 'create', label: 'Add Credentials' },
          { key: 'control_panel_settings.update', type: 'update', label: 'Edit Settings' },
          { key: 'control_panel_settings.delete', type: 'delete', label: 'Clear Settings' },
          { key: 'control_panel_settings.special', type: 'special', label: 'Special (White-label Branding)' },
        ],
      },
      {
        id: 'control_panel_transactions',
        name: 'Control Panel - Transactions',
        description: 'Subscription billing, invoices, payment gateways, and usage statements.',
        actions: [
          { key: 'control_panel_transactions.create', type: 'create', label: 'Add Payment Method' },
          { key: 'control_panel_transactions.update', type: 'update', label: 'Change Subscription' },
          { key: 'control_panel_transactions.delete', type: 'delete', label: 'Cancel Plan' },
          { key: 'control_panel_transactions.special', type: 'special', label: 'Special (Download Invoices)' },
        ],
      },
      {
        id: 'control_panel_package_role',
        name: 'Control Panel - Package & Role',
        description: 'Configure custom team roles, permissions matrix, and customer plan tiers.',
        actions: [
          { key: 'control_panel_package_role.create', type: 'create', label: 'Create Role / Plan' },
          { key: 'control_panel_package_role.update', type: 'update', label: 'Edit Permissions' },
          { key: 'control_panel_package_role.delete', type: 'delete', label: 'Delete Role' },
          { key: 'control_panel_package_role.special', type: 'special', label: 'Special (Clone Role)' },
        ],
      },
    ],
  },
];
