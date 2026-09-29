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
    // Expired plan → the workspace is read-only (chatbot_api/middleware/subscriptionGuard.js).
    // Components/Billing/SubscriptionBanner.jsx listens and shows the renew banner.
    if (error.response?.status === 402 && error.response.data?.code === "SUBSCRIPTION_EXPIRED") {
      window.dispatchEvent(new CustomEvent("subscription:expired", { detail: error.response.data }));
    }
    return Promise.reject(error);
  }
);

// ─── Auth & Tenant ──────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  // Two-factor login (chatbot_api/utils/totp.js) — second step + My Account → Security.
  loginTwoFactor: (data) => api.post("/auth/login/2fa", data),
  getTwoFactor: () => api.get("/auth/2fa"),
  setupTwoFactor: () => api.post("/auth/2fa/setup"),
  enableTwoFactor: (code) => api.post("/auth/2fa/enable", { code }),
  disableTwoFactor: (data) => api.post("/auth/2fa/disable", data),
  newBackupCodes: (data) => api.post("/auth/2fa/backup-codes", data),
  revokeAllSessions: () => api.post("/auth/sessions/revoke-all"),
  // My Account → Profile: the signed-in person's own login.
  getProfile: () => api.get("/auth/profile"),
  updateProfile: (data) => api.put("/auth/profile", data),
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/auth/profile/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  removeAvatar: () => api.delete("/auth/profile/avatar"),
  changeEmail: (data) => api.put("/auth/profile/email", data),
  changePassword: (data) => api.post("/auth/profile/password", data),
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
  removeCustomDomain: () => api.delete("/agency/domain/custom"),
  // What to set up at the DNS for a domain being typed (nothing saved)
  previewDns: (domain) => api.get("/agency/domain/dns-preview", { params: { domain } }),
  // kind: 'logo' | 'logoIcon' | 'favicon'
  uploadBrandingAsset: (kind, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/agency/domain/branding/${kind}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  removeBrandingAsset: (kind) => api.delete(`/agency/domain/branding/${kind}`),
  // Super Admin: Cloudflare for SaaS setup check
  getCustomDomainSetup: () => api.get("/admin/custom-domains/setup"),
};

/** An uploaded file's path (/uploads/…) as a URL the browser can load; absolute URLs pass through. */
export function assetUrl(url) {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) return url || '';
  // Older blog covers were saved as <VITE_API_URL>/uploads/… (= /api/v1/uploads/…), which never existed.
  url = url.replace(/^\/api\/v1(?=\/uploads\/)/, '');
  const base = (import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1\/?$/, "");
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

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
  enableInstantUpdates: (id) => api.post(`/commerce/connections/${id}/webhooks`),
  downloadWooPlugin: (id) => api.get(`/commerce/connections/${id}/woo-plugin`, { responseType: "blob" }),
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
  // No "assign": a package is assigned from the Super Admin user editor.
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
  // Payment methods switched on, and the price after package / personal
  // discount + coupon (chatbot_api/utils/checkoutPricing.js). Both public.
  getGateways: () => api.get("/billing/gateways"),
  quote: (data) => api.post("/billing/quote", data),
};

// Facebook / Instagram Get Started, greeting, ice breakers, persistent menu (chatbot_api/utils/messengerProfile.js)
export const botProfileAPI = {
  get: (integrationId) => api.get(`/bot-profile/${integrationId}`),
  save: (integrationId, data) => api.put(`/bot-profile/${integrationId}`, data),
  getStories: (integrationId) => api.get(`/bot-profile/${integrationId}/stories`),
  saveStories: (integrationId, data) => api.put(`/bot-profile/${integrationId}/stories`, data),
  getAds: (integrationId, days) => api.get(`/bot-profile/${integrationId}/ads`, { params: { days } }),
  setAdFlow: (integrationId, sourceId, data) => api.put(`/bot-profile/${integrationId}/ads/${encodeURIComponent(sourceId)}`, data),
  getTikTok: (integrationId) => api.get(`/bot-profile/${integrationId}/tiktok`),
  saveTikTokAutoMessage: (integrationId, data) => api.post(`/bot-profile/${integrationId}/tiktok/auto-messages`, data),
  deleteTikTokAutoMessage: (integrationId, type, id) => api.delete(`/bot-profile/${integrationId}/tiktok/auto-messages/${type}/${encodeURIComponent(id)}`),
  setTikTokStatus: (integrationId, data) => api.put(`/bot-profile/${integrationId}/tiktok/status`, data),
  getTelegramBusiness: (integrationId) => api.get(`/bot-profile/${integrationId}/telegram-business`),
};

