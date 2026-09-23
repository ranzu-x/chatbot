import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router';
import './landing.css';
import { MessageSquare, ArrowLeft, Lock, CreditCard, CheckCircle2, Loader2 } from 'lucide-react';
import { billingAPI } from '../../services/api';
import { getStoredAffiliateCode } from '../../utils/affiliateTracking';

const PROVIDERS = [
  { id: 'STRIPE', label: 'Card (Stripe)', hint: 'International cards — USD', currency: 'USD' },
  { id: 'SSLCOMMERZ', label: 'SSLCommerz', hint: 'Cards, mobile banking — BDT', currency: 'BDT' },
  { id: 'AAMARPAY', label: 'AamarPay', hint: 'Cards, mobile banking — BDT', currency: 'BDT' },
  { id: 'PORTWALLET', label: 'PortWallet', hint: 'Cards, mobile banking — BDT', currency: 'BDT' },
];

export default function GuestCheckoutPage() {
  const [searchParams] = useSearchParams();
  const packageId = searchParams.get('package');

  const [loadingPlans, setLoadingPlans] = useState(true);
  const [pkg, setPkg] = useState(null);

  const [form, setForm] = useState({ fullName: '', email: '', businessName: '', password: '' });
  const [provider, setProvider] = useState('STRIPE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    billingAPI.getPlans().then((res) => {
      const list = res.data?.plans || [];
      const found = list.find((p) => String(p.id) === String(packageId));
      setPkg(found || null);
    }).catch(() => {}).finally(() => setLoadingPlans(false));
  }, [packageId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pkg) { setError('No package selected.'); return; }
    if (!form.fullName.trim() || !form.email.trim() || !form.password) {
      setError('Please fill in your name, email, and password.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await billingAPI.guestCheckout({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        businessName: form.businessName.trim() || undefined,
        password: form.password,
        packageId: pkg.id,
        provider,
        affiliateCode: getStoredAffiliateCode() || undefined,
      });
      if (res.data?.redirectUrl) {
        window.location.href = res.data.redirectUrl;
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong starting checkout. Please try again.');
      setSubmitting(false);
    }
  };

  const activeProvider = PROVIDERS.find((p) => p.id === provider);
  const displayPrice = pkg
    ? (activeProvider?.currency === 'BDT'
        ? null // exact converted amount is computed server-side at submit time
        : `$${Number(pkg.price).toFixed(2)}`)
    : null;

  return (
    <div className="lp-wrapper">
      <style>{`
        .gc-shell { max-width: 980px; margin: 0 auto; padding: 48px 24px 80px; display: grid; grid-template-columns: 1fr 360px; gap: 32px; align-items: start; }
        @media (max-width: 820px) { .gc-shell { grid-template-columns: 1fr; } }
        .gc-card { background: #fff; border: 1px solid var(--lp-border); border-radius: 16px; padding: 28px; box-shadow: 0 2px 12px rgba(15,23,42,0.04); }
        .gc-label { display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 6px; }
        .gc-input { width: 100%; height: 42px; padding: 0 14px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.9rem; box-sizing: border-box; }
        .gc-input:focus { outline: none; border-color: var(--lp-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
        .gc-field { margin-bottom: 16px; }
        .gc-provider { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; border: 1.5px solid #e2e8f0; cursor: pointer; margin-bottom: 8px; }
        .gc-provider.active { border-color: var(--lp-primary); background: rgba(99,102,241,0.05); }
        .gc-summary-row { display: flex; justify-content: space-between; font-size: 0.86rem; color: #475569; padding: 6px 0; }
        .gc-summary-total { display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 800; color: #0f172a; padding-top: 12px; margin-top: 8px; border-top: 1px solid #e2e8f0; }
      `}</style>

      <nav className="lp-navbar">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link to="/" className="lp-logo">
              <div className="lp-logo-icon"><MessageSquare size={20} /></div>
              <span>Nexa AI Chat</span>
            </Link>
            <div className="lp-nav-actions">
              <Link to="/pricing" className="lp-btn-secondary" style={{ gap: '6px' }}>
                <ArrowLeft size={16} /> Back to Pricing
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="gc-shell">
        {/* Left: form */}
        <div className="gc-card">
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Create your account</h1>
          <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '0 0 24px' }}>
            Enter your details and pay — your workspace is created automatically the moment payment succeeds.
          </p>

          {loadingPlans ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}><Loader2 size={20} className="animate-spin" /></div>
          ) : !pkg ? (
            <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: '0.86rem' }}>
              We couldn't find that package. <Link to="/pricing">Go back to Pricing</Link> and pick a plan.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="gc-field">
                <label className="gc-label">Full Name *</label>
                <input className="gc-input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Jane Doe" required />
              </div>
              <div className="gc-field">
                <label className="gc-label">Email *</label>
                <input className="gc-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@company.com" required />
              </div>
              <div className="gc-field">
                <label className="gc-label">Business Name</label>
                <input className="gc-input" value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} placeholder="Your Company Ltd." />
              </div>
              <div className="gc-field">
                <label className="gc-label">Password *</label>
                <input className="gc-input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 6 characters" required />
              </div>

              <label className="gc-label" style={{ marginTop: 20 }}>Payment Method</label>
              {PROVIDERS.map((p) => (
                <div key={p.id} className={`gc-provider ${provider === p.id ? 'active' : ''}`} onClick={() => setProvider(p.id)}>
                  <input type="radio" name="provider" checked={provider === p.id} onChange={() => setProvider(p.id)} />
                  <CreditCard size={16} color="#64748b" />
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>{p.label}</div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{p.hint}</div>
                  </div>
                </div>
              ))}

              {error && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="lp-btn-primary" disabled={submitting} style={{ width: '100%', marginTop: 20, justifyContent: 'center' }}>
                {submitting ? <><Loader2 size={16} className="animate-spin" /> Starting checkout…</> : <><Lock size={16} /> Pay & Create Account</>}
              </button>
              <p style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', marginTop: 10 }}>
                By continuing you agree to our <Link to="/terms-of-service">Terms</Link> and <Link to="/privacy-policy">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>

        {/* Right: order summary */}
        <div className="gc-card" style={{ position: 'sticky', top: 100 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>Order Summary</h3>
          {pkg ? (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{pkg.name}</div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 14px' }}>{pkg.description}</p>
              <div className="gc-summary-row"><span>Billing cycle</span><span style={{ textTransform: 'capitalize' }}>{pkg.billing_cycle}</span></div>
              <div className="gc-summary-total">
                <span>Total</span>
                <span>{displayPrice || `${Number(pkg.price).toFixed(2)} USD equiv.`}</span>
              </div>
              {activeProvider?.currency === 'BDT' && (
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 6 }}>
                  Charged in BDT at checkout using the current exchange rate.
                </p>
              )}
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(pkg.enabledModules || []).slice(0, 6).map((m) => (
                  <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#334155' }}>
                    <CheckCircle2 size={14} color="#16a34a" /> {m.displayName}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No package selected.</p>
          )}
        </div>
      </div>
    </div>
  );
}
