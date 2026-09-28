import { useEffect, useState, useCallback } from 'react';
import { X, Tag, Loader2, CreditCard, CheckCircle2 } from 'lucide-react';
import { billingAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

const GATEWAY_INFO = {
  STRIPE: { label: 'Card (Stripe)', hint: 'International cards — USD, renews automatically' },
  SSLCOMMERZ: { label: 'SSLCommerz', hint: 'Cards, mobile banking — BDT, pay each period' },
  AAMARPAY: { label: 'aamarPay', hint: 'Cards, mobile banking — BDT, pay each period' },
  PORTWALLET: { label: 'PortWallet', hint: 'Cards, mobile banking — BDT, pay each period' },
};

const money = (n, cur = 'USD') => (cur === 'BDT' ? `৳${Number(n).toLocaleString()}` : `$${Number(n).toFixed(2)}`);

/**
 * Dashboard checkout for one package — buy, change plan or renew. Payment
 * method (only the gateways the Super Admin switched on), coupon code, and
 * the price after discounts (POST /billing/quote — the same calculation the
 * server charges with).
 */
export default function CheckoutDialog({ plan, onClose, onDone }) {
  const [gateways, setGateways] = useState(['STRIPE']);
  const [provider, setProvider] = useState('STRIPE');
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    billingAPI.getGateways().then((res) => setGateways(res.data?.gateways || ['STRIPE'])).catch(() => {});
  }, []);

  const loadQuote = useCallback(async (code) => {
    setQuoting(true);
    try {
      const res = await billingAPI.quote({ packageId: plan.id, couponCode: code || undefined });
      setQuote(res.data.quote);
      if (code && res.data.quote.couponError) notify.error(res.data.quote.couponError);
      setAppliedCoupon(code && !res.data.quote.couponError ? code : '');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not calculate the price');
    } finally {
      setQuoting(false);
    }
  }, [plan.id]);

  useEffect(() => { loadQuote(''); }, [loadQuote]);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await billingAPI.createCheckout({
        packageId: plan.id,
        provider,
        couponCode: appliedCoupon || undefined,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: window.location.href,
      });
      if (res.data?.url && /^https?:/.test(res.data.url)) {
        window.location.href = res.data.url;
        return;
      }
      notify.success(`${plan.name} is active`);
      onDone?.();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not start the payment');
    } finally {
      setPaying(false);
    }
  };

  const bdt = provider !== 'STRIPE';
  const total = quote ? (bdt ? quote.bdtAmount : quote.finalPrice) : null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100001 }}>
      <div className="modal" style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="modal-title" style={{ margin: 0 }}>{plan.name}</div>
          <button type="button" onClick={onClose} disabled={paying} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Pay with</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {gateways.map((g) => (
            <label key={g} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${provider === g ? 'var(--primary)' : 'var(--border)'}` }}>
              <input type="radio" checked={provider === g} onChange={() => setProvider(g)} />
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{GATEWAY_INFO[g]?.label || g}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{GATEWAY_INFO[g]?.hint}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Coupon code</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Tag size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input w-full" style={{ paddingLeft: 30, textTransform: 'uppercase' }} placeholder="Optional" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
          </div>
          <button type="button" className="btn btn-secondary" disabled={!coupon.trim() || quoting} onClick={() => loadQuote(coupon.trim())}>Apply</button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontSize: '0.84rem', marginBottom: 14 }}>
          {quoting || !quote ? (
            <div style={{ textAlign: 'center', padding: 6 }}><Loader2 size={16} className="animate-spin" /></div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{plan.name}{plan.billingCycle || plan.billing_cycle ? ` · ${plan.billingCycle || plan.billing_cycle}` : ''}</span><span>{money(quote.basePrice)}</span></div>
              {quote.lines.map((l) => (
                <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}><span>{l.label}</span><span>−{money(Math.abs(l.amount))}</span></div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <span>Total</span><span>{money(total, bdt ? 'BDT' : 'USD')}</span>
              </div>
              {appliedCoupon && <div style={{ fontSize: '0.74rem', color: '#16a34a', marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={12} /> Coupon {appliedCoupon.toUpperCase()} applied</div>}
              {quote.recurring && provider === 'STRIPE' && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>The discount repeats on every renewal.</div>}
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={paying}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={pay} disabled={paying || quoting || !quote}>
            {paying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            {quote && quote.finalPrice <= 0 ? ' Activate' : ` Pay ${total != null ? money(total, bdt ? 'BDT' : 'USD') : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
