import { Users, Wallet, CalendarDays, CalendarRange, BarChart3, Globe2, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import 'flag-icons/css/flag-icons.min.css';
import { Panel, KpiCard, EmptyState } from './DashboardCard';
import { formatMoney, formatCount, countryName, percentChange, MONTH_SHORT } from '../../utils/dashboardFormat';

// Earnings + users widgets for the Super Admin and Reseller dashboards. Data
// comes from GET /admin/dashboard or /agency/dashboard (utils/dashboardStats.js
// on the API); nothing here is computed from raw records or hardcoded.

/** Total Users + Total / Monthly / Yearly earnings. */
export function SummaryCards({ users, earnings, usersLabel = 'Total Users', usersHint }) {
  const cur = earnings?.currency || 'USD';
  const unavailable = earnings && !earnings.available;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
      <KpiCard
        icon={Users}
        label={usersLabel}
        value={formatCount(users?.total)}
        hint={usersHint ?? (users ? `+${formatCount(users.thisMonth)} this month` : null)}
        tone="#2563eb"
      />
      <KpiCard
        icon={Wallet}
        label="Total Earnings"
        value={formatMoney(earnings?.total, cur, { compact: true })}
        hint={unavailable ? 'Not collecting payments yet' : `${formatCount(earnings?.payments)} payments`}
        tone="#10b981"
      />
      <KpiCard
        icon={CalendarDays}
        label="Monthly Earnings"
        value={formatMoney(earnings?.month, cur, { compact: true })}
        trend={unavailable ? null : percentChange(earnings?.month, earnings?.lastMonth)}
        hint={unavailable ? 'This month' : 'vs last month'}
        tone="#8b5cf6"
      />
      <KpiCard
        icon={CalendarRange}
        label="Yearly Earnings"
        value={formatMoney(earnings?.year, cur, { compact: true })}
        trend={unavailable ? null : percentChange(earnings?.year, earnings?.lastYearToDate)}
        hint={unavailable ? `${new Date().getFullYear()} so far` : 'vs same period last year'}
        tone="#f59e0b"
      />
    </div>
  );
}

/** Explains why a reseller's earnings are all zero. */
export function EarningsNotice({ earnings }) {
  if (!earnings || earnings.available) return null;
  return (
    <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{earnings.reason}</span>
    </div>
  );
}

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.78rem', boxShadow: 'var(--shadow-md)', color: 'var(--text-primary)' };

/** Current year vs previous year, month by month. */
export function EarningsComparisonChart({ earnings }) {
  const cmp = earnings?.yearComparison;
  const cur = earnings?.currency || 'USD';
  const data = (cmp?.months || []).map((m) => ({
    month: MONTH_SHORT[m.month - 1],
    [String(cmp.currentYear)]: m.current,
    [String(cmp.previousYear)]: m.previous,
  }));
  const hasData = (cmp?.months || []).some((m) => m.current || m.previous);
  const thisYearTotal = (cmp?.months || []).reduce((a, m) => a + m.current, 0);
  const lastYearTotal = (cmp?.months || []).reduce((a, m) => a + m.previous, 0);

  return (
    <Panel
      icon={BarChart3}
      title="Earnings: this year vs last year"
      subtitle={cmp ? `${cmp.currentYear} ${formatMoney(thisYearTotal, cur)} · ${cmp.previousYear} ${formatMoney(lastYearTotal, cur)}` : null}
    >
      {!hasData ? (
        <EmptyState icon={BarChart3} title="No earnings yet" text={earnings && !earnings.available ? earnings.reason : 'Paid invoices will appear here month by month.'} height={260} />
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatMoney(v, cur, { compact: true })} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-hover)' }} formatter={(v) => formatMoney(v, cur)} />
              <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: 6 }} iconType="circle" iconSize={8} />
              <Bar dataKey={String(cmp.previousYear)} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar dataKey={String(cmp.currentYear)} fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

/** Countries ranked by earnings (flag, name, amount). */
export function TopCountries({ earnings }) {
  const rows = earnings?.topCountries || [];
  const cur = earnings?.currency || 'USD';
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Panel icon={Globe2} title="Top earning countries" subtitle="Billing country of each payment" style={{ height: '100%' }}>
      {rows.length === 0 ? (
        <EmptyState icon={Globe2} title="No country data yet" text={earnings && !earnings.available ? earnings.reason : 'Countries appear once payments are recorded.'} height={240} />
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r, i) => (
            <li key={r.country || 'unknown'} style={{ display: 'grid', gridTemplateColumns: '18px 26px minmax(0,1fr) auto', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'right' }}>{i + 1}</span>
              {r.country ? (
                <span className={`fi fi-${r.country.toLowerCase()}`} role="img" aria-label={countryName(r.country)} style={{ width: 24, height: 18, borderRadius: 3, backgroundSize: 'cover', boxShadow: '0 0 0 1px var(--border)' }} />
              ) : (
                <span style={{ width: 24, height: 18, borderRadius: 3, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}><Globe2 size={11} /></span>
              )}
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{countryName(r.country)}</span>
                <span style={{ display: 'block', height: 4, borderRadius: 4, background: 'var(--bg-hover)', marginTop: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(r.amount / max) * 100}%`, background: '#6366f1', borderRadius: 4 }} />
                </span>
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.amount, cur)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
