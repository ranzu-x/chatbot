import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true,
});

// ─── Auth ─────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
};

// ─── Admin ────────────────────────────────────────────────────────
export const adminAPI = {
  getStats: () => api.get("/admin/stats"),
  getAgencies: () => api.get("/admin/agencies"),
  createAgency: (data) => api.post("/admin/agencies", data),
  toggleAgency: (id) => api.patch(`/admin/agencies/${id}/toggle`),
  deleteAgency: (id) => api.delete(`/admin/agencies/${id}`),
  getUsers: () => api.get("/admin/users"),
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
  sendMessage: (id, data) => api.post(`/conversations/${id}/messages`, data),
};

// ─── Channels ─────────────────────────────────────────────────────
export const channelAPI = {
  // WhatsApp
  getWhatsApp: () => api.get('/channels/whatsapp'),
  addWhatsApp: (data) => api.post('/channels/whatsapp', data),
  deleteWhatsApp: (id) => api.delete(`/channels/whatsapp/${id}`),
  // Facebook
  getFacebook: () => api.get('/channels/facebook'),
  addFacebook: (data) => api.post('/channels/facebook', data),
  importFBPages: (token) => api.post('/channels/facebook/import-pages', { userAccessToken: token }),
  deleteFacebook: (id) => api.delete(`/channels/facebook/${id}`),
  // Instagram
  getInstagram: () => api.get('/channels/instagram'),
  addInstagram: (data) => api.post('/channels/instagram', data),
  deleteInstagram: (id) => api.delete(`/channels/instagram/${id}`),
  importIGAccounts: (token) => api.post('/channels/instagram/import-accounts', { userAccessToken: token }),
  // Telegram
  getTelegram: () => api.get('/channels/telegram'),
  addTelegram: (token) => api.post('/channels/telegram', { botToken: token }),
  deleteTelegram: (id) => api.delete(`/channels/telegram/${id}`),
  // Webchat
  getWebchat: () => api.get('/channels/webchat'),
  addWebchat: (data) => api.post('/channels/webchat', data),
  updateWebchat: (id, data) => api.put(`/channels/webchat/${id}`, data),
  deleteWebchat: (id) => api.delete(`/channels/webchat/${id}`),
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