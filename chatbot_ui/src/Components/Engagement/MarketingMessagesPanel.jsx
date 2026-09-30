import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Plus, Send, Trash2, Megaphone, KeyRound, AlertTriangle, X, BarChart3 } from 'lucide-react';
import { marketingMessagesAPI, labelAPI } from '../../services/api';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import { useAuth } from '../../Provider/AuthContext';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Bot Manager → Automation → Marketing Messages (Facebook Pages).
 * Meta's paid Marketing Message API for Messenger
 * (chatbot_api/utils/messengerMarketing.js): connect with Facebook Login for
 * Business (+ ad account to bill), subscribers who opted in, campaigns.
 */
const EMPTY = { name: '', message: { type: 'text', text: '', title: '', subtitle: '', imageUrl: '', linkUrl: '', buttons: [] }, labelIds: [], dailyBudget: '' };
const STATUS = { DRAFT: 'Draft', SENDING: 'Sending', SENT: 'Sent', FAILED: 'Failed' };

export default function MarketingMessagesPanel({ account }) {
  const { user } = useAuth();
  const isOwner = user?.role === 'RESELLER' || user?.role === 'ADMIN';
  const { fbReady } = useFacebookSDK('MESSENGER_INSTAGRAM');
  const [data, setData] = useState(null);
  const [adAccounts, setAdAccounts] = useState(null);
  const [busy, setBusy] = useState('');
  const [manual, setManual] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | campaign id
  const [form, setForm] = useState(EMPTY);
  const [labels, setLabels] = useState([]);
  const [insights, setInsights] = useState({}); // campaign id → Meta's numbers (GET /<campaign>/insights)

  const load = useCallback(() => {
    marketingMessagesAPI.get(account.id)
      .then((res) => setData(res.data))
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load Marketing Messages'));
  }, [account.id]);
  useEffect(() => { setData(null); load(); labelAPI.getAll().then((r) => setLabels(r.data?.labels || r.data || [])).catch(() => {}); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    try { return await fn(); } catch (err) { notify.error(err.response?.data?.message || 'Something went wrong'); return null; } finally { setBusy(''); }
  };

  const connectWithFacebook = () => {
    if (!window.FB || !data?.login?.configId) return;
    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) { notify.error('Facebook login was cancelled'); return; }
      run('connect', async () => {
        const res = await marketingMessagesAPI.connectCode(account.id, code);
        setAdAccounts(res.data.adAccounts || []);
        notify.success(res.data.message);
        load();
      });
    }, { config_id: data.login.configId, response_type: 'code', override_default_response_type: true });
  };

  const connectManual = () => run('connect', async () => {
    const res = await marketingMessagesAPI.connectManual(account.id, { token: manualToken.trim() });
    setAdAccounts(res.data.adAccounts || []);
    setManualToken('');
    setManual(false);
    load();
  });

  const chooseAdAccount = (id) => run('adacct', async () => {
    const res = await marketingMessagesAPI.setAdAccount(account.id, id);
    notify.success(res.data.message);
    setAdAccounts(null);
    load();
  });

  const openEditor = (c) => {
    if (!c) { setForm(EMPTY); setEditing('new'); return; }
    setForm({
      name: c.name,
      message: { ...EMPTY.message, ...c.message, buttons: c.message.buttons || [] },
      labelIds: c.audience?.labelIds || [],
      dailyBudget: c.dailyBudgetAmount ? String(c.dailyBudgetAmount) : '',
    });
    setEditing(c.id);
  };

  const loadInsights = (c) => run(`ins-${c.id}`, async () => {
    const res = await marketingMessagesAPI.insights(account.id, c.id);
    setInsights((m) => ({ ...m, [c.id]: res.data.insights }));
  });

  const saveCampaign = () => run('save', async () => {
    const body = { name: form.name, message: form.message, audience: { labelIds: form.labelIds }, dailyBudget: form.dailyBudget ? Number(form.dailyBudget) : null };
    if (editing === 'new') await marketingMessagesAPI.createCampaign(account.id, body);
    else await marketingMessagesAPI.updateCampaign(account.id, editing, body);
    notify.success('Campaign saved');
    setEditing(null);
    load();
  });

  const send = async (c) => {
    const aud = await run(`aud-${c.id}`, () => marketingMessagesAPI.audience(account.id, c.id));
    if (!aud) return;
    const { count, resting } = aud.data;
    if (!count) { notify.error('Nobody to send to — no active subscribers match this audience'); return; }
    const ok = await showAlert.confirm(
      'Send this paid campaign?',
      `${count} subscriber(s)${resting ? `, ${resting} of them got a marketing message in the last 12 hours and will be skipped` : ''}. Meta charges your ad account (${data.account?.adAccountName || data.account?.adAccountId}) for each delivered message, up to a daily budget of ${c.dailyBudgetAmount} ${data.account?.adAccountCurrency || ''}.`,
      'Send now'
    );
    if (!ok) return;
    await run(`send-${c.id}`, async () => {
      const res = await marketingMessagesAPI.send(account.id, c.id);
      notify.success(res.data.message);
      load();
      setTimeout(load, 5000);
    });
  };

  const del = async (c) => {
    if (!(await showAlert.confirm('Delete this draft?', '', 'Delete'))) return;
    run(`del-${c.id}`, async () => { await marketingMessagesAPI.deleteCampaign(account.id, c.id); load(); });
  };

  if (!data) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;

  const acc = data.account;
  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 };
  const currency = acc?.adAccountCurrency || '';
  const wholeUnits = Boolean(acc?.wholeUnitCurrency);
  const money = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: wholeUnits ? 0 : 2 })}${currency ? ` ${currency}` : ''}`);
  const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 10px', lineHeight: 1.5 };
  const m = form.message;
  const setMsg = (patch) => setForm((f) => ({ ...f, message: { ...f.message, ...patch } }));

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">Marketing Messages</h3>
        <p className="bm-card-sub">Paid promotional messages on Messenger to people who agreed to receive them — any time, beyond the 24-hour window. Meta bills your ad account per delivered message; each person gets at most one every 12 hours.</p>
      </div>

      <div className="bm-card-body">
      {/* ── Connection ── */}
      <div style={box}>
        <strong style={{ fontSize: '0.9rem' }}>Connection</strong>
        {acc?.adAccountId ? (
          <p style={hint}>
            Billed to <b>{acc.adAccountName || acc.adAccountId}</b> · {acc.tokenType === 'USER' ? `personal login${acc.tokenExpiresAt ? ` (expires ${new Date(acc.tokenExpiresAt).toLocaleDateString()})` : ''}` : 'business login (no expiry)'}
            {acc.status === 'ERROR' && <span style={{ color: 'var(--danger)', display: 'block' }}><AlertTriangle size={12} /> {acc.lastError}</span>}
          </p>
        ) : acc ? (
          <p style={hint}>Logged in — choose the ad account Meta should bill.</p>
        ) : (
          <p style={hint}>Not connected yet.</p>
        )}
        {isOwner && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.login.configId ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={!fbReady || busy === 'connect'} onClick={connectWithFacebook}>
                {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} {acc ? 'Reconnect with Facebook' : 'Connect with Facebook'}
              </button>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--warning)', display: 'flex', gap: 6, alignItems: 'flex-start', flexBasis: '100%', lineHeight: 1.45 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> The Meta app has no Marketing Messages login configuration yet — add it in Settings → Meta App Setup (Messenger / Instagram).
              </span>
            )}
            {acc && <button type="button" className="btn btn-secondary btn-sm" onClick={() => run('adlist', async () => { const r = await marketingMessagesAPI.adAccounts(account.id); setAdAccounts(r.data.adAccounts); })}>Change ad account</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual((v) => !v)}><KeyRound size={13} /> Use an access token</button>
          </div>
        )}
        {manual && isOwner && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input className="form-input" type="password" placeholder="System-user access token with paid_marketing_messages" value={manualToken} onChange={(e) => setManualToken(e.target.value)} />
            <button type="button" className="btn btn-primary btn-sm" disabled={!manualToken.trim() || busy === 'connect'} onClick={connectManual}>Save</button>
          </div>
        )}
        {adAccounts && (
          <div style={{ marginTop: 10 }}>
            {adAccounts.length === 0 ? <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>This login has no ad account — add one in Meta Business Settings and reconnect.</span> : (
              <select className="form-input" defaultValue="" onChange={(e) => e.target.value && chooseAdAccount(e.target.value)} disabled={busy === 'adacct'}>
                <option value="">Choose the ad account to bill…</option>
                {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id}{a.currency ? `, ${a.currency}` : ''})</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── Subscribers ── */}
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Subscribers: {data.subscribers.active}</strong>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy === 'sync'} onClick={() => run('sync', async () => { const r = await marketingMessagesAPI.syncSubscribers(account.id); notify.success(r.data.message); load(); })}>
            {busy === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync from Meta
          </button>
        </div>
        <p style={{ ...hint, marginBottom: 0 }}>
          People join by accepting an opt-in request (the "Marketing opt-in" step in a flow, or Inbox → subscriber → Ask to subscribe), by replying to a click-to-Messenger ad, or through Meta's own invites. {data.subscribers.stopped ? `${data.subscribers.stopped} stopped them. ` : ''}Sync pulls everyone Meta knows about.
        </p>
      </div>

      {/* ── Campaigns ── */}
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: '0.9rem' }}>Campaigns</strong>
          {!editing && <button type="button" className="btn btn-primary btn-sm" onClick={() => openEditor(null)}><Plus size={14} /> New campaign</button>}
        </div>

        {editing && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12, background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="form-input" placeholder="Campaign name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <select className="form-input" value={m.type} onChange={(e) => setMsg({ type: e.target.value })}>
              <option value="text">Text</option>
              <option value="button">Text with buttons</option>
              <option value="generic">Card (image, title, buttons)</option>
            </select>
            {m.type === 'generic' ? (
              <>
                <input className="form-input" maxLength={80} placeholder="Title" value={m.title} onChange={(e) => setMsg({ title: e.target.value })} />
                <input className="form-input" maxLength={80} placeholder="Subtitle (optional)" value={m.subtitle} onChange={(e) => setMsg({ subtitle: e.target.value })} />
                <input className="form-input" placeholder="Image link (https://…, optional)" value={m.imageUrl} onChange={(e) => setMsg({ imageUrl: e.target.value })} />
                <input className="form-input" placeholder="Link when the card is tapped (https://…, optional)" value={m.linkUrl} onChange={(e) => setMsg({ linkUrl: e.target.value })} />
              </>
            ) : (
              <>
                <textarea className="form-input" rows={4} maxLength={640} placeholder="Your message (up to 640 characters)" value={m.text} onChange={(e) => setMsg({ text: e.target.value })} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>{(m.text || '').length}/640</span>
              </>
            )}
            {m.type !== 'text' && (
              <div>
                {(m.buttons || []).map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <select className="form-input" style={{ width: 130 }} value={b.type || 'web_url'} onChange={(e) => setMsg({ buttons: m.buttons.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                      <option value="web_url">Open link</option>
                      <option value="postback">Reply to bot</option>
                    </select>
                    <input className="form-input" maxLength={20} placeholder="Button text" value={b.title || ''} onChange={(e) => setMsg({ buttons: m.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    {(b.type || 'web_url') === 'web_url' && (
                      <input className="form-input" placeholder="https://…" value={b.url || ''} onChange={(e) => setMsg({ buttons: m.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove button" onClick={() => setMsg({ buttons: m.buttons.filter((_, j) => j !== i) })}><X size={13} /></button>
                  </div>
                ))}
                {(m.buttons || []).length < 3 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMsg({ buttons: [...(m.buttons || []), { type: 'web_url', title: '', url: '' }] })}><Plus size={13} /> Button</button>}
              </div>
            )}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Audience</label>
              <select className="form-input" multiple style={{ minHeight: 70 }} value={form.labelIds.map(String)} onChange={(e) => setForm((f) => ({ ...f, labelIds: [...e.target.selectedOptions].map((o) => Number(o.value)) }))}>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No label chosen = every subscriber of this Page.</span>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Daily budget{currency ? ` (${currency})` : ''} *</label>
              <input className="form-input" type="number" min={wholeUnits ? 1 : 0.01} step={wholeUnits ? 1 : 0.01} placeholder={`e.g. ${wholeUnits ? '50000' : '10.00'}`} value={form.dailyBudget} onChange={(e) => setForm((f) => ({ ...f, dailyBudget: e.target.value }))} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Required by Meta. Caps what this campaign can spend per day — once it's reached, no more messages go out that day.{!currency ? " Uses your ad account's currency." : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'save'} onClick={saveCampaign}>{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : 'Save draft'}</button>
            </div>
          </div>
        )}

        {data.campaigns.length === 0 && !editing ? <p style={{ ...hint, margin: 0 }}>No campaigns yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.campaigns.map((c) => (
              <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{c.name} <span className="badge badge-muted" style={{ marginLeft: 6 }}>{STATUS[c.status] || c.status}</span></div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.preview}</div>
                    {c.status === 'DRAFT' && (
                      c.dailyBudgetAmount
                        ? <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Daily budget {money(c.dailyBudgetAmount)}</div>
                        : <div style={{ fontSize: '0.72rem', color: 'var(--warning)' }}><AlertTriangle size={11} /> Needs a daily budget — edit it before sending</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {['DRAFT', 'FAILED'].includes(c.status) && (
                      <button type="button" className="btn btn-primary btn-sm" disabled={!acc?.adAccountId || (c.status === 'DRAFT' && !c.dailyBudgetAmount) || busy.startsWith('send') || busy.startsWith('aud')} onClick={() => send(c)}>
                        {busy === `send-${c.id}` || busy === `aud-${c.id}` ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                      </button>
                    )}
                    {c.status === 'DRAFT' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditor(c)}>Edit</button>}
                    {c.hasMetaStats && (
                      <button type="button" className="btn btn-secondary btn-sm" title="Delivered, read, clicks and spend as Meta reports them" disabled={busy === `ins-${c.id}`} onClick={() => loadInsights(c)}>
                        {busy === `ins-${c.id}` ? <Loader2 size={13} className="animate-spin" /> : <BarChart3 size={13} />} Meta stats
                      </button>
                    )}
                    {c.status === 'DRAFT' && <button type="button" className="btn btn-ghost btn-sm" aria-label="Delete" onClick={() => del(c)}><Trash2 size={13} /></button>}
                  </div>
                </div>
                {c.status !== 'DRAFT' && (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.76rem', marginTop: 6 }}>
                    <span>Targeted <b>{c.total_targeted}</b></span>
                    <span>Sent <b>{c.sent_count}</b></span>
                    <span>Delivered <b>{c.delivered_count}</b></span>
                    <span>Read <b>{c.read_count}</b></span>
                    <span>Clicked <b>{c.click_count}</b></span>
                    {c.skipped_count > 0 && <span title="Got one in the last 12 hours, or wasn't available">Skipped <b>{c.skipped_count}</b></span>}
                    {c.failed_count > 0 && <span style={{ color: 'var(--danger)' }}>Failed <b>{c.failed_count}</b></span>}
                  </div>
                )}
                {insights[c.id] && (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.76rem', marginTop: 6, padding: '6px 8px', borderRadius: 8, background: 'var(--bg-hover)' }}>
                    <span style={{ fontWeight: 700 }}>Meta:</span>
                    <span>Delivered <b>{insights[c.id].delivered ?? '—'}</b></span>
                    <span>Read rate <b>{insights[c.id].readRate === null ? '—' : `${Math.round(insights[c.id].readRate * (insights[c.id].readRate <= 1 ? 100 : 1))}%`}</b></span>
                    <span>Clicks <b>{insights[c.id].clicks ?? '—'}</b></span>
                    <span>Spend <b>{money(insights[c.id].spend)}</b></span>
                    {insights[c.id].costPerDelivered !== null && <span>Per delivered <b>{money(insights[c.id].costPerDelivered)}</b></span>}
                  </div>
                )}
                {c.error_message && <div style={{ fontSize: '0.74rem', color: 'var(--danger)', marginTop: 4 }}>{c.error_message}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
