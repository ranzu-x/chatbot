import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Small building blocks shared by the customer and Super Admin AI Credits pages (design-system classes only). */

export function CreditStat({ icon, label, value, hint, tone = 'primary' }) {
  const Icon = icon;
  const tones = {
    primary: { bg: 'var(--primary-soft)', fg: 'var(--primary)' },
    success: { bg: 'rgba(16, 185, 129, 0.1)', fg: 'var(--success)' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', fg: 'var(--warning)' },
    danger: { bg: 'rgba(239, 68, 68, 0.1)', fg: 'var(--danger)' },
    muted: { bg: 'var(--bg-hover)', fg: 'var(--text-secondary)' },
  };
  const t = tones[tone] || tones.primary;
  return (
    <div className="stat-card" style={{ alignItems: 'flex-start' }}>
      <div className="stat-icon" style={{ background: t.bg, color: t.fg }}><Icon size={20} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-label" style={{ marginTop: 0, marginBottom: 4 }}>{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', whiteSpace: 'nowrap',
            fontSize: '0.84rem', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer',
            color: active === t.key ? 'var(--primary)' : 'var(--text-tertiary)',
            borderBottom: `2.5px solid ${active === t.key ? 'var(--primary)' : 'transparent'}`,
          }}
        >
          {t.icon && <t.icon size={15} />} {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  if (!total) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
      <span>{((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {Number(total).toLocaleString()}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
        <span style={{ alignSelf: 'center' }}>Page {page} of {pages}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

export function EmptyRow({ cols, text }) {
  return <tr><td colSpan={cols} style={{ textAlign: 'center', padding: 28, color: 'var(--text-tertiary)' }}>{text}</td></tr>;
}

/** Signed credit amount with colour: + green, - neutral. */
export function Amount({ value }) {
  const n = Number(value) || 0;
  return (
    <span style={{ fontWeight: 700, color: n > 0 ? 'var(--success)' : n < 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
      {n > 0 ? '+' : ''}{n.toLocaleString()}
    </span>
  );
}
