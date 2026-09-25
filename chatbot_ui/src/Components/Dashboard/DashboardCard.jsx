import './dashboard.css';

// Shared shell for dashboard panels + the KPI stat card, so every widget on
// the Super Admin / Reseller / Workspace dashboards has the same border,
// radius, padding and header treatment.

export function Panel({ title, subtitle, icon: Icon, action, children, style }) {
  const IconCmp = Icon;
  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)', padding: '16px 18px', minWidth: 0, display: 'flex', flexDirection: 'column', ...style }}>
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {IconCmp && (
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconCmp size={15} />
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
              {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function KpiCard({ icon: Icon, label, value, hint, trend, tone = '#2563eb' }) {
  const IconCmp = Icon;
  const up = trend !== null && trend !== undefined && trend >= 0;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: `${tone}14`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconCmp size={16} />
        </span>
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-tertiary)', minHeight: 18, flexWrap: 'wrap' }}>
        {trend !== null && trend !== undefined && (
          <span style={{ fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: up ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: up ? '#059669' : '#dc2626' }}>
            {up ? '▲' : '▼'} {Math.abs(trend).toFixed(Math.abs(trend) < 10 ? 1 : 0)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, height = 220 }) {
  const IconCmp = Icon;
  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6, color: 'var(--text-tertiary)', padding: '0 16px' }}>
      {IconCmp && <IconCmp size={22} style={{ opacity: 0.5 }} />}
      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
      {text && <div style={{ fontSize: '0.76rem', maxWidth: 320, lineHeight: 1.5 }}>{text}</div>}
    </div>
  );
}
