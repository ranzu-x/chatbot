import { Bug, Lightbulb, MessagesSquare, Megaphone } from "lucide-react";

// Mirrors chatbot_api/utils/forumStatus.js — the backend is the source of
// truth (it validates every status change); this is just for rendering.
export const CATEGORIES = {
  BUG: { label: "Bug Report", plural: "Bug Reports", icon: Bug, color: "#e5484d" },
  FEATURE_REQUEST: { label: "Feature Request", plural: "Feature Requests", icon: Lightbulb, color: "#d97706" },
  DISCUSSION: { label: "Discussion", plural: "Discussions", icon: MessagesSquare, color: "#7c3aed" },
  ANNOUNCEMENT: { label: "Announcement", plural: "Announcements", icon: Megaphone, color: "#2563eb" },
};

export const COMMUNITY_CATEGORIES = ["BUG", "FEATURE_REQUEST", "DISCUSSION"];

export const STATUS_OPTIONS_BY_CATEGORY = {
  BUG: ["OPEN", "IN_PROCESS", "RESOLVED"],
  FEATURE_REQUEST: ["OPEN", "CONSIDERED", "IN_PROCESS", "IMPLEMENTED"],
  DISCUSSION: ["OPEN", "COMPLETED"],
};

export const STATUS_META = {
  OPEN: { label: "Open", color: "#2563eb" },
  IN_PROCESS: { label: "In Process", color: "#d97706" },
  CONSIDERED: { label: "Considered", color: "#7c3aed" },
  RESOLVED: { label: "Resolved", color: "#12a150" },
  IMPLEMENTED: { label: "Implemented", color: "#12a150" },
  COMPLETED: { label: "Completed", color: "#12a150" },
};

export const MODERATION_META = {
  PENDING_REVIEW: { label: "Pending Review", color: "#d97706" },
  APPROVED: { label: "Approved", color: "#12a150" },
  REJECTED: { label: "Not Approved", color: "#e5484d" },
};

// Who may use the forum: End Users (DIRECT_CUSTOMER) and Resellers, plus
// Platform staff (ADMIN). A Reseller's own customers (RESELLER_CUSTOMER)
// can't see anything at all — the portal shows them a "not available" page.
const ELIGIBLE_ACCOUNT_TYPES = ["DIRECT_CUSTOMER", "RESELLER"];

export const isBlockedAccount = (user) => Boolean(user) && user.accountType === "RESELLER_CUSTOMER";
export const isStaff = (user) => user?.role === "ADMIN";
export const isForumEligible = (user) =>
  Boolean(user) && (isStaff(user) || ELIGIBLE_ACCOUNT_TYPES.includes(user.accountType));
/** Eligible AND (verified email, or staff) — i.e. can post/reply/upvote right now. */
export const canForumPost = (user) => isStaff(user) || (isForumEligible(user) && Boolean(user.emailVerified));

export function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export const initials = (name = "") =>
  name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "U";

const AVATAR_GRADIENTS = [
  ["#6366f1", "#8b5cf6"], ["#0ea5e9", "#6366f1"], ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ef4444"], ["#ec4899", "#8b5cf6"], ["#14b8a6", "#22c55e"],
];
/** Stable per-name avatar gradient so the same person always looks the same. */
export function avatarGradient(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