// Opt-out / opt-in keywords per bot account (chatbot_api/utils/optOut.js)
export const optOutAPI = {
  get: (integrationId) => api.get("/opt-out/" + integrationId),
  save: (integrationId, data) => api.put("/opt-out/" + integrationId, data),
};

// Default WhatsApp templates for store automation (chatbot_api/utils/storeTemplatePresets.js)
export const storeTemplateAPI = {
  list: (integrationId) => api.get("/store-templates", { params: { integrationId } }),
  create: (integrationId, keys) => api.post("/store-templates", { integrationId, keys }),
  refresh: (integrationId) => api.post("/store-templates/refresh", { integrationId }),
};

// Quick Actions per bot account: No match / Chat with human / robot / (un)subscribe (chatbot_api/utils/quickActions.js)
export const quickActionAPI = {
  list: (integrationId) => api.get("/quick-actions/" + integrationId),
  update: (integrationId, action, data) => api.put(`/quick-actions/${integrationId}/${action}`, data),
  reset: (integrationId, action) => api.post(`/quick-actions/${integrationId}/${action}/reset`),
};

// Telegram group management (chatbot_api/utils/telegramGroups.js)
export const tgGroupsAPI = {
  list: (integrationId) => api.get("/tg-groups", { params: { integrationId } }),
  setup: (integrationId) => api.post("/tg-groups/setup/" + integrationId),
  get: (id) => api.get("/tg-groups/" + id),
  refresh: (id) => api.post(`/tg-groups/${id}/refresh`),
  saveSettings: (id, settings) => api.put(`/tg-groups/${id}/settings`, { settings }),
  saveInfo: (id, data) => api.put(`/tg-groups/${id}/info`, data),
  savePermissions: (id, permissions) => api.put(`/tg-groups/${id}/permissions`, { permissions }),
  members: (id, params) => api.get(`/tg-groups/${id}/members`, { params }),
  memberAction: (id, memberId, data) => api.post(`/tg-groups/${id}/members/${memberId}/action`, data),
  joinRequests: (id, status) => api.get(`/tg-groups/${id}/join-requests`, { params: { status } }),
  decideJoinRequests: (id, ids, approve) => api.post(`/tg-groups/${id}/join-requests`, { ids, approve }),
  inviteLinks: (id) => api.get(`/tg-groups/${id}/invite-links`),
  createInviteLink: (id, data) => api.post(`/tg-groups/${id}/invite-links`, data),
  newPrimaryLink: (id) => api.post(`/tg-groups/${id}/invite-links/primary`),
  revokeInviteLink: (id, linkId) => api.delete(`/tg-groups/${id}/invite-links/${linkId}`),
  posts: (id) => api.get(`/tg-groups/${id}/posts`),
  createPost: (id, data) => api.post(`/tg-groups/${id}/posts`, data),
  cancelPost: (id, postId) => api.delete(`/tg-groups/${id}/posts/${postId}`),
  unpinAll: (id) => api.post(`/tg-groups/${id}/unpin-all`),
  logs: (id, params) => api.get(`/tg-groups/${id}/logs`, { params }),
  leave: (id) => api.post(`/tg-groups/${id}/leave`),
  forget: (id) => api.delete(`/tg-groups/${id}`),
};

// Inbox Insights: SLA target, CSAT, automatic assignment + reports (chatbot_api/utils/inboxQuality.js)
export const inboxQualityAPI = {
  getSettings: () => api.get("/inbox-quality/settings"),
  saveSettings: (data) => api.put("/inbox-quality/settings", data),
  getMetrics: (days) => api.get("/inbox-quality/metrics", { params: { days } }),
};

