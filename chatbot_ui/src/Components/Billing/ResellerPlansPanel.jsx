import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, CreditCard, AlertCircle } from 'lucide-react';
import { resellerBillingAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { notify } from '../../utils/alerts';

/**
 * My Account → Billing for a reseller's customer (RESELLER_CUSTOMER): the
 * plans its reseller offers, paid to the reseller's own Stripe account
 * (chatbot_api/utils/resellerBilling.js). One payment = one billing cycle.
 */
const CYCLE = { monthly: '/ month', yearly: '/ year', lifetime: 'one time', free: '' };

export default function ResellerPlansPanel() {
  const { refreshUser, refreshEntitlements } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => resellerBillingAPI.get()
    .then((res) => setData(res.data))
    .catch((err) => notify.error(err.response?.data?.message || 'Could not load your plans'));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('reseller_session');
    // PayPal returns with ?reseller_paypal=1&token=<order id>&PayerID=… — capture it now.
    const paypalOrder = params.get('reseller_paypal') ? params.get('token') : null;
    if (sessionId || paypalOrder) {
      (paypalOrder ? resellerBillingAPI.confirmPaypal(paypalOrder) : resellerBillingAPI.confirm(sessionId))
        .then((res) => { notify.success(res.data?.message || 'Payment received'); refreshUser?.(); refreshEntitlements?.(); })
        .catch((err) => notify.error(err.response?.data?.message || "We couldn't confirm the payment yet — refresh in a minute"))
        .finally(() => {
          ['reseller_session', 'reseller_paypal', 'token', 'PayerID'].forEach((k) => params.delete(k));
          const q = params.toString();
          window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
          load();
        });
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = async (plan, provider = 'STRIPE') => {
    setBusy(`${plan.id}-${provider}`);
    try {
      const res = await resellerBillingAPI.checkout(plan.id, provider);
      window.location.href = res.data.url;
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not start the payment');
      setBusy(null);
    }
  };

  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div>;
  const current = data.current;
  const ended = current?.periodEnd && new Date(current.periodEnd) <= new Date();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>YOUR PLAN{data.providerName ? ` · from ${data.providerName}` : ''}</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 4 }}>{current?.packageName || 'No plan yet'}</div>
        {current?.periodEnd && (
          <div style={{ fontSize: '0.82rem', marginTop: 4, color: ended ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {ended ? 'Ended on ' : 'Paid until '}{new Date(current.periodEnd).toLocaleDateString()}
            {ended && ' — your workspace is read-only until you renew.'}
          </div>
        )}
      </div>

      {!data.canPayOnline && (
        <div className="card" style={{ padding: 14, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem' }}>
          <AlertCircle size={16} color="var(--warning)" /> Online payment isn't set up by {data.providerName || 'your provider'} yet — contact them to change or renew your plan.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {data.plans.map((plan) => {
          const isCurrent = current && Number(current.packageId) === Number(plan.id);
          const paid = Number(plan.price) > 0 && plan.billing_cycle !== 'free';
          return (
            <div key={plan.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, border: isCurrent ? '2px solid var(--primary)' : undefined }}>
              <div style={{ fontWeight: 800 }}>{plan.name}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>
                {paid ? `${plan.currency} ${Number(plan.price).toFixed(2)}` : 'Free'} <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{paid ? CYCLE[plan.billing_cycle] || '' : ''}</span>
              </div>
              {plan.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{plan.description}</div>}
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {plan.max_bot_accounts != null && <li>{plan.max_bot_accounts} bot accounts</li>}
                {plan.max_subscribers != null && <li>{Number(plan.max_subscribers).toLocaleString()} subscribers</li>}
                {plan.max_team_members != null && <li>{plan.max_team_members} team members</li>}
                {plan.max_monthly_messages != null && <li>{Number(plan.max_monthly_messages).toLocaleString()} messages / month</li>}
              </ul>
              <div style={{ marginTop: 'auto' }}>
                {isCurrent && !paid ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={14} /> Current plan</span>
                ) : paid && data.canPayOnline ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(data.paymentProviders || ['STRIPE']).includes('STRIPE') && (
                      <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => pay(plan, 'STRIPE')} disabled={busy !== null}>
                        {busy === `${plan.id}-STRIPE` ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} {isCurrent ? 'Renew' : 'Choose'} — card
                      </button>
                    )}
                    {(data.paymentProviders || []).includes('PAYPAL') && (
                      <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => pay(plan, 'PAYPAL')} disabled={busy !== null}>
                        {busy === `${plan.id}-PAYPAL` ? <Loader2 size={14} className="animate-spin" /> : null} {isCurrent ? 'Renew' : 'Choose'} — PayPal
                      </button>
                    )}
                  </div>
                ) : isCurrent ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={14} /> Current plan</span>
                ) : null}
              </div>
            </div>
          );
        })}
        {data.plans.length === 0 && <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No plans are offered yet.</div>}
      </div>
    </div>
  );
}
