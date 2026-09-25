import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true,
});

// Inject stored token as Authorization header on every request + bypass ngrok interstitial on API calls
api.interceptors.request.use((config) => {
  config.headers["ngrok-skip-browser-warning"] = "true";
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized responses globally across all protected API requests
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || "";
      // Do not trigger global logout on public auth forms (so bad password messages display normally)
      const isPublicAuth = url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/tenant") || url.includes("/auth/reset-password");
      if (!isPublicAuth) {
        localStorage.removeItem("auth_token");
        window.dispatchEvent(new Event("auth:unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth & Tenant ──────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  // Email verification — public to click (the emailed link carries the token);
  // resend needs a signed-in user and is rate-limited server-side (1/minute).
  verifyEmail: (token) => api.post("/auth/verify-email", { token }),
  resendVerification: () => api.post("/auth/resend-verification"),
  // Password reset — both public (utils/passwordReset.js).
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token, password) => api.post("/auth/reset-password", { token, password }),
};

export const tenantAPI = {
  resolveTenant: (domain) => api.get(`/auth/tenant?domain=${encodeURIComponent(domain || window.location.hostname)}`),
};

// ─── Custom Domains & White-label ─────────────────────────────────
export const domainAPI = {
  getDomainConfig: () => api.get("/agency/domain"),
  updateDomainConfig: (data) => api.put("/agency/domain", data),
  verifyDomain: () => api.post("/agency/domain/verify"),
};

// ─── API Developer (agency's own API keys for the public REST surface) ────
export const apiKeyAPI = {
  getAll: () => api.get("/api-keys"),
  create: (data) => api.post("/api-keys", data),
  revoke: (id) => api.delete(`/api-keys/${id}`),
};

// ─── WhatsApp Shopify/WooCommerce integration ──────────────────────
export const commerceAPI = {
  getMeta: () => api.get("/commerce/meta"),
  getConnections: () => api.get("/commerce/connections"),
  connect: (data) => api.post("/commerce/connections", data),
  updateConnection: (id, data) => api.patch(`/commerce/connections/${id}`, data),
  pollConnection: (id) => api.post(`/commerce/connections/${id}/poll`),
  syncConnection: (id) => api.post(`/commerce/connections/${id}/sync`),
  disconnect: (id) => api.delete(`/commerce/connections/${id}`),
  getProducts: (params) => api.get("/commerce/products", { params }),
  getTemplates: (integrationId) => api.get("/commerce/templates", { params: { integrationId } }),
  getCampaigns: (params) => {
    const p = typeof params === 'object' ? params : (params ? { integrationId: params } : undefined);
    return api.get("/commerce/campaigns", { params: p });
  },
  getCampaign: (id) => api.get(`/commerce/campaigns/${id}`),
  createCampaign: (data) => api.post("/commerce/campaigns", data),
  updateCampaign: (id, data) => api.put(`/commerce/campaigns/${id}`, data),
  toggleCampaign: (id, isActive) => api.patch(`/commerce/campaigns/${id}/toggle`, { isActive }),
  deleteCampaign: (id) => api.delete(`/commerce/campaigns/${id}`),
  getActivity: (params) => api.get("/commerce/activity", { params }),
  getOrders: (params) => api.get("/commerce/orders", { params }),
  getCarts: (params) => api.get("/commerce/carts", { params }),
};

// ─── Packages & Module Entitlements ──────────────────────────────
export const packageAPI = {
  getMyEntitlements: () => api.get("/packages/my-entitlements"),
  getRegistry: () => api.get("/packages/registry"),
  getAll: () => api.get("/packages"),
  getOne: (id) => api.get(`/packages/${id}`),
  create: (data) => api.post("/packages", data),
  update: (id, data) => api.put(`/packages/${id}`, data),
  clone: (id) => api.post(`/packages/${id}/clone`),
  delete: (id) => api.delete(`/packages/${id}`),
  assign: (data) => api.post("/packages/assign", data),
};

// ─── Stripe & Billing Subscriptions ──────────────────────────────
export const billingAPI = {
  getPlans: () => api.get("/billing/plans"),
  createCheckout: (data) => api.post("/billing/create-checkout", data),
  openCustomerPortal: (data) => api.post("/billing/customer-portal", data),
  getInvoices: () => api.get("/billing/invoices"),
  // Public — no auth. Pricing page's "Buy Now" -> guest checkout.
  // `affiliateCode` (from utils/affiliateTracking.js) attributes the new
  // account to whichever Super Admin affiliate referred it, if any.
  guestCheckout: (data) => api.post("/billing/guest-checkout", data),
};

// ─── Affiliate Program (Super Admin tenant only) ───────────────────
// Tenant-side: own referral link, referrals and commission ledger.
export const affiliateAPI = {
  getMe: () => api.get("/affiliate/me"),
  getReferrals: () => api.get("/affiliate/me/referrals"),
  getCommissions: (params) => api.get("/affiliate/me/commissions", { params }),
};

// Admin-side: every affiliate platform-wide + manual payouts.
export const adminAffiliateAPI = {
  getAll: () => api.get("/admin/affiliates"),
  getOne: (id) => api.get(`/admin/affiliates/${id}`),
  suspend: (id) => api.post(`/admin/affiliates/${id}/suspend`),
  reactivate: (id) => api.post(`/admin/affiliates/${id}/reactivate`),
  updateCommissionRate: (id, commissionRate) => api.patch(`/admin/affiliates/${id}/commission-rate`, { commissionRate }),
  recordPayout: (id, data) => api.post(`/admin/affiliates/${id}/payouts`, data),
  getPayouts: (id) => api.get(`/admin/affiliates/${id}/payouts`),
  voidCommission: (affiliateId, commissionId) => api.post(`/admin/affiliates/${affiliateId}/commissions/${commissionId}/void`),
};

// ─── Platform Payment Gateways (Admin — Stripe/SSLCommerz/PortWallet/AamarPay) ──
export const platformPaymentGatewayAPI = {
  getAll: () => api.get("/admin/payment-gateways"),
  save: (provider, data) => api.put(`/admin/payment-gateways/${provider}`, data),
  toggle: (provider, isActive) => api.patch(`/admin/payment-gateways/${provider}`, { isActive }),
  remove: (provider) => api.delete(`/admin/payment-gateways/${provider}`),
};

// ─── AI Providers (Settings → AI Providers, agency-wide BYOK) ─────
export const aiProviderAPI = {
  getAll: () => api.get("/ai/providers"),
  save: (providerId, data) => api.put(`/ai/providers/${providerId}`, data),
  test: (providerId) => api.post(`/ai/providers/${providerId}/test`),
  remove: (providerId) => api.delete(`/ai/providers/${providerId}`),
};

// ─── AI Rewrite (Live Inbox composer) ──────────────────────────────
export const aiRewriteAPI = {
  rewrite: (text, style) => api.post('/ai/rewrite-message', { text, style }),
};

// ─── AI Agents (reusable, channel-independent) ────────────────────
export const aiAgentAPI = {
  getAll: () => api.get("/ai/agents"),
  getOne: (id) => api.get(`/ai/agents/${id}`),
  create: (data) => api.post("/ai/agents", data),
  update: (id, data) => api.put(`/ai/agents/${id}`, data),
  delete: (id) => api.delete(`/ai/agents/${id}`),
  testChat: (id, data) => api.post(`/ai/agents/${id}/test-chat`, data),
  getRouting: (id) => api.get(`/ai/agents/${id}/routing`),
  saveRouting: (id, data) => api.put(`/ai/agents/${id}/routing`, data),
  getKnowledge: (id) => api.get(`/ai/agents/${id}/knowledge`),
  addTextKnowledge: (id, data) => api.post(`/ai/agents/${id}/knowledge/text`, data),
  addUrlKnowledge: (id, data) => api.post(`/ai/agents/${id}/knowledge/url`, data),
  addFileKnowledge: (id, formData) => api.post(`/ai/agents/${id}/knowledge/file`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  addImageKnowledge: (id, formData) => api.post(`/ai/agents/${id}/knowledge/image`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  addGoogleSheetKnowledge: (id, data) => api.post(`/ai/agents/${id}/knowledge/google-sheet`, data),
  reindexKnowledge: (id, sourceId) => api.post(`/ai/agents/${id}/knowledge/${sourceId}/reindex`),
  deleteKnowledge: (id, sourceId) => api.delete(`/ai/agents/${id}/knowledge/${sourceId}`),
  getActions: (id) => api.get(`/ai/agents/${id}/actions`),
  saveActions: (id, data) => api.put(`/ai/agents/${id}/actions`, data),
};

// ─── AI Reply Settings + Active Agents (per-bot) ──────────────────
export const aiReplySettingsAPI = {
  getForIntegration: (integrationId) => api.get(`/ai/reply-settings/${integrationId}`),
  save: (integrationId, data) => api.put(`/ai/reply-settings/${integrationId}`, data),
  activateAgent: (integrationId, agentId) => api.post(`/ai/reply-settings/${integrationId}/active-agents/${agentId}`),
  deactivateAgent: (integrationId, agentId) => api.delete(`/ai/reply-settings/${integrationId}/active-agents/${agentId}`),
};

// ─── Business Hours (per-bot) ──────────────────────────────────────
export const businessHoursAPI = {
  getForIntegration: (integrationId) => api.get(`/business-hours/${integrationId}`),
  save: (integrationId, data) => api.put(`/business-hours/${integrationId}`, data),
};

// ─── Admin ────────────────────────────────────────────────────────
export const adminAPI = {
  getStats: () => api.get("/admin/stats"),
  getAgencies: () => api.get("/admin/agencies"),
  createAgency: (data) => api.post("/admin/agencies", data),
  updateAgency: (id, data) => api.patch(`/admin/agencies/${id}`, data),
  toggleAgency: (id) => api.patch(`/admin/agencies/${id}/toggle`),
  deleteAgency: (id) => api.delete(`/admin/agencies/${id}`),
  getAgencyCustomers: (id) => api.get(`/admin/agencies/${id}/customers`),
  getUsers: (params) => api.get("/admin/users", { params }),
  toggleUser: (id) => api.patch(`/admin/users/${id}/toggle`),
  createUser: (data) => api.post("/admin/users", data),
  getUser: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  resetUserUsage: (id) => api.post(`/admin/users/${id}/reset-usage`),
  bulkEmailUsers: (data) => api.post('/admin/users/bulk-email', data),
  bulkNotifyUsers: (data) => api.post('/admin/users/bulk-notify', data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getAnalytics: (days = 14) => api.get(`/admin/analytics?days=${days}`),
  getDashboard: (month) => api.get('/admin/dashboard', { params: { month } }),
  // Super Admin's own internal team (Support/Sales/Finance/Technical Admin)
  getTeam: () => api.get("/admin/team"),
  createTeamMember: (data) => api.post("/admin/team", data),
  removeTeamMember: (membershipId) => api.delete(`/admin/team/${membershipId}`),
};

// ─── Roles & Permissions (shared across PLATFORM / AGENCY / RESELLER scopes) ─
export const roleAPI = {
  getPermissions: () => api.get("/permissions"),
  getAll: () => api.get("/roles"),
  getOne: (id) => api.get(`/roles/${id}`),
  create: (data) => api.post("/roles", data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  delete: (id) => api.delete(`/roles/${id}`),
};

// ─── Admin & Reseller Audit Log ────────────────────────────────────
export const auditLogAPI = {
  getAll: (params) => api.get("/audit-log", { params }),
  getFacets: () => api.get("/audit-log/facets"),
};

// Super Admin's Reseller management merged into adminAPI (getAgencies now
// returns Direct Customers + Resellers together, "Reseller" is just an
// isReseller flag on an agency now — see routes/admin.js).

// ─── Reseller's own customer management (acting as a reseller) ────
export const resellerCustomerAPI = {
  getAll: () => api.get("/reseller/customers"),
  create: (data) => api.post("/reseller/customers", data),
  assignPackage: (id, agencyPackageId) => api.patch(`/reseller/customers/${id}/package`, { agencyPackageId }),
  toggle: (id) => api.patch(`/reseller/customers/${id}/toggle`),
};

// ─── Reseller's own users (User Manager, same screen as Super Admin's) ─
export const resellerUserAPI = {
  getAll: () => api.get("/reseller/users"),
  create: (data) => api.post("/reseller/users", data),
  update: (id, data) => api.put(`/reseller/users/${id}`, data),
  toggle: (id) => api.patch(`/reseller/users/${id}/toggle`),
  remove: (id) => api.delete(`/reseller/users/${id}`),
};

// ─── Reseller's own plans for its customers ────────────────────────
export const agencyPackageAPI = {
  getAll: () => api.get("/reseller/packages"),
  create: (data) => api.post("/reseller/packages", data),
  update: (id, data) => api.put(`/reseller/packages/${id}`, data),
  delete: (id) => api.delete(`/reseller/packages/${id}`),
};

// ─── Platform-wide settings (Super Admin only) ─────────────────────
export const platformSettingsAPI = {
  getAll: () => api.get("/admin/platform-settings"),
  update: (key, value) => api.put(`/admin/platform-settings/${key}`, { value }),
};

// ─── Agency ───────────────────────────────────────────────────────
export const agencyAPI = {
  getProfile: () => api.get("/agency/profile"),
  getStats: () => api.get("/agency/stats"),
  getAnalytics: (days = 14) => api.get(`/agency/analytics?days=${days}`),
  getDashboard: (month) => api.get("/agency/dashboard", { params: { month } }),
  getAgents: () => api.get("/agency/agents"),
  createAgent: (data) => api.post("/agency/agents", data),
  deleteAgent: (userId) => api.delete(`/agency/agents/${userId}`),
};

// ─── Team Members ─────────────────────────────────────────────────
export const teamAPI = {
  getAll: (params) => api.get("/team-members", { params }),
  getOne: (id) => api.get(`/team-members/${id}`),
  create: (data) => api.post("/team-members", data),
  update: (id, data) => api.put(`/team-members/${id}`, data),
  toggle: (id) => api.patch(`/team-members/${id}/toggle`),
  delete: (id) => api.delete(`/team-members/${id}`),
  // My own human-agent signature (Live Inbox "Join Chat" modal)
  getMySignature: () => api.get("/team-members/me"),
  updateMySignature: (signature) => api.put("/team-members/me", { signature }),
};


// ─── Integrations ─────────────────────────────────────────────────
export const integrationAPI = {
  getAll: () => api.get("/integrations"),
  create: (data) => api.post("/integrations", data),
  update: (id, data) => api.put(`/integrations/${id}`, data),
  delete: (id) => api.delete(`/integrations/${id}`),
};

// ─── Conversations ────────────────────────────────────────────────
export const conversationAPI = {
  getAll: (params) => api.get("/conversations", { params }),
  getOne: (id) => api.get(`/conversations/${id}`),
  getMessages: (id, params) => api.get(`/conversations/${id}/messages`, { params }),
  assign: (id, agentProfileId) => api.patch(`/conversations/${id}/assign`, { agentProfileId }),
  updateStatus: (id, status) => api.patch(`/conversations/${id}/status`, { status }),
  toggleBot: (id, reason) => api.patch(`/conversations/${id}/toggle-bot`, reason ? { reason } : undefined),
  join: (id) => api.post(`/conversations/${id}/join`),
  leave: (id) => api.post(`/conversations/${id}/leave`),
  resetFlow: (id) => api.post(`/conversations/${id}/reset-flow`),
  unsubscribe: (id) => api.post(`/conversations/${id}/unsubscribe`),
  clearHistory: (id) => api.delete(`/conversations/${id}/messages`),
  triggerFlow: (id, flowId) => api.post(`/conversations/${id}/trigger-flow`, { flowId }),
  sendMessage: (id, data) => api.post(`/conversations/${id}/messages`, data),
  bulkAssign: (conversationIds, agentProfileId) => api.patch('/conversations/bulk-assign', { conversationIds, agentProfileId }),
  bulkUpdateStatus: (conversationIds, status) => api.patch('/conversations/bulk-status', { conversationIds, status }),
  toggleTranslate: (id, enabled, targetLang) => api.patch(`/conversations/${id}/translate`, { enabled, targetLang }),
  translateMessage: (id, messageId, targetLang) => api.post(`/conversations/${id}/messages/${messageId}/translate`, targetLang ? { targetLang } : undefined),
  markRead: (id) => api.patch(`/conversations/${id}/read`),
  markUnread: (id) => api.patch(`/conversations/${id}/unread`),
  markImportant: (id, isImportant) => api.patch(`/conversations/${id}/important`, isImportant !== undefined ? { is_important: isImportant } : undefined),
  markArchived: (id, isArchived) => api.patch(`/conversations/${id}/archive`, isArchived !== undefined ? { is_archived: isArchived } : undefined),
};

// ─── Channels ─────────────────────────────────────────────────────
// ─── Channels ─────────────────────────────────────────────────────
export const channelAPI = {
  // WhatsApp
  getWhatsApp: () => api.get('/channels/whatsapp'),
  addWhatsApp: (data) => api.post('/channels/whatsapp', data),
  addWhatsAppEmbedded: (data) => api.post('/channels/whatsapp/embedded-signup', data),
  registerWhatsApp: (id, pin, accessToken) => api.post(`/channels/whatsapp/${id}/register`, { pin, accessToken }),
  discoverWhatsAppAccounts: (token) => api.post('/channels/whatsapp/discover-accounts', { userAccessToken: token }),
  syncWhatsApp: (id) => api.post(`/channels/whatsapp/${id}/sync`),
  updateWhatsAppCredentials: (id, data) => api.patch(`/channels/whatsapp/${id}/credentials`, data),
  deleteWhatsApp: (id) => api.delete(`/channels/whatsapp/${id}`),
  // Facebook
  getFacebook: () => api.get('/channels/facebook'),
  addFacebook: (data) => api.post('/channels/facebook', data),
  // Refuses a multi-account import whose NEW accounts don't fit the plan (reconnects never count).
  importCheck: (platform, accountIds) => api.post('/channels/import-check', { platform, accountIds }),
  importFBPages: (token) => api.post('/channels/facebook/import-pages', { userAccessToken: token }),
  quickConnectFacebook: (token) => api.post('/channels/facebook/quick-connect', { token }),
  syncFBSubscriptions: () => api.post('/channels/facebook/sync-subscriptions'),
  deleteFacebook: (id) => api.delete(`/channels/facebook/${id}`),
  // Facebook Utility Messaging
  getFBUtilityTemplates: (integrationId) => api.get(`/channels/facebook/${integrationId}/utility-templates`),
  sendFBUtilityMessage: (integrationId, data) => api.post(`/channels/facebook/${integrationId}/send-utility`, data),
  // Instagram
  getInstagram: () => api.get('/channels/instagram'),
  addInstagram: (data) => api.post('/channels/instagram', data),
  deleteInstagram: (id) => api.delete(`/channels/instagram/${id}`),
  importIGAccounts: (token) => api.post('/channels/instagram/import-accounts', { userAccessToken: token }),
  quickConnectInstagram: (token) => api.post('/channels/instagram/quick-connect', { userAccessToken: token }),
  syncInstagramFromFacebook: () => api.post('/channels/instagram/sync-from-facebook'),
  // Telegram
  getTelegram: () => api.get('/channels/telegram'),
  addTelegram: (token) => api.post('/channels/telegram', { botToken: token }),
  deleteTelegram: (id) => api.delete(`/channels/telegram/${id}`),
  // TikTok
  getTikTok: () => api.get('/channels/tiktok'),
  addTikTok: (data) => api.post('/channels/tiktok', data),
  deleteTikTok: (id) => api.delete(`/channels/tiktok/${id}`),
  // Webchat
  getWebchat: (params) => api.get('/channels/webchat', { params }),
  getWebchatByFlow: (flowId) => api.get(`/channels/webchat/by-flow/${flowId}`),
  addWebchat: (data) => api.post('/channels/webchat', data),
  updateWebchat: (id, data) => api.put(`/channels/webchat/${id}`, data),
  deleteWebchat: (id) => api.delete(`/channels/webchat/${id}`),
};

// ─── Comment Automation & Moderator (FB & Instagram) ───────────────
export const commentAPI = {
  getPosts: (params) => api.get('/comments/posts', { params }),
  getCampaigns: (params) => api.get('/comments/campaigns', { params }),
  createCampaign: (data) => api.post('/comments/campaigns', data),
  updateCampaign: (id, data) => api.put(`/comments/campaigns/${id}`, data),
  toggleCampaign: (id) => api.patch(`/comments/campaigns/${id}/toggle`),
  deleteCampaign: (id) => api.delete(`/comments/campaigns/${id}`),
  // "Use an existing campaign" on a post: the server copies it into a new campaign of that post.
  copyCampaignToPost: (id, data) => api.post(`/comments/campaigns/${id}/copy`, data),
  // Manual Comment Moderation & Publishing
  getPostComments: (params) => api.get('/comments/post-comments', { params }),
  postComment: (data) => api.post('/comments/post-comment', data),
  replyComment: (data) => api.post('/comments/reply-comment', data),
  likeComment: (data) => api.post('/comments/like-comment', data),
  hideComment: (data) => api.post('/comments/hide-comment', data),
  deleteComment: (commentId, params) => api.delete(`/comments/delete-comment/${commentId}`, { params }),
  linkUserToken: (data) => api.post('/comments/link-user-token', data),
};

// ─── Social Post Publishing (Facebook & Instagram) ──────────────────
export const socialPostAPI = {
  getAll: (params) => api.get('/social-posts', { params }),
  publish: (data) => api.post('/social-posts/publish', data),
  schedule: (data) => api.post('/social-posts/schedule', data),
  delete: (id) => api.delete(`/social-posts/${id}`),
};

// ─── Bots ──────────────────────────────────────────────────────────
export const botAPI = {
  getAll: () => api.get('/bots'),
  getOne: (id) => api.get(`/bots/${id}`),
  create: (data) => api.post('/bots', data),
  update: (id, data) => api.put(`/bots/${id}`, data),
  toggle: (id) => api.patch(`/bots/${id}/toggle`),
  delete: (id) => api.delete(`/bots/${id}`),
  getRules: (id) => api.get(`/bots/${id}/rules`),
  addRule: (id, data) => api.post(`/bots/${id}/rules`, data),
  deleteRule: (botId, ruleId) => api.delete(`/bots/${botId}/rules/${ruleId}`),
  // Bot Error Logs
  getErrorLogs: (params) => api.get('/bots/errors', { params }),
  deleteErrorLog: (id) => api.delete(`/bots/errors/${id}`),
  clearErrorLogs: (params) => api.delete('/bots/errors', { params }),
  createTestErrorLog: (data) => api.post('/bots/errors/test', data),
};

// ─── Meta App Settings ─────────────────────────────────────────────
// WhatsApp and Facebook/Instagram are deliberately separate Meta app slots
// (platformGroup: 'WHATSAPP' | 'MESSENGER_INSTAGRAM') — every call here
// scopes to one slot's ACTIVE row.
export const metaAppAPI = {
  get: (platformGroup) => api.get('/settings/meta-app', { params: { platformGroup } }),
  save: (data, platformGroup) => api.post('/settings/meta-app', { ...data, platformGroup }),
  test: (data, platformGroup) => api.post('/settings/meta-app/test', { ...data, platformGroup }),
  getAppId: (platformGroup) => api.get('/settings/meta-app/app-id', { params: { platformGroup } }),
  // Persists only the verify token immediately (no App ID/Secret needed).
  // Called silently whenever a token is generated or regenerated so that
  // Meta's webhook challenge passes before the full form is submitted.
  saveVerifyToken: (verifyToken, platformGroup) => api.patch('/settings/meta-app/verify-token', { verifyToken, platformGroup }),
};

// Standby app pool per platform slot — add/edit/promote/delete backup apps,
// check credential health, and (WhatsApp only) toggle the new-onboarding
// redirect used when Meta suspends Tech Provider status but existing
// numbers keep working fine.
export const metaAppPoolAPI = {
  list: (platformGroup) => api.get('/settings/meta-app-pool', { params: { platformGroup } }),
  create: (data) => api.post('/settings/meta-app-pool', data),
  update: (id, data) => api.patch(`/settings/meta-app-pool/${id}`, data),
  remove: (id) => api.delete(`/settings/meta-app-pool/${id}`),
  promote: (id) => api.post(`/settings/meta-app-pool/${id}/promote`),
  test: (id) => api.post(`/settings/meta-app-pool/${id}/test`),
  setOnboardingBlock: (id, blocked, reason) => api.patch(`/settings/meta-app-pool/${id}/onboarding-block`, { blocked, reason }),
};

// ─── Blog ──────────────────────────────────────────────────────────
export const blogAPI = {
  // Public (no auth)
  list:       (params) => api.get('/blog', { params }),
  getBySlug:  (slug)   => api.get(`/blog/${slug}`),
  categories: ()       => api.get('/blog/categories'),

  // Admin (ADMIN role)
  adminList:    (params) => api.get('/admin/blog/posts', { params }),
  adminGet:     (id)     => api.get(`/admin/blog/posts/${id}`),
  create:       (data)   => api.post('/admin/blog/posts', data),
  update:       (id, data) => api.put(`/admin/blog/posts/${id}`, data),
  remove:       (id)     => api.delete(`/admin/blog/posts/${id}`),
  togglePublish:(id)     => api.post(`/admin/blog/posts/${id}/publish`),
  uploadImage:  (formData) => api.post('/admin/blog/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ─── TikTok App Settings ───────────────────────────────────────────
export const tiktokAppAPI = {
  get: () => api.get('/settings/tiktok-app'),
  save: (data) => api.post('/settings/tiktok-app', data),
  test: () => api.post('/settings/tiktok-app/test'),
  getClientKey: () => api.get('/settings/tiktok-app/client-key'),
};

// ─── Flows ─────────────────────────────────────────────────────────
// A User Input Flow is locked to one channel — pass { platform } to getAll to
// only get the ones usable from a flow on that channel.
export const userInputFlowAPI = {
  getAll: (params) => api.get('/user-input-flows', { params }),
  getOne: (id) => api.get(`/user-input-flows/${id}`),
  create: (data) => api.post('/user-input-flows', data),
  update: (id, data) => api.put(`/user-input-flows/${id}`, data),
  delete: (id) => api.delete(`/user-input-flows/${id}`),
  getResponses: (id, params) => api.get(`/user-input-flows/${id}/responses`, { params }),
};

// ─── HTTP API Campaigns (Automation module) ────────────────────────
export const httpApiCampaignAPI = {
  getAll: () => api.get('/http-api-campaigns'),
  getOne: (id) => api.get(`/http-api-campaigns/${id}`),
  create: (data) => api.post('/http-api-campaigns', data),
  update: (id, data) => api.put(`/http-api-campaigns/${id}`, data),
  delete: (id) => api.delete(`/http-api-campaigns/${id}`),
  test: (id, contactId) => api.post(`/http-api-campaigns/${id}/test`, contactId ? { contactId } : {}),
  getLogs: (id) => api.get(`/http-api-campaigns/${id}/logs`),
};

// ─── Sequence Messages (scheduled drip messages) ──
// ─── Follow-ups (per-subscriber/conversation reminders) ───────────
export const followupAPI = {
  getAll: (params) => api.get("/follow-ups", { params }),
  create: (data) => api.post("/follow-ups", data),
  update: (id, data) => api.put(`/follow-ups/${id}`, data),
  setStatus: (id, status) => api.patch(`/follow-ups/${id}/status`, { status }),
  snooze: (id, minutes) => api.post(`/follow-ups/${id}/snooze`, { minutes }),
  delete: (id) => api.delete(`/follow-ups/${id}`),
};

export const sequenceAPI = {
  getAll: (params) => api.get('/sequences', { params }),
  getOne: (id) => api.get(`/sequences/${id}`),
  create: (data) => api.post('/sequences', data),
  update: (id, data) => api.put(`/sequences/${id}`, data),
  delete: (id) => api.delete(`/sequences/${id}`),
  subscribe: (id, data) => api.post(`/sequences/${id}/subscribe`, data),
  unsubscribe: (id, data) => api.post(`/sequences/${id}/unsubscribe`, data),
  getLog: (id) => api.get(`/sequences/${id}/log`),
};

// ─── Google Sheets connection (User Input Flow export destination) ──
export const googleSheetsAPI = {
  getAuthUrl: () => api.get('/integrations/google-sheets/auth-url'),
  getStatus: () => api.get('/integrations/google-sheets/status'),
  disconnect: () => api.delete('/integrations/google-sheets'),
  listSpreadsheets: () => api.get('/integrations/google-sheets/spreadsheets'),
  listTabs: (spreadsheetId) => api.get(`/integrations/google-sheets/spreadsheets/${spreadsheetId}/tabs`),
  getValues: (spreadsheetId, tab) => api.get(`/integrations/google-sheets/spreadsheets/${spreadsheetId}/values`, { params: { tab } }),
};

export const flowAPI = {
  getAll: (params) => api.get('/flows', { params }),
  getOne: (id) => api.get(`/flows/${id}`),
  create: (data) => api.post('/flows', data),
  update: (id, data) => api.put(`/flows/${id}`, data),
  toggle: (id) => api.patch(`/flows/${id}/toggle`),
  delete: (id) => api.delete(`/flows/${id}`),
  clone: (id, data) => api.post(`/flows/${id}/clone`, data),
};

// ─── Contacts ───────────────────────────────────────────────────────
export const contactAPI = {
  getAll: (params) => api.get('/contacts', { params }),
  search: (q, limit) => api.get('/contacts/search', { params: { q, limit } }),
  getOne: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  addTag: (id, tag) => api.post(`/contacts/${id}/tags`, { tag }),
  removeTag: (id, tag) => api.delete(`/contacts/${id}/tags/${encodeURIComponent(tag)}`),
  getNotes: (id) => api.get(`/contacts/${id}/notes`),
  getSequences: (id) => api.get(`/contacts/${id}/sequences`),
  addNote: (id, note) => api.post(`/contacts/${id}/notes`, { note }),
  deleteNote: (contactId, noteId) => api.delete(`/contacts/${contactId}/notes/${noteId}`),
  toggleBot: (id) => api.patch(`/contacts/${id}/toggle-bot`),
  // Completed User Input Flow submissions for this subscriber (Inbox side panel)
  getFormResponses: (id) => api.get(`/contacts/${id}/form-responses`),
  syncAvatars: () => api.post('/contacts/sync-avatars'),
  exportCSV: (params) => api.get('/contacts/export/csv', { params, responseType: 'blob' }),
  getStats: (params) => api.get('/contacts/stats', { params }),
  bulkDelete: (contactIds) => api.post('/contacts/bulk-delete', { contactIds }),
  updateSubscription: (id, status) => api.patch(`/contacts/${id}/subscription`, { status }),
  block: (id, reason) => api.patch(`/contacts/${id}/block`, { reason }),
  unblock: (id) => api.patch(`/contacts/${id}/unblock`),
  bulkSequence: (contactIds, sequenceId) => api.post('/contacts/bulk-sequence', { contactIds, sequenceId }),
  // payload: { integrationId, rows, customFields, labelId | labelName } — see POST /contacts/import
  import: (payload) => api.post('/contacts/import', payload),
};

// ─── Unified Labels ───────────────────────────────────────────────────
export const labelAPI = {
  getAll: () => api.get('/labels'),
  create: (data) => api.post('/labels', data),
  update: (id, data) => api.put(`/labels/${id}`, data),
  delete: (id) => api.delete(`/labels/${id}`),
  attachToContact: (contactId, data) => api.post(`/contacts/${contactId}/labels`, data),
  detachFromContact: (contactId, labelId) => api.delete(`/contacts/${contactId}/labels/${labelId}`),
  bulkAttach: (data) => api.post('/contacts/bulk-labels', data),
};

// ─── Contact Lists ──────────────────────────────────────────────────────
export const contactListAPI = {
  getAll: () => api.get('/contact-lists'),
  create: (data) => api.post('/contact-lists', data),
  update: (id, data) => api.put(`/contact-lists/${id}`, data),
  delete: (id) => api.delete(`/contact-lists/${id}`),
  bulkAdd: (contactIds, listId) => api.post('/contacts/bulk-list-add', { contactIds, listId }),
  bulkRemove: (contactIds, listId) => api.post('/contacts/bulk-list-remove', { contactIds, listId }),
};

// ─── Custom Fields ────────────────────────────────────────────────────
export const customFieldAPI = {
  getAll: () => api.get('/custom-fields'),
  create: (data) => api.post('/custom-fields', data),
  update: (id, data) => api.put(`/custom-fields/${id}`, data),
  delete: (id) => api.delete(`/custom-fields/${id}`),
  getForContact: (contactId) => api.get(`/contacts/${contactId}/custom-fields`),
  setValue: (contactId, fieldId, value) => api.put(`/contacts/${contactId}/custom-fields/${fieldId}`, { value }),
};

// ─── My in-app notifications (top-bar bell) ─────────────────────────
export const myNotificationsAPI = {
  getAll: () => api.get('/me/notifications'),
  markRead: (id) => api.post(`/me/notifications/${id}/read`),
  markAllRead: () => api.post('/me/notifications/read-all'),
};

// ─── Upload ─────────────────────────────────────────────────────────
export const uploadAPI = {
  uploadFile: (formData) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ─── WhatsApp Templates ───────────────────────────────────────────────
export const templateAPI = {
  getWATemplates: (params) => api.get('/templates/whatsapp', { params }),
  createWATemplate: (data) => api.post('/templates/whatsapp', data),
  syncWATemplates: (data) => api.post('/templates/whatsapp/sync', data),
  deleteWATemplate: (id) => api.delete(`/templates/whatsapp/${id}`),
};

// ─── WhatsApp Flow references (Send Menu) ──────────────────────────
export const whatsappFlowRefAPI = {
  getAll: (params) => api.get('/whatsapp-flow-refs', { params }),
  create: (data) => api.post('/whatsapp-flow-refs', data),
  update: (id, data) => api.patch(`/whatsapp-flow-refs/${id}`, data),
  delete: (id) => api.delete(`/whatsapp-flow-refs/${id}`),
};

// ─── WhatsApp Flows — encrypted data-exchange keys ─────────────────
export const whatsappFlowKeyAPI = {
  get: (integrationId) => api.get(`/whatsapp-flow-keys/${integrationId}`),
  generate: (integrationId) => api.post(`/whatsapp-flow-keys/${integrationId}`),
  remove: (integrationId) => api.delete(`/whatsapp-flow-keys/${integrationId}`),
  sessions: () => api.get('/whatsapp-flow-sessions'),
};

// ─── Canned Responses ──────────────────────────────────────────────────
export const cannedResponseAPI = {
  getAll: () => api.get('/canned-responses'),
  create: (data) => api.post('/canned-responses', data),
  update: (id, data) => api.put(`/canned-responses/${id}`, data),
  delete: (id) => api.delete(`/canned-responses/${id}`),
};

// The Broadcasting module — WhatsApp/Messenger/Telegram/TikTok, tabbed on
// one page. A WINDOW-mode campaign's message content is a Flow (start it,
// then navigate to the Flow Builder); a TEMPLATE-mode one (WhatsApp Anytime)
// is created directly against an approved template, no flow involved.
export const broadcastAPI = {
  getAll: (platform) => api.get('/broadcasts', { params: platform ? { platform } : {} }),
  getOne: (id) => api.get(`/broadcasts/${id}`),
  getByFlow: (flowId) => api.get(`/broadcasts/by-flow/${flowId}`),
  getFormData: (platform, integrationId) => api.get('/broadcasts/form-data', { params: { ...(platform ? { platform } : {}), ...(integrationId ? { integrationId } : {}) } }),
  audiencePreview: (data) => api.post('/broadcasts/audience-preview', data),
  startWithFlow: (data) => api.post('/broadcasts/start-with-flow', data),
  createTemplateCampaign: (data) => api.post('/broadcasts', data),
  update: (id, data) => api.put(`/broadcasts/${id}`, data),
  // confirmAudience: the user explicitly confirmed a "no filter" / large audience (server re-checks and asks with 409 otherwise).
  sendNow: (id, { confirmAudience = false } = {}) => api.post(`/broadcasts/${id}/send`, { confirmAudience }),
  schedule: (id, scheduledAt, { confirmAudience = false } = {}) => api.post(`/broadcasts/${id}/schedule`, { scheduledAt, confirmAudience }),
  cancelSchedule: (id) => api.post(`/broadcasts/${id}/cancel`),
  delete: (id) => api.delete(`/broadcasts/${id}`),
};

// WhatsApp Business Calling — business-initiated calls from the Live Inbox.
// See routes/whatsappCalls.js and src/hooks/useWhatsAppCall.js.
export const whatsappCallAPI = {
  // integrationId is always the open conversation's own WhatsApp account —
  // never left to the backend to guess, since an agency can have more than
  // one WhatsApp number connected.
  getPermission: (contactId, integrationId, refresh) =>
    api.get(`/calls/permission/${contactId}`, { params: { integrationId, ...(refresh ? { refresh: '1' } : {}) } }),
  requestPermission: (contactId, integrationId, message) =>
    api.post(`/calls/permission/${contactId}/request`, { integrationId, ...(message ? { message } : {}) }),
  initiate: (data) => api.post('/calls/initiate', data),
  terminate: (callDbId) => api.post(`/calls/${callDbId}/terminate`),
  getCall: (callDbId) => api.get(`/calls/${callDbId}`),
};

// (sequenceAPI now defined once, above, alongside the other Sequence Messages exports)

// ─── Appointment Campaigns ─────────────────────────────────────────────────
export const appointmentCampaignAPI = {
  getAll: () => api.get('/appointment-campaigns'),
  create: (data) => api.post('/appointment-campaigns', data),
  update: (id, data) => api.put(`/appointment-campaigns/${id}`, data),
  delete: (id) => api.delete(`/appointment-campaigns/${id}`),
};

export default api;