// WhatsApp number health + business username (chatbot_api/utils/whatsappNumber.js)
export const waNumberAPI = {
  get: (integrationId) => api.get("/wa-number/" + integrationId),
  setUsername: (integrationId, username, forceTransfer) => api.put("/wa-number/" + integrationId + "/username", { username, forceTransfer }),
  deleteUsername: (integrationId) => api.delete("/wa-number/" + integrationId + "/username"),
};

// WhatsApp Groups (chatbot_api/utils/whatsappGroups.js)
export const waGroupsAPI = {
  list: (integrationId, sync) => api.get("/wa-groups", { params: { integrationId, ...(sync ? { sync: 1 } : {}) } }),
  create: (data) => api.post("/wa-groups", data),
  get: (id) => api.get("/wa-groups/" + id),
  resetLink: (id) => api.post("/wa-groups/" + id + "/invite-link"),
  send: (id, text) => api.post("/wa-groups/" + id + "/messages", { text }),
  removeMembers: (id, users) => api.post("/wa-groups/" + id + "/participants/remove", { users }),
  joinRequests: (id, ids, approve) => api.post("/wa-groups/" + id + "/join-requests", { ids, approve }),
  remove: (id) => api.delete("/wa-groups/" + id),
};

// WhatsApp catalog + product messages (chatbot_api/utils/whatsappCatalog.js)
export const waCatalogAPI = {
  get: (integrationId) => api.get("/wa-catalog/" + integrationId),
  save: (integrationId, data) => api.put("/wa-catalog/" + integrationId, data),
  sync: (integrationId, data) => api.post("/wa-catalog/" + integrationId + "/sync", data),
  products: (integrationId, params) => api.get("/wa-catalog/" + integrationId + "/products", { params }),
  send: (data) => api.post("/wa-catalog/send", data),
};

