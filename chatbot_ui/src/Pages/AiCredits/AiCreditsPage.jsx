import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Sparkles, Package, ShoppingCart, Activity, Wallet, Loader2, Infinity as InfinityIcon, History, Receipt, AlertTriangle, Clock } from 'lucide-react';
import AppLayout from '../../Layout/AppLayout';
import useUrlState from '../../hooks/useUrlState';
import { aiCreditAPI } from '../../services/api';
import { toast } from '../../lib/alerts';
import { CreditStat, Tabs, Pager, EmptyRow, Amount } from './AiCreditsParts';
import { featureLabel, transactionLabel, BUCKET_LABELS, fmtCredits, fmtDate, fmtMoney } from './aiCreditLabels';

/**
 * AI Credits for the signed-in workspace (chatbot_api/routes/aiCredits.js).
 * Plan credits (monthly, from the package) and purchased credits (never
 * expire) are shown separately; "Available" is their sum. Owners of an End
 * User or Reseller workspace can buy add-ons; credits are only added once the
 * server has verified the payment (the return here just asks it to check).
 */
const errMsg = (err, fallback) => err?.response?.data?.message || fallback;
const GATEWAY_LABELS = { STRIPE: 'Card (Stripe)', SSLCOMMERZ: 'SSLCommerz', AAMARPAY: 'aamarPay', PORTWALLET: 'PortWallet' };

function AddonCard({ addon, onBuy, busy }) {
  const [gateway, setGateway] = useState(addon.gateways?.[0] || 'STRIPE');
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="ai-addon">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-primary)', minWidth: 0 }}>{addon.name}</div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmtMoney(addon.price, addon.currency)}</div>
      </div>
      <div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>+{fmtCredits(addon.credits)} <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>AI credits</span></div>
        <span className="badge badge-success" style={{ marginTop: 6 }}><InfinityIcon size={11} /> Never expires</span>
      </div>
      {addon.description && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{addon.description}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', alignItems: 'center' }}>
        {addon.gateways?.length > 1 && (
          <select className="form-input" value={gateway} onChange={(e) => setGateway(e.target.value)} aria-label="Payment method" style={{ flex: 1 }}>
            {addon.gateways.map((g) => <option key={g} value={g}>{GATEWAY_LABELS[g] || g}</option>)}
          </select>
        )}
        <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => onBuy(addon, gateway)}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />} Buy
        </button>
      </div>
    </div>
  );
}

