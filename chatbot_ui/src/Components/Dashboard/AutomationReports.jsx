import { Megaphone, ListOrdered, Workflow, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Panel } from './DashboardCard';
import { formatCount } from '../../utils/dashboardFormat';

// Broadcasting · Sequences · Webhook / workflow automation — one row, three
// matching cards. Numbers from utils/dashboardStats.js getAutomationStats.

function Metric({ label, value, tone }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-hover)', minWidth: 0 }}>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: tone || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{formatCount(value)}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Footer({ children }) {
  return <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{children}</div>;
}

export default function AutomationReports({ automation, links = true }) {
  const navigate = useNavigate();
  if (!automation) return null;
  const { broadcasts: b, sequences: s, workflows: w } = automation;
  const open = (path) => links && (
    <button type="button" onClick={() => navigate(path)} title="Open" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ArrowUpRight size={13} />
    </button>
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 };
  // Of every message that was attempted (sent + failed), how many were delivered.
  const attempted = b.sent + b.failedMessages;
  const deliveryRate = attempted ? Math.round((b.delivered / attempted) * 100) : null;
  const webhookRuns = w.webhookSuccessLast30 + w.webhookFailedLast30;

  return (
    <div className="dash-automation-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
      <Panel icon={Megaphone} title="Broadcasting" subtitle="All campaigns" action={open('/campaigns')}>
        <div style={grid}>
          <Metric label="Campaigns" value={b.total} />
          <Metric label="Completed" value={b.completed} />
          <Metric label="Messages sent" value={b.sent} tone="#059669" />
          <Metric label="Failed messages" value={b.failedMessages} tone={b.failedMessages ? '#dc2626' : undefined} />
        </div>
        <Footer>
          {b.upcoming ? `${formatCount(b.upcoming)} scheduled or sending · ` : ''}
          {deliveryRate !== null ? `${deliveryRate}% delivered` : 'No messages sent yet'}
          {b.failedCampaigns ? ` · ${formatCount(b.failedCampaigns)} failed campaign(s)` : ''}
        </Footer>
      </Panel>

      <Panel icon={ListOrdered} title="Sequences" subtitle="Drip campaigns" action={open('/bots')}>
        <div style={grid}>
          <Metric label="Sequences" value={s.total} />
          <Metric label="Active" value={s.active} tone="#059669" />
          <Metric label="Subscribers enrolled" value={s.enrolled} />
          <Metric label="Completed" value={s.completed} />
        </div>
        <Footer>
          {formatCount(s.sentLast30)} step message(s) sent in the last 30 days
          {s.failedLast30 ? ` · ${formatCount(s.failedLast30)} failed` : ''}
        </Footer>
      </Panel>

      <Panel icon={Workflow} title="Webhook & workflow automation" subtitle="Shopify · WooCommerce · webhooks">
        <div style={grid}>
          <Metric label="Shopify stores" value={w.shopify.active} />
          <Metric label="WooCommerce stores" value={w.woocommerce.active} />
          <Metric label="Orders synced" value={w.orders} />
          <Metric label="Webhook runs (30d)" value={webhookRuns} tone={w.webhookFailedLast30 ? '#b45309' : undefined} />
        </div>
        <Footer>
          {formatCount(w.ordersLast30)} order(s) in the last 30 days
          {webhookRuns ? ` · ${formatCount(w.webhookFailedLast30)} webhook failure(s)` : ''}
        </Footer>
      </Panel>
    </div>
  );
}
