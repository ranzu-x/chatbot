import { useEffect, useState } from 'react';
import { Loader2, Save, PlugZap, Copy, CreditCard } from 'lucide-react';
import AppLayout from '../../Layout/AppLayout';
import ResellerPaypalCard from './ResellerPaypalCard';
import api, { resellerBillingAPI, agencyGatewayAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Reseller → Customer Payments. The reseller's OWN Stripe account (keys stored
 * encrypted, chatbot_api/routes/agencyPaymentGateways.js): its customers pay
 * the reseller's plans (Packages & Modules) straight into it, no platform fee.
 * Also lists the payments received (chatbot_api/utils/resellerBilling.js).
 */
export default function ResellerPaymentsPage() {
  const { user } = useAuth();
  const [gateway, setGateway] = useState(undefined);
  const [form, setForm] = useState({ mode: 'live', secretKey: '', publishableKey: '', webhookSecret: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [payments, setPayments] = useState(null);

  const apiBase = String(api.defaults.baseURL || '').replace(/\/+$/, '');
  const webhookUrl = `${/^https?:\/\//i.test(apiBase) ? apiBase : `${window.location.origin}${apiBase}`}/reseller-billing/stripe-webhook/${user?.agencyId}`;

  const load = () => {
    agencyGatewayAPI.getAll()
      .then((res) => {
        const gw = (res.data?.gateways || []).find((g) => g.provider === 'STRIPE') || null;
        setGateway(gw);
        if (gw) setForm((f) => ({ ...f, mode: gw.mode || 'live', publishableKey: gw.public_ref || '' }));
      })
      .catch(() => setGateway(null));
    resellerBillingAPI.payments().then((res) => setPayments(res.data?.payments || [])).catch(() => setPayments([]));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      await agencyGatewayAPI.save('STRIPE', form);
      notify.success('Stripe keys saved');
      setForm((f) => ({ ...f, secretKey: '', webhookSecret: '' }));
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await agencyGatewayAPI.test('STRIPE');
      notify.success(res.data?.message || 'Stripe answered — the keys work');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Stripe refused the keys');
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!(await showAlert.confirm('Remove your Stripe keys?', 'Your customers will not be able to pay online until you add them again.', 'Remove'))) return;
    try {
      await agencyGatewayAPI.remove('STRIPE');
      notify.success('Removed');
      setForm({ mode: 'live', secretKey: '', publishableKey: '', webhookSecret: '' });
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not remove');
    }
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const box = { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 };

  return (
    <AppLayout>
      <div style={{ padding: '14px 18px', maxWidth: 980 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><CreditCard size={20} /> Customer Payments</h2>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 16px' }}>
          Connect your own Stripe account so your customers can buy and renew the plans you create in Packages &amp; Modules. The money goes straight to you — the platform takes no fee. When a paid period ends without renewal, that customer's workspace becomes read-only.
        </p>

        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>Your Stripe account</strong>
            {gateway === undefined ? <Loader2 size={16} className="animate-spin" /> : gateway ? <span className="badge badge-success">Connected ({gateway.mode})</span> : <span className="badge badge-muted">Not connected</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Mode</label>
              <select className="form-input" value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
                <option value="live">Live (real payments)</option>
                <option value="test">Test (Stripe test keys)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Publishable key</label>
              <input className="form-input" value={form.publishableKey} onChange={(e) => set({ publishableKey: e.target.value })} placeholder="pk_live_…" />
            </div>
            <div className="form-group">
              <label className="form-label">Secret key {gateway && '(enter it again to change any setting)'}</label>
              <input className="form-input" type="password" autoComplete="off" value={form.secretKey} onChange={(e) => set({ secretKey: e.target.value })} placeholder="sk_live_… or rk_live_…" />
            </div>
            <div className="form-group">
              <label className="form-label">Webhook signing secret (recommended)</label>
              <input className="form-input" type="password" autoComplete="off" value={form.webhookSecret} onChange={(e) => set({ webhookSecret: e.target.value })} placeholder="whsec_…" />
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-base, #f8fafc)', borderRadius: 8, padding: 10, margin: '6px 0 12px', lineHeight: 1.55 }}>
            In Stripe → Developers → Webhooks, add an endpoint with this URL and the event <b>checkout.session.completed</b>, then paste its signing secret above. It confirms payments even when a customer closes the tab before returning.
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              <code style={{ fontSize: '0.74rem', wordBreak: 'break-all' }}>{webhookUrl}</code>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Copy webhook URL" onClick={() => { navigator.clipboard?.writeText(webhookUrl); notify.success('Copied'); }}><Copy size={13} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving || !form.secretKey.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save keys
            </button>
            {gateway && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={testing}>
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Test connection
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={remove}>Remove</button>
              </>
            )}
          </div>
        </div>

        <ResellerPaypalCard box={box} />

        <div style={box}>
          <strong>Payments received</strong>
          {payments === null ? (
            <div style={{ padding: 20, textAlign: 'center' }}><Loader2 size={18} className="animate-spin" /></div>
          ) : payments.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>No payments yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 4px' }}>Date</th><th style={{ padding: '6px 4px' }}>Via</th><th style={{ padding: '6px 4px' }}>Customer</th><th style={{ padding: '6px 4px' }}>Plan</th><th style={{ padding: '6px 4px' }}>Amount</th><th style={{ padding: '6px 4px' }}>Paid until</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px' }}>{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px 4px' }}>{p.provider === 'PAYPAL' ? 'PayPal' : 'Card'}</td>
                    <td style={{ padding: '8px 4px', fontWeight: 600 }}>{p.customer_name}</td>
                    <td style={{ padding: '8px 4px' }}>{p.package_name}</td>
                    <td style={{ padding: '8px 4px' }}>{p.currency} {p.amount.toFixed(2)}</td>
                    <td style={{ padding: '8px 4px', color: 'var(--text-muted)' }}>{p.period_end ? new Date(p.period_end).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
