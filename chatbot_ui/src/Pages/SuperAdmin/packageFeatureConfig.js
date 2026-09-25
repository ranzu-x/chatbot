/**
 * Rows of the Super Admin package editor's feature list, in display order.
 *
 *   module  — modules.key (package_modules row holds the on/off + limits_json)
 *   limit   — optional numeric ceiling:
 *               packageField: stored on the packages row itself (form field name)
 *               field:        stored in the module's limits_json
 *             period: shown next to the input ("Fixed" = standing total)
 *   enforced — what the API actually checks today: { toggle, limit }.
 *             Anything false is saved but has no effect yet (the feature is
 *             not built, or not wired to its route). Update when you wire one
 *             up (utils/entitlements.js requireModule / assertLimit).
 *
 * Registry modules not listed here (and not a channel or reseller module)
 * still render at the end under "Other modules", so a new module is never
 * hidden from the editor.
 */
export const PACKAGE_FEATURE_ROWS = [
  { module: 'feature_connect_account', label: 'Connect Account', limit: { packageField: 'maxBotAccounts', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_message_credits', label: 'Message Credit', limit: { packageField: 'maxMonthlyMessages', period: 'Monthly' }, enforced: { toggle: false, limit: true } },
  { module: 'feature_bot_typing', label: 'Bot Typing On Display', enforced: { toggle: false } },
  { module: 'feature_subscribers', label: 'Subscribers', limit: { packageField: 'maxSubscribers', period: 'Fixed' }, enforced: { toggle: false, limit: true } },
  { module: 'feature_bot_message_insight', label: 'Bot Message Insight', enforced: { toggle: false } },
  { module: 'feature_bot_conditional_reply', label: 'Bot Conditional Reply', enforced: { toggle: false } },
  { module: 'feature_bot_manager', label: 'Bot Manager (Flow Builder)', enforced: { toggle: true } },
  { module: 'feature_ai_tokens', label: 'AI Token', limit: { field: 'maxAiTokensPerMonth', period: 'Monthly' }, enforced: { toggle: false, limit: true } },
  { module: 'feature_user_input_flows', label: 'Input Flow Campaign', limit: { field: 'maxUserInputFlows', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_incoming_webhook', label: 'Incoming Message to Webhook URL', enforced: { toggle: false } },
  { module: 'feature_live_chat_widget', label: 'Live Chat - Widget', enforced: { toggle: false } },
  { module: 'feature_live_chat_advanced', label: 'Live Chat - Advanced', enforced: { toggle: false } },
  { module: 'feature_live_chat_restriction', label: 'Live Chat - Restriction', limit: { field: 'maxRestrictedMembers', period: 'Fixed' }, enforced: { toggle: false, limit: false } },
  { module: 'feature_live_chat_translator', label: 'Live Chat - Translator', enforced: { toggle: true } },
  { module: 'feature_live_chat', label: 'Live Chat', enforced: { toggle: true } },
  { module: 'feature_broadcasts', label: 'Broadcast', enforced: { toggle: true } },
  { module: 'feature_sequences', label: 'Sequence Campaign', limit: { field: 'maxSequences', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_social_posting', label: 'Social Posting', limit: { field: 'maxPostsPerMonth', period: 'Monthly' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_comment_automation', label: 'Comment Automation', limit: { field: 'maxCommentRules', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_whatsapp_embedded_signup', label: 'WhatsApp Embedded Signup', enforced: { toggle: true } },
  { module: 'feature_appointments', label: 'WhatsApp - Appointment System', limit: { field: 'maxAppointmentServices', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_whatsapp_carousel', label: 'WhatsApp - Carousel Template', limit: { field: 'maxCarouselTemplates', period: 'Fixed' }, enforced: { toggle: false, limit: false } },
  { module: 'feature_whatsapp_click_ads', label: 'WhatsApp - Click Ads', limit: { field: 'maxClickAds', period: 'Fixed' }, enforced: { toggle: false, limit: false } },
  { module: 'feature_whatsapp_flows', label: 'WhatsApp - Flows', limit: { field: 'maxWhatsappFlows', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_whatsapp_catalog', label: 'WhatsApp - Catalog', limit: { field: 'maxCatalogs', period: 'Fixed' }, enforced: { toggle: false, limit: false } },
  { module: 'feature_whatsapp_calling', label: 'WhatsApp - Calling', limit: { field: 'maxCallMinutesPerMonth', period: 'Minutes / month' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_whatsapp_webhook_workflow', label: 'WhatsApp - Webhook Workflow', limit: { field: 'maxWebhookWorkflows', period: 'Fixed' }, enforced: { toggle: true, limit: false } },
  { module: 'feature_whatsapp_about_brand', label: 'WhatsApp About Field Brand Name', enforced: { toggle: false } },
  { module: 'channel_webchat', label: 'Webchat Bot', limit: { field: 'max_bot_accounts', period: 'Fixed' }, enforced: { toggle: true, limit: false } },
  { module: 'feature_whatsapp_commerce', label: 'WhatsApp - WordPress/Shopify Integration', limit: { field: 'maxShopifyWooStores', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_http_api', label: 'Integration - HTTP API', limit: { field: 'maxHttpApiCampaigns', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_google_sheets', label: 'Google - Google Sheet', enforced: { toggle: true } },
  { module: 'feature_telegram_group_manager', label: 'Telegram - Group Manager', enforced: { toggle: false } },
  { module: 'feature_google_contacts', label: 'Google - Google Contacts', enforced: { toggle: false } },
  { module: 'feature_google_connect_account', label: 'Google - Connect Account', limit: { field: 'maxGoogleAccounts', period: 'Fixed' }, enforced: { toggle: false, limit: false } },
  { module: 'feature_google_calendar', label: 'Google - Google Calendar', enforced: { toggle: false } },
  { module: 'feature_api_developer', label: 'API Developer', limit: { field: 'maxApiKeys', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_team_members', label: 'Team Member', limit: { packageField: 'maxTeamMembers', period: 'Fixed' }, enforced: { toggle: true, limit: true } },
  { module: 'feature_data_retention', label: 'Data Delete Retention', enforced: { toggle: false } },
  { module: 'feature_ai_agent', label: 'AI Agent', enforced: { toggle: false } },
  { module: 'feature_ai_assistant', label: 'AI Assistant', enforced: { toggle: true } },
];

// "Disable <channel>" switches — inverted view of the channel modules.
export const PACKAGE_CHANNEL_BLOCKS = [
  { module: 'channel_whatsapp', label: 'Disable WhatsApp' },
  { module: 'channel_telegram', label: 'Disable Telegram' },
  { module: 'channel_facebook', label: 'Disable Facebook' },
  { module: 'channel_instagram', label: 'Disable Instagram' },
  { module: 'channel_tiktok', label: 'Disable TikTok' },
];

// Reseller ("Agency") block: reseller_management's limits + white-label.
export const RESELLER_MODULE = 'reseller_management';
export const WHITELABEL_MODULE = 'feature_custom_domain';