function UsageTab() {
  const [state, setState] = useState({ page: 1, data: null });
  useEffect(() => {
    let alive = true;
    aiCreditAPI.usage({ page: state.page, pageSize: 20 })
      .then((r) => alive && setState((s) => ({ ...s, data: r.data })))
      .catch((err) => toast.error(errMsg(err, 'Could not load usage')));
    return () => { alive = false; };
  }, [state.page]);
  const d = state.data;
  return (
    <div className="table-wrapper">
      <table>
        <thead><tr><th>Date</th><th>Feature</th><th>Bot / Agent</th><th>Model</th><th style={{ textAlign: 'right' }}>Tokens (in / out)</th><th style={{ textAlign: 'right' }}>Credits</th></tr></thead>
        <tbody>
          {!d ? <EmptyRow cols={6} text="Loading…" /> : d.usage.length === 0 ? <EmptyRow cols={6} text="No AI usage yet." /> : d.usage.map((u) => (
            <tr key={u.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
              <td>{featureLabel(u.feature)}{u.user_name ? <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{u.user_name}</div> : null}</td>
              <td>{u.bot_name || '—'}{u.agent_name ? <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{u.agent_name}</div> : null}</td>
              <td style={{ fontSize: '0.78rem' }}>{u.model || '—'}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} title={u.estimated ? 'Estimated — the provider returned no token counts' : undefined}>
                {u.input_tokens === null ? '—' : fmtCredits(u.input_tokens)} / {u.output_tokens === null ? '—' : fmtCredits(u.output_tokens)}{u.estimated ? ' ≈' : ''}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>
                {fmtCredits(u.credits)}
                {Number(u.credits_purchased) > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>{fmtCredits(u.credits_purchased)} purchased</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d && <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(page) => setState((s) => ({ ...s, page }))} />}
    </div>
  );
}

function HistoryTab() {
  const [state, setState] = useState({ page: 1, data: null });
  useEffect(() => {
    let alive = true;
    aiCreditAPI.transactions({ page: state.page, pageSize: 20 })
      .then((r) => alive && setState((s) => ({ ...s, data: r.data })))
      .catch((err) => toast.error(errMsg(err, 'Could not load credit history')));
    return () => { alive = false; };
  }, [state.page]);
  const d = state.data;
  return (
    <div className="table-wrapper">
      <table>
        <thead><tr><th>Date</th><th>What</th><th>Credits from</th><th style={{ textAlign: 'right' }}>Change</th><th style={{ textAlign: 'right' }}>Balance after</th></tr></thead>
        <tbody>
          {!d ? <EmptyRow cols={5} text="Loading…" /> : d.transactions.length === 0 ? <EmptyRow cols={5} text="Nothing yet." /> : d.transactions.map((t) => {
            const meta = typeof t.metadata === 'string' ? JSON.parse(t.metadata || '{}') : (t.metadata || {});
            return (
              <tr key={t.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                <td>
                  {transactionLabel(t.type)}
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    {t.type === 'AI_USAGE' ? featureLabel(meta.feature) : meta.addonName || meta.packageName || meta.note || (meta.unlimited ? 'Unlimited plan' : '')}
                  </div>
                </td>
                <td><span className={`badge ${t.bucket === 'PURCHASED' ? 'badge-success' : 'badge-muted'}`}>{BUCKET_LABELS[t.bucket] || t.bucket}</span></td>
                <td style={{ textAlign: 'right' }}>{meta.unlimited ? 'Unlimited' : <Amount value={t.amount} />}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{t.balance_after === null ? '—' : fmtCredits(t.balance_after)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {d && <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(page) => setState((s) => ({ ...s, page }))} />}
    </div>
  );
}

function PurchasesTab() {
  const [state, setState] = useState({ page: 1, data: null });
  useEffect(() => {
    let alive = true;
    aiCreditAPI.purchases({ page: state.page, pageSize: 20 })
      .then((r) => alive && setState((s) => ({ ...s, data: r.data })))
      .catch((err) => toast.error(errMsg(err, 'Could not load purchases')));
    return () => { alive = false; };
  }, [state.page]);
  const d = state.data;
  const statusBadge = { PAID: 'badge-success', PENDING: 'badge-warning', FAILED: 'badge-danger', REFUNDED: 'badge-muted' };
  return (
    <div className="table-wrapper">
      <table>
        <thead><tr><th>Date</th><th>Pack</th><th style={{ textAlign: 'right' }}>Credits</th><th style={{ textAlign: 'right' }}>Price</th><th>Paid with</th><th>Status</th></tr></thead>
        <tbody>
          {!d ? <EmptyRow cols={6} text="Loading…" /> : d.purchases.length === 0 ? <EmptyRow cols={6} text="No purchases yet." /> : d.purchases.map((p) => (
            <tr key={p.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.paid_at || p.created_at)}</td>
              <td>{p.addon_name}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>+{fmtCredits(p.credits)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(p.charged_amount ?? p.price, p.charged_currency || p.currency)}</td>
              <td>{GATEWAY_LABELS[p.provider] || (p.provider === 'SIMULATED' ? 'Test mode' : p.provider)}</td>
              <td><span className={`badge ${statusBadge[p.status] || 'badge-muted'}`}>{p.status === 'PENDING' ? 'Awaiting payment' : p.status.charAt(0) + p.status.slice(1).toLowerCase()}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {d && <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(page) => setState((s) => ({ ...s, page }))} />}
    </div>
  );
}

export default function AiCreditsPage() {
  const [data, setData] = useState(null);
  const [buying, setBuying] = useState(null);
  const [tab, setTab] = useUrlState('view', 'usage', { allowed: ['usage', 'history', 'purchases'] });
  const [params, setParams] = useSearchParams();
  const handledReturn = useRef(false);

  const load = useCallback(() => {
    aiCreditAPI.summary().then((r) => setData(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load AI credits')));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Back from a payment page: ask the server to verify it (never trusted from the URL).
  useEffect(() => {
    if (handledReturn.current) return;
    const purchaseId = params.get('ai_purchase');
    const payment = params.get('payment');
    const cancelled = params.get('ai_purchase_cancelled');
    if (!purchaseId && !payment && !cancelled) return;
    handledReturn.current = true;
    const clear = () => {
      const next = new URLSearchParams(params);
      ['ai_purchase', 'session_id', 'status', 'simulated', 'payment', 'ai_purchase_cancelled'].forEach((k) => next.delete(k));
      setParams(next, { replace: true });
    };
    if (cancelled || payment === 'cancel') { toast.info('Payment cancelled — nothing was charged.'); clear(); return; }
    if (payment === 'fail') { toast.error('The payment did not go through.'); clear(); return; }
    if (payment === 'success') { toast.info('Payment received — your credits appear as soon as the gateway confirms it.'); clear(); setTimeout(load, 4000); return; }
    const id = toast.loading('Confirming your payment…');
    aiCreditAPI.confirm(purchaseId, params.get('session_id') || undefined)
      .then((r) => {
        if (r.data.status === 'PAID') toast.success('AI credits added', { id, description: 'Purchased credits never expire.' });
        else toast.info('Payment is still being confirmed', { id, description: 'Your credits appear as soon as it clears.' });
      })
      .catch((err) => toast.error(errMsg(err, 'Could not confirm the payment'), { id }))
      .finally(() => { clear(); load(); });
  }, [params, setParams, load]);

  const buy = async (addon, gateway) => {
    setBuying(addon.id);
    try {
      const r = await aiCreditAPI.checkout(addon.id, gateway);
      window.location.assign(r.data.url);
    } catch (err) {
      toast.error(errMsg(err, 'Could not start the payment'));
      setBuying(null);
    }
  };

  const s = data?.summary;
  const low = s && !s.unlimitedPackage && s.available !== null && s.packageAllowance !== null && s.available < Math.max(1000, (s.packageAllowance || 0) * 0.1);

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">AI Credits</h1>
        <p className="page-subtitle">AI replies, rewrites, suggestions, summaries, translation and transcription all use AI credits.</p>
      </div>
      <div className="page-body">
        {!s ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}><Loader2 size={18} className="animate-spin" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!s.aiAvailable && (
              <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.35)', color: 'var(--danger)', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} /> AI is temporarily unavailable on this platform. Please contact support.
              </div>
            )}
            {low && (
              <div className="card" style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: 'var(--warning)', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} /> You're running low on AI credits — when they run out, AI replies stop until your plan renews{data.canBuy ? ' or you buy more below' : ''}.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              <CreditStat
                icon={Package}
                label="Plan credits"
                value={s.unlimitedPackage ? 'Unlimited' : fmtCredits(s.packageRemaining)}
                hint={s.unlimitedPackage ? `${s.packageName || 'Your plan'} — no monthly limit` : `of ${fmtCredits(s.packageAllowance)} this month · renew ${fmtDate(s.periodEnd).split(',')[0]}`}
              />
              <CreditStat icon={Sparkles} tone="success" label="Purchased credits" value={fmtCredits(s.purchasedBalance)} hint="Never expire — kept across renewals and plan changes" />
              <CreditStat icon={Activity} tone="muted" label="Used this month" value={fmtCredits(s.usedThisPeriod)} hint={`${fmtCredits(s.lifetimeUsed)} in total`} />
              <CreditStat
                icon={Wallet}
                tone={low ? 'warning' : 'primary'}
                label="Available"
                value={s.unlimitedPackage ? 'Unlimited' : fmtCredits(s.available)}
                hint={s.unlimitedPackage ? 'Plan credits are used first; purchased credits are kept' : 'Plan credits are used first, then purchased ones'}
              />
            </div>

            {data.canBuy ? (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)' }}>Buy more AI credits</h2>
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>One-time payment. Purchased credits never expire and are only used once your plan's credits for the month run out.</p>
                {data.addons.length === 0 ? (
                  <div className="card" style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No credit packs are on sale right now.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {data.addons.map((a) => <AddonCard key={a.id} addon={a} busy={buying === a.id} onBuy={buy} />)}
                  </div>
                )}
              </div>
            ) : s.accountType === 'RESELLER_CUSTOMER' ? (
              <div className="card" style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Clock size={15} /> Need more AI credits? Contact your service provider.
              </div>
            ) : null}

            <div>
              <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                  { key: 'usage', label: 'Usage', icon: Activity },
                  { key: 'history', label: 'Credit history', icon: History },
                  { key: 'purchases', label: 'Purchases', icon: Receipt },
                ]}
              />
              {tab === 'usage' && <UsageTab />}
              {tab === 'history' && <HistoryTab />}
              {tab === 'purchases' && <PurchasesTab />}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
