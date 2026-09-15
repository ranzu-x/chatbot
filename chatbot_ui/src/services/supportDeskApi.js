import axios from "axios";

/**
 * A DELIBERATELY separate axios instance from services/api.js's `api`.
 * The Support Desk is its own portal, not connected to the main
 * dashboard — it stores its bearer token under its own localStorage key
 * so a 401 in one portal never logs the other out, and a person can be
 * signed into the dashboard and the Support Desk independently (or only
 * ever use the Support Desk). It talks to the exact same backend/DB and
 * the exact same /auth/login endpoint — same accounts, separate session.
 */
const TOKEN_KEY = "support_auth_token";

const supportApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true,
});

supportApi.interceptors.request.use((config) => {
  config.headers["ngrok-skip-browser-warning"] = "true";
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

supportApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || "";
      const isPublicAuth = url.includes("/auth/login") || url.includes("/auth/register");
      if (!isPublicAuth) {
        localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new Event("support_auth:unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

export function getSupportToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setSupportToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearSupportToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const supportAuthAPI = {
  login: (data) => supportApi.post("/auth/login", data),
  me: () => supportApi.get("/auth/me"),
};

export const ticketAPI = {
  bootstrap: () => supportApi.get("/support-desk/bootstrap"),
  create: (data) => supportApi.post("/support-desk/tickets", data),
  myTickets: (params) => supportApi.get("/support-desk/my-tickets", { params }),
  queue: (params) => supportApi.get("/support-desk/queue", { params }),
  getOne: (id) => supportApi.get(`/support-desk/tickets/${id}`),
  reply: (id, data) => supportApi.post(`/support-desk/tickets/${id}/messages`, data),
  reopen: (id) => supportApi.post(`/support-desk/tickets/${id}/reopen`),
  rate: (id, data) => supportApi.post(`/support-desk/tickets/${id}/rate`, data),
  setStatus: (id, status) => supportApi.patch(`/support-desk/tickets/${id}/status`, { status }),
  setPriority: (id, priority) => supportApi.patch(`/support-desk/tickets/${id}/priority`, { priority }),
  setDepartment: (id, departmentId) => supportApi.patch(`/support-desk/tickets/${id}/department`, { departmentId }),
  assign: (id, assignedTo) => supportApi.patch(`/support-desk/tickets/${id}/assign`, { assignedTo }),
};

export const departmentAPI = {
  list: () => supportApi.get("/support-desk/departments"),
  create: (data) => supportApi.post("/support-desk/departments", data),
  update: (id, data) => supportApi.put(`/support-desk/departments/${id}`, data),
  remove: (id) => supportApi.delete(`/support-desk/departments/${id}`),
};

export const cannedResponseAPI = {
  list: () => supportApi.get("/support-desk/canned-responses"),
  create: (data) => supportApi.post("/support-desk/canned-responses", data),
  update: (id, data) => supportApi.put(`/support-desk/canned-responses/${id}`, data),
  remove: (id) => supportApi.delete(`/support-desk/canned-responses/${id}`),
};

export const statsAPI = {
  get: () => supportApi.get("/support-desk/stats"),
  csatTrend: (days) => supportApi.get("/support-desk/csat-trend", { params: { days } }),
};

export const agentsAPI = {
  list: () => supportApi.get("/support-desk/agents"),
};

export const supportUploadAPI = {
  uploadFile: (formData) => supportApi.post("/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
};

export default supportApi;
