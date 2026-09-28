import { useEffect, useState } from 'react';
import { Loader2, Save, PlugZap } from 'lucide-react';
import { agencyGatewayAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Customer Payments → PayPal. The reseller's own PayPal REST app
 * (developer.paypal.com → Apps & Credentials); customers can then pay with
 * PayPal next to card (chatbot_api/utils/paypalClient.js). No webhook is
 * needed: the payment is captured when the customer comes back to the app.
 */
export default function ResellerPaypalCard({ box }) {
  const [gateway, setGateway] = useState(undefined);
  const [form, setForm] = useState({ mode: 'live', clientId: '', clientSecret: '' });
  const [busy, setBusy] = useState('');

  const load = () => agencyGatewayAPI.getAll()
    .then((res) => {
      const gw = (res.data?.gateways || []).find((g) => g.provider === 'PAYPAL') || null;
      setGateway(gw);
      if (gw) setForm((f) => ({ ...f, mode: gw.mode || 'live', clientId: gw.public_ref || '' }));
    })
    .catch(() => setGateway(null));
  useEffect(() => { load(); }, []);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) { notify.error(err.response?.data?.message || 'Something went wrong'); } finally { setBusy(''); }
  };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>Your PayPal account (optional)</strong>
        {gateway === undefined ? <Loader2 size={16} className="animate-spin" /> : gateway ? <span className="badge badge-success">Connected ({gateway.mode === 'test' ? 'sandbox' : 'live'})</span> : <span className="badge badge-muted">Not connected</span>}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        Lets customers pay with PayPal as well as by card. Create a REST app at developer.paypal.com → Apps &amp; Credentials and paste its client id and secret.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Mode</label>
          <select className="form-input" value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
            <option value="live">Live</option>
            <option value="test">Sandbox (testing)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Client ID</label>
          <input className="form-input" value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" />
        </div>
        <div className="form-group">
          <label className="form-label">Secret {gateway && '(enter it again to change any setting)'}</label>
          <input className="form-input" type="password" autoComplete="off" value={form.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'save' || !form.clientId.trim() || !form.clientSecret.trim()}
          onClick={() => run('save', async () => { await agencyGatewayAPI.save('PAYPAL', form); notify.success('PayPal saved'); set({ clientSecret: '' }); load(); })}>
          {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save PayPal
        </button>
        {gateway && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy === 'test'}
              onClick={() => run('test', async () => { const r = await agencyGatewayAPI.test('PAYPAL'); notify.success(r.data?.message || 'PayPal answered'); })}>
              {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Test connection
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', marginLeft: 'auto' }}
              onClick={async () => {
                if (!(await showAlert.confirm('Remove PayPal?', 'Customers will only be able to pay by card.', 'Remove'))) return;
                run('remove', async () => { await agencyGatewayAPI.remove('PAYPAL'); setForm({ mode: 'live', clientId: '', clientSecret: '' }); load(); });
              }}>
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
