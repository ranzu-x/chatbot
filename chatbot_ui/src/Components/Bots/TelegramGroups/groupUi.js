import { useEffect, useState } from 'react';

/* Shared styles, constants and helpers for Bot Manager → Group Management (Telegram). */

export const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 };
export const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 };
export const lbl = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };

export const PENALTY_OPTIONS = [
  { value: 'DELETE', label: 'Delete only' },
  { value: 'WARN', label: 'Delete + warn' },
  { value: 'MUTE', label: 'Delete + mute' },
  { value: 'KICK', label: 'Delete + remove' },
  { value: 'BAN', label: 'Delete + ban' },
];

export const TEMPLATE_HELP = 'Variables: {first_name} {full_name} {username} {mention} {group_title}. Formatting: <b>bold</b> <i>italic</i> <u>underline</u> <code>code</code> <a href="https://…">link</a>.';

/**
 * Local draft of some settings sections, saved together. `keys` = the
 * settings sections this tab edits.
 */
export function useSettingsDraft(settings, keys, onSave) {
  const pickDraft = () => Object.fromEntries(keys.map((k) => [k, settings?.[k]]));
  const [draft, setDraft] = useState(pickDraft);
  const [saving, setSaving] = useState(false);
  const snapshot = JSON.stringify(pickDraft());
  useEffect(() => { setDraft(JSON.parse(snapshot)); }, [snapshot]);
  const dirty = JSON.stringify(draft) !== snapshot;
  const patch = (key, p) => setDraft((d) => ({ ...d, [key]: Array.isArray(p) ? p : { ...d[key], ...p } }));
  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // onSave already told the user; the draft stays so nothing typed is lost.
    } finally {
      setSaving(false);
    }
  };
  return { draft, patch, dirty, saving, save, reset: () => setDraft(JSON.parse(snapshot)) };
}

export const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '—');
export const personName = (m) => [m.first_name, m.last_name].filter(Boolean).join(' ') || m.name || (m.username ? `@${m.username}` : `#${m.tg_user_id}`);

/** URL query keys the panel keeps its place in (cleared by the Bot Manager on account / tab change). */
export const TG_GROUP_URL_KEYS = ['tgGroup', 'tgTab'];
