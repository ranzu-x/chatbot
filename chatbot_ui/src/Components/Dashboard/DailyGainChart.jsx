import { UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Panel, EmptyState } from './DashboardCard';
import { formatCount, currentMonthKey } from '../../utils/dashboardFormat';

// Daily User Gain: new subscribers per day of the chosen month. Counts only
// subscribers who arrived through a channel or integration — CSV / Sheet
// imports and manual adds are excluded on the server (contacts.source).

const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function DailyGainChart({ gain, month, onMonthChange, loading }) {
  const key = month || gain?.month || currentMonthKey();
  const isCurrent = key >= currentMonthKey();
  const label = new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const series = gain?.series || [];
  const best = series.reduce((a, b) => (b.count > a.count ? b : a), { day: null, count: 0 });

  const navBtn = (disabled) => ({
    width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <Panel
      icon={UserPlus}
      title="Daily user gain"
      subtitle={gain ? `${formatCount(gain.total)} new subscribers${best.count ? ` · best day ${best.day} (${best.count})` : ''} — imports excluded` : 'Imports excluded'}
      action={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(key, -1))} style={navBtn(false)}><ChevronLeft size={14} /></button>
          <input
            type="month"
            aria-label="Month"
            value={key}
            max={currentMonthKey()}
            onChange={(e) => e.target.value && onMonthChange(e.target.value)}
            style={{ height: 28, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.76rem', fontFamily: 'inherit' }}
          />
          <button type="button" aria-label="Next month" disabled={isCurrent} onClick={() => !isCurrent && onMonthChange(shiftMonth(key, 1))} style={navBtn(isCurrent)}><ChevronRight size={14} /></button>
        </div>
      )}
      style={{ height: '100%' }}
    >
      <div style={{ height: 260, opacity: loading ? 0.5 : 1, transition: 'opacity .15s' }}>
        {!loading && gain && gain.total === 0 ? (
          <EmptyState icon={UserPlus} title={`No new subscribers in ${label}`} text="Subscribers who message your bots or arrive through an integration show up here." height={260} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={0} tick={{ fontSize: 10 }} />
              <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip
                cursor={{ fill: 'var(--bg-hover)' }}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.78rem', boxShadow: 'var(--shadow-md)', color: 'var(--text-primary)' }}
                labelFormatter={(d) => new Date(`${key}-${String(d).padStart(2, '0')}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                formatter={(v) => [formatCount(v), 'New subscribers']}
              />
              <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
