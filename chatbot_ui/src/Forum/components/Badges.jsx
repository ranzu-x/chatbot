import { CATEGORIES, STATUS_META, MODERATION_META, initials, avatarGradient } from "../constants";

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

export function Avatar({ name, size = 34 }) {
  return (
    <span
      className="fm-avatar"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), background: avatarGradient(name) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
