import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { platformPaymentGatewayAPI, platformSettingsAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { CreditCard, CheckCircle2, Loader2, Trash2 } from 'lucide-react';

const PROVIDERS = [
  {
    id: 'STRIPE',
    label: 'Stripe',
    hint: 'International cards — USD',
    fields: [
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true },
      { key: 'publishableKey', label: 'Publishable Key', type: 'text' },
      { key: 'webhookSecret', label: 'Webhook Signing Secret', type: 'password' },
    ],
  },
  {
    id: 'SSLCOMMERZ',
    label: 'SSLCommerz',
    hint: 'Bangladesh — cards, mobile banking',
    fields: [
      { key: 'storeId', label: 'Store ID', type: 'text', required: true },
      { key: 'storePassword', label: 'Store Password', type: 'password', required: true },
    ],
  },
  {
    id: 'AAMARPAY',
    label: 'AamarPay',
    hint: 'Bangladesh — cards, mobile banking',
    fields: [
      { key: 'storeId', label: 'Store ID', type: 'text', required: true },
      { key: 'signatureKey', label: 'Signature Key', type: 'password', required: true },
    ],
  },
  {
    id: 'PORTWALLET',
    label: 'PortWallet',
    hint: 'Bangladesh — cards, mobile banking',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    ],
  },
];

function ProviderCard({ provider, saved, onSave, onToggle, onRemove }) {
  const [mode, setMode] = useState(saved?.mode || 'live');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!saved);

  const handleSave = async () => {
    const missing = provider.fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length) {
      notify.error(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await onSave(provider.id, { mode, ...values });
      setEditing(false);
      setValues({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CreditCard size={17} color="#64748b" />
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{provider.label}</div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{provider.hint}</div>
          </div>
        </div>
        {saved && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: saved.is_active ? '#16a34a' : '#94a3b8' }}>
            <CheckCircle2 size={13} /> {saved.is_active ? 'Active' : 'Disabled'} ({saved.mode})
          </span>
        )}
      </div>

      {saved && !editing ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Update credentials</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onToggle(provider.id, !saved.is_active)}>
            {saved.is_active ? 'Disable' : 'Enable'}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(provider.id)}><Trash2 size={12} /></button>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>Mode</label>
            <select className="form-input" value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: 140, height: 34, fontSize: '0.82rem' }}>
              <option value="live">Live</option>
              <option value="test">Test / Sandbox</option>
            </select>
          </div>
          {provider.fields.map((f) => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                {f.label}{f.required && <span style={{ color: '#dc2626' }}> *</span>}
              </label>
              <input
                type={f.type}
                className="form-input w-full"
                value={values[f.key] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={saved ? 'Leave blank to keep unchanged' : ''}
                style={{ height: 34, fontSize: '0.82rem' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {saved && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save credentials'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentGatewaysPage() {
  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState('');
  const [rateSaving, setRateSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      platformPaymentGatewayAPI.getAll(),
      platformSettingsAPI.getAll(),
    ]).then(([gwRes, settingsRes]) => {
      setGateways(gwRes.data?.gateways || []);
      const rateSetting = settingsRes.data?.settings?.usd_to_bdt_rate;
      setRate(rateSetting?.rate != null ? String(rateSetting.rate) : '');
    }).catch(() => notify.error('Failed to load payment gateways')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const savedByProvider = Object.fromEntries(gateways.map((g) => [g.provider, g]));

  const handleSave = async (provider, data) => {
    try {
      await platformPaymentGatewayAPI.save(provider, data);
      notify.success(`${provider} credentials saved`);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to save credentials');
      throw err;
    }
  };

  const handleToggle = async (provider, isActive) => {
    try {
      await platformPaymentGatewayAPI.toggle(provider, isActive);
      notify.success(`${provider} ${isActive ? 'enabled' : 'disabled'}`);
      load();
    } catch {
      notify.error('Failed to update gateway');
    }
  };

  const handleRemove = async (provider) => {
    const ok = await showAlert.confirm({ title: `Remove ${provider}?`, text: 'Stored credentials will be permanently deleted.', confirmButtonText: 'Yes, Remove' });
    if (!ok) return;
    try {
      await platformPaymentGatewayAPI.remove(provider);
      notify.success(`${provider} removed`);
      load();
    } catch {
      notify.error('Failed to remove gateway');
    }
  };

  const saveRate = async () => {
    const num = Number(rate);
    if (!num || num <= 0) { notify.error('Enter a valid exchange rate'); return; }
    setRateSaving(true);
    try {
      await platformSettingsAPI.update('usd_to_bdt_rate', { rate: num, updatedAt: new Date().toISOString() });
      notify.success('Exchange rate updated');
    } catch {
      notify.error('Failed to update exchange rate');
    } finally {
      setRateSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">Payment Gateways</h1>
        <p className="page-subtitle">Credentials used to charge customers for packages on the public Pricing page.</p>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>USD → BDT Exchange Rate</div>
              <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '0 0 10px' }}>
                Used to convert a package's USD price to BDT for SSLCommerz, AamarPay, and PortWallet checkouts.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" step="0.01" className="form-input" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 140, height: 34, fontSize: '0.82rem' }} />
                <button type="button" className="btn btn-primary btn-sm" onClick={saveRate} disabled={rateSaving}>
                  {rateSaving ? <Loader2 size={13} className="animate-spin" /> : 'Save Rate'}
                </button>
              </div>
            </div>

            {PROVIDERS.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                saved={savedByProvider[p.id]}
                onSave={handleSave}
                onToggle={handleToggle}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
