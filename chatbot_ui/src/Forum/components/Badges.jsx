import { useState } from "react";
import { CATEGORIES, STATUS_META, MODERATION_META } from "../constants";

// The same default picture as the dashboard (public/default-avatar.svg) — a static
// file, not a dashboard import, so the forum stays self-contained.
const DEFAULT_AVATAR = "/default-avatar.svg";
const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1\/?$/, "");
const pictureUrl = (src) => (!src ? "" : /^(https?:|data:|blob:)/i.test(src) ? src : `${API_ORIGIN}${src.startsWith("/") ? "" : "/"}${src}`);

export function CategoryBadge({ category }) {
  const meta = CATEGORIES[category];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="fm-badge" style={{ "--b": meta.color }}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}

/** Announcements have no status workflow, so nothing renders for them. */
export function StatusBadge({ status, category }) {
  const meta = STATUS_META[status];
  if (!meta || category === "ANNOUNCEMENT") return null;
  return <span className="fm-badge" style={{ "--b": meta.color }}>{meta.label}</span>;
}

export function ModerationBadge({ status }) {
  const meta = MODERATION_META[status];
  if (!meta) return null;
  return <span className="fm-badge" style={{ "--b": meta.color }}>{meta.label}</span>;
}

export function Avatar({ name, src, size = 34 }) {
  const [failed, setFailed] = useState(false);
  const url = !failed && pictureUrl(src) ? pictureUrl(src) : DEFAULT_AVATAR;
  return (
    <img
      className="fm-avatar"
      src={url}
      alt={name ? `${name}'s profile picture` : "Profile picture"}
      title={name}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "cover", background: "var(--fm-surface)" }}
      onError={() => { if (url !== DEFAULT_AVATAR) setFailed(true); }}
    />
  );
}