// Super Admin → Coupons (codes customers type at checkout)
export const couponAPI = {
  getAll: () => api.get("/admin/coupons"),
  create: (data) => api.post("/admin/coupons", data),
  update: (id, data) => api.put(`/admin/coupons/${id}`, data),
  remove: (id) => api.delete(`/admin/coupons/${id}`),
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
  addWebsiteKnowledge: (id, data) => api.post(`/ai/agents/${id}/knowledge/website`, data),
  getAnswers: (id, params) => api.get(`/ai/agents/${id}/answers`, { params }),
  reviewAnswer: (id, logId, data) => api.put(`/ai/agents/${id}/answers/${logId}`, data),
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

// ─── Bot Settings (General / Inbox tabs) + Auto Responders ─────────
export const botSettingsAPI = {
  get: (integrationId) => api.get(`/bot-settings/${integrationId}`),
  save: (integrationId, data) => api.put(`/bot-settings/${integrationId}`, data),
};

export const autoResponderAPI = {
  getAll: () => api.get('/auto-responders'),
  create: (data) => api.post('/auto-responders', data),
  update: (id, data) => api.put(`/auto-responders/${id}`, data),
  delete: (id) => api.delete(`/auto-responders/${id}`),
  lists: (id) => api.get(`/auto-responders/${id}/lists`),
  test: (id) => api.post(`/auto-responders/${id}/test`),
};

// ─── Admin ────────────────────────────────────────────────────────
export const adminAPI = {
  getStats: () => api.get("/admin/stats"),
  getAgencies: () => api.get("/admin/agencies"),
  createAgency: (data) => api.post("/admin/agencies", data),
  updateAgency: (id, data) => api.patch(`/admin/agencies/${id}`, data),
  toggleAgency: (id) => api.patch(`/admin/agencies/${id}/toggle`),
  // A Reseller is deleted together with its customers and their users — the typed name confirms it.
  deleteAgency: (id, confirmName) => api.delete(`/admin/agencies/${id}`, { data: confirmName ? { confirmName } : {} }),
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
  get: (id) => api.get(`/reseller/users/${id}`),
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
  // params: { before } older page · { after } newer page · { around } window centred on one message
  getMessages: (id, params) => api.get(`/conversations/${id}/messages`, { params }),
  // AI assist (never sends): three reply suggestions / a short summary
  aiSuggestReplies: (id) => api.post(`/conversations/${id}/ai/suggest-replies`),
  aiSummary: (id) => api.post(`/conversations/${id}/ai/summary`),
  // Server-side search inside one chat's history: { q, before, limit }
  searchMessages: (id, params, config) => api.get(`/conversations/${id}/messages/search`, { params, ...config }),
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
  transcribe: (id, messageId) => api.post(`/conversations/${id}/messages/${messageId}/transcribe`),
  // Messenger / Instagram: OPEN (24h) | HUMAN_AGENT (24h–7d, a person's reply) | CLOSED
  getMessagingWindow: (id) => api.get(`/conversations/${id}/messaging-window`),
  bulkAssign: (conversationIds, agentProfileId) => api.patch('/conversations/bulk-assign', { conversationIds, agentProfileId }),
  bulkUpdateStatus: (conversationIds, status) => api.patch('/conversations/bulk-status', { conversationIds, status }),
  toggleTranslate: (id, enabled, targetLang) => api.patch(`/conversations/${id}/translate`, { enabled, targetLang }),
  translateMessage: (id, messageId, targetLang) => api.post(`/conversations/${id}/messages/${messageId}/translate`, targetLang ? { targetLang } : undefined),
  markRead: (id) => api.patch(`/conversations/${id}/read`),
  markUnread: (id) => api.patch(`/conversations/${id}/unread`),
  markImportant: (id, isImportant) => api.patch(`/conversations/${id}/important`, isImportant !== undefined ? { is_important: isImportant } : undefined),
  markArchived: (id, isArchived) => api.patch(`/conversations/${id}/archive`, isArchived !== undefined ? { is_archived: isArchived } : undefined),
};

// ─── Messenger Utility templates + Human Agent (routes/messengerTemplates.js) ───
export const messengerUtilityAPI = {
  getStatus: (integrationId) => api.get(`/messenger-utility/accounts/${integrationId}/status`),
  setHumanAgent: (integrationId, enabled) => api.patch(`/messenger-utility/accounts/${integrationId}/human-agent`, { enabled }),
  list: (integrationId, status) => api.get('/messenger-utility/templates', { params: { integrationId, ...(status ? { status } : {}) } }),
  sync: (integrationId) => api.post('/messenger-utility/templates/sync', { integrationId }),
  validate: (draft) => api.post('/messenger-utility/templates/validate', { draft }),
  create: (integrationId, draft) => api.post('/messenger-utility/templates', { integrationId, draft }),
  createFromLibrary: (data) => api.post('/messenger-utility/templates/from-library', data),
  remove: (id) => api.delete(`/messenger-utility/templates/${id}`),
  library: (integrationId, q, language) => api.get('/messenger-utility/library', { params: { integrationId, q, language } }),
};

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
  // Public (no auth). `host` = this site's address: the blog is main-domain only.
  list:       (params) => api.get('/blog', { params: { ...params, host: window.location.hostname } }),
  getBySlug:  (slug)   => api.get(`/blog/${slug}`, { params: { host: window.location.hostname } }),
  categories: ()       => api.get('/blog/categories', { params: { host: window.location.hostname } }),

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

// ─── Public site: main domain or a Reseller's landing page ─────────
export const publicSiteAPI = {
  get: () => api.get('/public/site', { params: { host: window.location.hostname } }),
};

export const resellerSiteAPI = {
  get: () => api.get('/reseller/site'),
  save: (data) => api.put('/reseller/site', data),
};

// ─── Documentation (public + Super Admin) ──────────────────────────
export const docsAPI = {
  home: () => api.get('/docs/home'),
  nav: (categorySlug) => api.get(`/docs/categories/${encodeURIComponent(categorySlug)}/nav`),
  article: (slug) => api.get(`/docs/articles/${encodeURIComponent(slug)}`),
  search: (q) => api.get('/docs/search', { params: { q } }),
};

export const docsAdminAPI = {
  tree: () => api.get('/admin/docs/tree'),
  createCategory: (data) => api.post('/admin/docs/categories', data),
  updateCategory: (id, data) => api.put(`/admin/docs/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/admin/docs/categories/${id}`),
  createSection: (data) => api.post('/admin/docs/sections', data),
  updateSection: (id, data) => api.put(`/admin/docs/sections/${id}`, data),
  deleteSection: (id) => api.delete(`/admin/docs/sections/${id}`),
  reorder: (type, ids) => api.put('/admin/docs/reorder', { type, ids }),
  listArticles: (params) => api.get('/admin/docs/articles', { params }),
  getArticle: (id) => api.get(`/admin/docs/articles/${id}`),
  createArticle: (data) => api.post('/admin/docs/articles', data),
  updateArticle: (id, data) => api.put(`/admin/docs/articles/${id}`, data),
  deleteArticle: (id) => api.delete(`/admin/docs/articles/${id}`),
  uploadImage: (formData) => api.post('/admin/docs/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
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
  // Per-step analytics; days = 7 | 30 | 90 | 'all'
  analytics: (id, days) => api.get(`/flows/${id}/analytics`, { params: { days } }),
  create: (data) => api.post('/flows', data),
  update: (id, data) => api.put(`/flows/${id}`, data),
  toggle: (id) => api.patch(`/flows/${id}/toggle`),
  delete: (id) => api.delete(`/flows/${id}`),
  clone: (id, data) => api.post(`/flows/${id}/clone`, data),
  // Portable bot file (chatbot_api/routes/flowTransfer.js)
  exportFile: (id) => api.get(`/flows/${id}/export`),
  importFile: (data) => api.post('/flows/import', data),
};

// ─── Contacts ───────────────────────────────────────────────────────
export const contactAPI = {
  getAll: (params) => api.get('/contacts', { params }),
  search: (q, limit) => api.get('/contacts/search', { params: { q, limit } }),
  getOne: (id) => api.get(`/contacts/${id}`),
  merge: (id, otherId) => api.post(`/contacts/${id}/merge`, { otherId }),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  addTag: (id, tag) => api.post(`/contacts/${id}/tags`, { tag }),
  removeTag: (id, tag) => api.delete(`/contacts/${id}/tags/${encodeURIComponent(tag)}`),
  getNotes: (id) => api.get(`/contacts/${id}/notes`),
  getSequences: (id) => api.get(`/contacts/${id}/sequences`),
  // mentionUserIds → each mentioned teammate is notified; conversationId makes the notification open that chat.
  addNote: (id, note, extra = {}) => api.post(`/contacts/${id}/notes`, { note, ...extra }),
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
// ─── Growth tools: trackable chat links + QR codes (routes/growthLinks.js) ─
export const growthLinkAPI = {
  list: (integrationId) => api.get('/growth-links', { params: { integrationId } }),
  create: (data) => api.post('/growth-links', data),
  update: (id, data) => api.put(`/growth-links/${id}`, data),
  remove: (id) => api.delete(`/growth-links/${id}`),
  qr: (id, format = 'png') => api.get(`/growth-links/${id}/qr`, { params: { format }, responseType: 'blob' }),
};

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
  usage: (id) => api.get(`/custom-fields/${id}/usage`),
};

// ─── Workspace variables {{var.key}} + system fields ─────────────────
export const workspaceVariableAPI = {
  getAll: () => api.get('/workspace-variables'),
  systemFields: () => api.get('/workspace-variables/system-fields'),
  create: (data) => api.post('/workspace-variables', data),
  update: (id, data) => api.put(`/workspace-variables/${id}`, data),
  delete: (id, force = false) => api.delete(`/workspace-variables/${id}`, { params: force ? { force: 1 } : undefined }),
};

// ─── My in-app notifications (top-bar bell) ─────────────────────────
export const myNotificationsAPI = {
  getAll: () => api.get('/me/notifications'),
  markRead: (id) => api.post(`/me/notifications/${id}/read`),
  markAllRead: () => api.post('/me/notifications/read-all'),
  // Browser push (utils/webPush.js on the server, utils/browserPush.js here)
  pushKey: () => api.get('/me/push/key'),
  pushSubscribe: (subscription) => api.post('/me/push/subscribe', { subscription }),
  pushUnsubscribe: (endpoint) => api.post('/me/push/unsubscribe', { endpoint }),
  pushTest: () => api.post('/me/push/test'),
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
  // confirmUtility: a Messenger Utility broadcast — the sender confirmed it is a personal transactional update (server 409s otherwise).
  sendNow: (id, { confirmAudience = false, confirmUtility = false } = {}) => api.post(`/broadcasts/${id}/send`, { confirmAudience, confirmUtility }),
  schedule: (id, scheduledAt, { confirmAudience = false, confirmUtility = false } = {}) => api.post(`/broadcasts/${id}/schedule`, { scheduledAt, confirmAudience, confirmUtility }),
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
  // Customers calling the business (utils/whatsappCallEvents.js)
  accept: (callDbId, sdpAnswer) => api.post(`/calls/${callDbId}/accept`, { sdpAnswer }),
  reject: (callDbId) => api.post(`/calls/${callDbId}/reject`),
  // Calling tab: settings (Meta + our prefs), log, stats, call button / link, recordings
  getSettings: (integrationId) => api.get(`/calls/settings/${integrationId}`),
  saveSettings: (integrationId, data) => api.put(`/calls/settings/${integrationId}`, data),
  uploadVoicemail: (integrationId, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/calls/settings/${integrationId}/voicemail-audio`, form);
  },
  getLog: (params) => api.get('/calls/log', { params }),
  getStats: (params) => api.get('/calls/stats', { params }),
  sendCallButton: (data) => api.post('/calls/button', data),
  getCallLink: (integrationId, payload) => api.get(`/calls/link/${integrationId}`, { params: payload ? { payload } : {} }),
  uploadRecording: (callDbId, blob, seconds) => {
    const form = new FormData();
    form.append('file', blob, `call-${callDbId}.webm`);
    form.append('seconds', String(seconds || 0));
    return api.post(`/calls/${callDbId}/recording`, form);
  },
  // Recordings are private: fetched with the login token, played from a blob URL.
  getRecording: (callDbId) => api.get(`/calls/${callDbId}/recording`, { responseType: 'blob' }),
  deleteRecording: (callDbId) => api.delete(`/calls/${callDbId}/recording`),
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
// Reseller payments (chatbot_api/routes/resellerBilling.js, routes/agencyPaymentGateways.js)
export const resellerBillingAPI = {
  get: () => api.get('/customer-billing'),
  checkout: (packageId, provider = 'STRIPE') => api.post('/customer-billing/checkout', { packageId, provider }),
  confirm: (sessionId) => api.post('/customer-billing/confirm', { sessionId }),
  confirmPaypal: (orderId) => api.post('/customer-billing/confirm', { provider: 'PAYPAL', orderId }),
  payments: () => api.get('/reseller/payments'),
};
export const agencyGatewayAPI = {
  getAll: () => api.get('/agency/payment-gateways'),
  save: (provider, data) => api.put(`/agency/payment-gateways/${provider}`, data),
  test: (provider) => api.post(`/agency/payment-gateways/${provider}/test`),
  remove: (provider) => api.delete(`/agency/payment-gateways/${provider}`),
};

// Marketing Messages on Messenger (chatbot_api/routes/messengerMarketing.js)
export const marketingMessagesAPI = {
  get: (id) => api.get(`/marketing-messages/${id}`),
  connectCode: (id, code) => api.post(`/marketing-messages/${id}/connect/code`, { code }),
  connectManual: (id, data) => api.post(`/marketing-messages/${id}/connect/manual`, data),
  adAccounts: (id) => api.get(`/marketing-messages/${id}/ad-accounts`),
  setAdAccount: (id, adAccountId) => api.put(`/marketing-messages/${id}/ad-account`, { adAccountId }),
  disconnect: (id) => api.delete(`/marketing-messages/${id}/account`),
  syncSubscribers: (id) => api.post(`/marketing-messages/${id}/subscribers/sync`),
  optIn: (id, data) => api.post(`/marketing-messages/${id}/opt-in`, data),
  createCampaign: (id, data) => api.post(`/marketing-messages/${id}/campaigns`, data),
  updateCampaign: (id, cid, data) => api.put(`/marketing-messages/${id}/campaigns/${cid}`, data),
  deleteCampaign: (id, cid) => api.delete(`/marketing-messages/${id}/campaigns/${cid}`),
  audience: (id, cid) => api.get(`/marketing-messages/${id}/campaigns/${cid}/audience`),
  send: (id, cid) => api.post(`/marketing-messages/${id}/campaigns/${cid}/send`, { confirmPaid: true }),
};
