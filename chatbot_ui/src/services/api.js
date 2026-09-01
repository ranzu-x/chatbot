import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true,
});

// Inject stored token as Authorization header on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth & Tenant ──────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
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
};

// ─── AI Agent & Knowledge Base ────────────────────────────────────
export const aiAPI = {
  getAgent: () => api.get("/ai/agent"),
  updateAgent: (data) => api.put("/ai/agent", data),
  getKnowledge: () => api.get("/ai/knowledge"),
  addTextKnowledge: (data) => api.post("/ai/knowledge/text", data),
  addFaqKnowledge: (data) => api.post("/ai/knowledge/faq", data),
  addUrlKnowledge: (data) => api.post("/ai/knowledge/url", data),
  deleteKnowledge: (id) => api.delete(`/ai/knowledge/${id}`),
  testChat: (data) => api.post("/ai/test-chat", data),
};

// ─── Admin ────────────────────────────────────────────────────────
export const adminAPI = {
  getStats: () => api.get("/admin/stats"),
  getAgencies: () => api.get("/admin/agencies"),
  createAgency: (data) => api.post("/admin/agencies", data),
  toggleAgency: (id) => api.patch(`/admin/agencies/${id}/toggle`),
  deleteAgency: (id) => api.delete(`/admin/agencies/${id}`),
  getUsers: () => api.get("/admin/users"),
  toggleUser: (id) => api.patch(`/admin/users/${id}/toggle`),
  createUser: (data) => api.post("/admin/users", data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getAnalytics: (days = 14) => api.get(`/admin/analytics?days=${days}`),
};

// ─── Agency ───────────────────────────────────────────────────────
export const agencyAPI = {
  getProfile: () => api.get("/agency/profile"),
  getStats: () => api.get("/agency/stats"),
  getAnalytics: (days = 14) => api.get(`/agency/analytics?days=${days}`),
  getAgents: () => api.get("/agency/agents"),
  createAgent: (data) => api.post("/agency/agents", data),
  deleteAgent: (userId) => api.delete(`/agency/agents/${userId}`),
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
  assign: (id, agentProfileId) => api.patch(`/conversations/${id}/assign`, { agentProfileId }),
  updateStatus: (id, status) => api.patch(`/conversations/${id}/status`, { status }),
  toggleBot: (id) => api.patch(`/conversations/${id}/toggle-bot`),
  triggerFlow: (id, flowId) => api.post(`/conversations/${id}/trigger-flow`, { flowId }),
  sendMessage: (id, data) => api.post(`/conversations/${id}/messages`, data),
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
  deleteWhatsApp: (id) => api.delete(`/channels/whatsapp/${id}`),
  // Facebook
  getFacebook: () => api.get('/channels/facebook'),
  addFacebook: (data) => api.post('/channels/facebook', data),
  importFBPages: (token) => api.post('/channels/facebook/import-pages', { userAccessToken: token }),
  quickConnectFacebook: (token) => api.post('/channels/facebook/quick-connect', { token }),
  syncFBSubscriptions: () => api.post('/channels/facebook/sync-subscriptions'),
  deleteFacebook: (id) => api.delete(`/channels/facebook/${id}`),
  // Facebook Comment Automation
  getFBCommentRules: () => api.get('/channels/facebook/comment-rules'),
  createFBCommentRule: (data) => api.post('/channels/facebook/comment-rules', data),
  updateFBCommentRule: (id, data) => api.put(`/channels/facebook/comment-rules/${id}`, data),
  toggleFBCommentRule: (id) => api.patch(`/channels/facebook/comment-rules/${id}/toggle`),
  deleteFBCommentRule: (id) => api.delete(`/channels/facebook/comment-rules/${id}`),
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
  getWebchat: () => api.get('/channels/webchat'),
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
};

// ─── Meta App Settings ─────────────────────────────────────────────
export const metaAppAPI = {
  get: () => api.get('/settings/meta-app'),
  save: (data) => api.post('/settings/meta-app', data),
  test: () => api.post('/settings/meta-app/test'),
  getAppId: () => api.get('/settings/meta-app/app-id'),
};

// ─── TikTok App Settings ───────────────────────────────────────────
export const tiktokAppAPI = {
  get: () => api.get('/settings/tiktok-app'),
  save: (data) => api.post('/settings/tiktok-app', data),
  test: () => api.post('/settings/tiktok-app/test'),
  getClientKey: () => api.get('/settings/tiktok-app/client-key'),
};

// ─── Flows ─────────────────────────────────────────────────────────
export const flowAPI = {
  getAll: () => api.get('/flows'),
  getOne: (id) => api.get(`/flows/${id}`),
  create: (data) => api.post('/flows', data),
  update: (id, data) => api.put(`/flows/${id}`, data),
  toggle: (id) => api.patch(`/flows/${id}/toggle`),
  delete: (id) => api.delete(`/flows/${id}`),
};

// ─── Contacts ───────────────────────────────────────────────────────
export const contactAPI = {
  getAll: (params) => api.get('/contacts', { params }),
  getOne: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  addTag: (id, tag) => api.post(`/contacts/${id}/tags`, { tag }),
  removeTag: (id, tag) => api.delete(`/contacts/${id}/tags/${encodeURIComponent(tag)}`),
  getNotes: (id) => api.get(`/contacts/${id}/notes`),
  addNote: (id, note) => api.post(`/contacts/${id}/notes`, { note }),
  deleteNote: (contactId, noteId) => api.delete(`/contacts/${contactId}/notes/${noteId}`),
  toggleBot: (id) => api.patch(`/contacts/${id}/toggle-bot`),
  exportCSV: (params) => api.get('/contacts/export/csv', { params, responseType: 'blob' }),
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

// ─── Canned Responses ──────────────────────────────────────────────────
export const cannedResponseAPI = {
  getAll: () => api.get('/canned-responses'),
  create: (data) => api.post('/canned-responses', data),
  update: (id, data) => api.put(`/canned-responses/${id}`, data),
  delete: (id) => api.delete(`/canned-responses/${id}`),
};

// ─── Campaigns ────────────────────────────────────────────────────────
export const campaignAPI = {
  getAll: () => api.get('/campaigns'),
  getOne: (id) => api.get(`/campaigns/${id}`),
  create: (data) => api.post('/campaigns', data),
  delete: (id) => api.delete(`/campaigns/${id}`),
};

// ─── Drip Sequences ───────────────────────────────────────────────────
export const sequenceAPI = {
  getAll: () => api.get('/sequences'),
  getOne: (id) => api.get(`/sequences/${id}`),
  create: (data) => api.post('/sequences', data),
  subscribe: (id, data) => api.post(`/sequences/${id}/subscribe`, data),
  delete: (id) => api.delete(`/sequences/${id}`),
};

export default api;