import axios from "axios";

/**
 * The Community Forum is its own portal, fully isolated from the dashboard
 * (same approach as the Support Desk, see services/supportDeskApi.js): its
 * own axios instance and its own localStorage token key, so signing in or
 * out — or a 401 — in one never touches the other. Same backend, same
 * /auth/login endpoint, same accounts: separate session.
 *
 * `withCredentials: false` is deliberate (stricter than the Support Desk):
 * the API also sets an httpOnly `token` cookie for the dashboard, and the
 * backend prefers a cookie over a bearer header. Never sending cookies here
 * means the forum's identity is only ever the forum's own token — a
 * different dashboard login in the same browser can't leak into it.
 */
const TOKEN_KEY = "forum_auth_token";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: false,
});

client.interceptors.request.use((config) => {
  config.headers["ngrok-skip-browser-warning"] = "true";
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || "";
      if (!url.includes("/auth/login")) {
        localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new Event("forum_auth:unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

export const getForumToken = () => localStorage.getItem(TOKEN_KEY);
export const setForumToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearForumToken = () => localStorage.removeItem(TOKEN_KEY);

export const forumAuthAPI = {
  login: (data) => client.post("/auth/login", data),
  me: () => client.get("/auth/me"),
  // Email verification is account-level (routes/auth.js), shared with the dashboard.
  verifyEmail: (token) => client.post("/auth/verify-email", { token }),
  resendVerification: () => client.post("/auth/resend-verification"),
};

export const forumAPI = {
  listThreads: (params) => client.get("/forum/threads", { params }),
  getThread: (id) => client.get(`/forum/threads/${id}`),
  getStats: () => client.get("/forum/stats"),
  createThread: (data) => client.post("/forum/threads", data),
  reply: (threadId, body) => client.post(`/forum/threads/${threadId}/replies`, { body }),
  upvote: (threadId) => client.post(`/forum/threads/${threadId}/upvote`),
  removeUpvote: (threadId) => client.delete(`/forum/threads/${threadId}/upvote`),
  myThreads: () => client.get("/forum/my-threads"),
};

// Staff (ADMIN) moderation — same portal, gated by role.
export const moderationAPI = {
  getPending: () => client.get("/admin/forum/pending"),
  approve: (threadId) => client.post(`/admin/forum/threads/${threadId}/approve`),
  reject: (threadId, reason) => client.post(`/admin/forum/threads/${threadId}/reject`, { reason }),
  setStatus: (threadId, status) => client.patch(`/admin/forum/threads/${threadId}/status`, { status }),
  setPinned: (threadId, pinned) => client.patch(`/admin/forum/threads/${threadId}/pin`, { pinned }),
  deleteThread: (threadId) => client.delete(`/admin/forum/threads/${threadId}`),
  deleteReply: (replyId) => client.delete(`/admin/forum/replies/${replyId}`),
  getStats: () => client.get("/admin/forum/stats"),
};
