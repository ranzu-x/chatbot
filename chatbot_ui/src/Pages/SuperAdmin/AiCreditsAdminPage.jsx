import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database, Plus, Loader2, Save, Trash2, Pencil, Sparkles, Activity, Package, Users, Receipt, Settings, ListOrdered,
  Search, AlertTriangle, Infinity as InfinityIcon, Wallet, Undo2, X,
} from 'lucide-react';
import AppLayout from '../../Layout/AppLayout';
import useUrlState from '../../hooks/useUrlState';
import { adminAiCreditAPI } from '../../services/api';
import { alert, toast } from '../../lib/alerts';
import { CreditStat, Tabs, Pager, EmptyRow, Amount } from '../AiCredits/AiCreditsParts';
import { featureLabel, transactionLabel, BUCKET_LABELS, fmtCredits, fmtDate, fmtMoney } from '../AiCredits/aiCreditLabels';

/**
 * Super Admin → AI Credits (chatbot_api/routes/adminAiCredits.js).
 * Platform pool (the platform's AI resource — AI stops for everyone at 0),
 * add-on catalogue (credits never expire), usage / ledger / purchases with
 * server-side filters and paging, per-account adjustments, credit rates.
 */
const errMsg = (err, fallback) => err?.response?.data?.message || fallback;
// Local calendar dates (toISOString would give UTC's date — a day off near midnight).
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDay(new Date());
const daysAgo = (n) => localDay(new Date(Date.now() - n * 86400000));
const small = { fontSize: '0.72rem', color: 'var(--text-tertiary)' };
const label = { display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 };

function RangePicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="date" className="form-input" style={{ width: 150 }} value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From" />
      <span style={small}>to</span>
      <input type="date" className="form-input" style={{ width: 150 }} value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To" />
    </div>
  );
}

function BreakdownTable({ title, rows, nameKey = 'name', extra }) {
  return (
    <div className="table-wrapper">
      <div style={{ padding: '12px 16px', fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{title}</div>
      <table>
        <thead><tr><th>Name</th>{extra && <th>{extra.label}</th>}<th style={{ textAlign: 'right' }}>Calls</th><th style={{ textAlign: 'right' }}>Credits</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={extra ? 4 : 3} text="No usage in this period." /> : rows.map((r, i) => (
            <tr key={r.id ?? r[nameKey] ?? i}>
              <td>{r[nameKey] ?? '—'}</td>
              {extra && <td>{extra.render(r)}</td>}
              <td style={{ textAlign: 'right' }}>{fmtCredits(r.calls)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCredits(r.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function OverviewTab() {
  const [range, setRange] = useState({ from: daysAgo(30), to: today() });
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    adminAiCreditAPI.overview(range).then((r) => setData(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load the overview')));
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const addCredits = async (sign) => {
    const amount = Math.trunc(Number(form.amount)) * sign;
    if (!amount) { toast.error('Enter an amount'); return; }
    if (sign < 0 && !(await alert.confirm({ title: 'Remove platform credits?', text: `${fmtCredits(-amount)} credits will be taken from the platform pool.`, confirm: 'Remove' }))) return;
    setSaving(true);
    try {
      await adminAiCreditAPI.addPlatformCredits(amount, form.note);
      toast.success(sign > 0 ? 'Platform credits added' : 'Platform credits removed');
      setForm({ amount: '', note: '' });
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Could not update the platform pool'));
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div className="card" style={{ textAlign: 'center' }}><Loader2 size={18} className="animate-spin" /></div>;
  const p = data.pool;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {p.low && (
        <div className="card" style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: 'var(--warning)', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} /> The platform pool is running low. At 0, AI stops for every account.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <CreditStat icon={Database} tone={p.low ? 'warning' : 'primary'} label="Platform pool available" value={fmtCredits(p.available)} hint={`${fmtCredits(p.held)} held by calls in progress`} />
        <CreditStat icon={Activity} tone="muted" label="Platform used (all time)" value={fmtCredits(p.totalUsed)} hint={`${fmtCredits(p.totalAdded)} added in total`} />
        <CreditStat icon={Sparkles} tone="success" label="Purchased credits outstanding" value={fmtCredits(data.purchasedOutstanding)} hint="Customers' unspent add-on credits (never expire)" />
        <CreditStat icon={ListOrdered} tone="muted" label="Credits used in period" value={fmtCredits(data.totals.credits)} hint={`${fmtCredits(data.totals.calls)} AI calls · ${fmtCredits(data.totals.fromPurchased)} from purchased`} />
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 1 200px' }}>
          <label style={label}>Platform credits</label>
          <input className="form-input" type="number" min="1" step="1" placeholder="e.g. 5000000" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <label style={label}>Note (kept in the ledger)</label>
          <input className="form-input" maxLength={300} placeholder="e.g. Topped up the OpenAI account" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => addCredits(1)}><Plus size={14} /> Add</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => addCredits(-1)}>Remove</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>Usage in period</h3>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        <BreakdownTable title="By package" rows={data.byPackage} />
        <BreakdownTable title="By reseller (incl. its customers)" rows={data.byReseller} extra={{ label: 'Accounts', render: (r) => fmtCredits(r.accounts) }} />
        <BreakdownTable title="By account" rows={data.byAccount} extra={{ label: 'Type', render: (r) => <span className="badge badge-muted">{r.accountType?.replace('_', ' ').toLowerCase()}</span> }} />
        <BreakdownTable title="By feature" rows={data.byFeature.map((f) => ({ ...f, name: featureLabel(f.feature) }))} />
      </div>
      <div className="table-wrapper">
        <div style={{ padding: '12px 16px', fontWeight: 800, fontSize: '0.86rem' }}>Add-on sales in period</div>
        <table>
          <thead><tr><th>Currency</th><th style={{ textAlign: 'right' }}>Purchases</th><th style={{ textAlign: 'right' }}>Credits sold</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {data.purchases.length === 0 ? <EmptyRow cols={4} text="No add-ons sold in this period." /> : data.purchases.map((r) => (
              <tr key={r.currency}><td>{r.currency}</td><td style={{ textAlign: 'right' }}>{fmtCredits(r.count)}</td><td style={{ textAlign: 'right' }}>{fmtCredits(r.credits)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(r.revenue, r.currency)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Add-ons ─────────────────────────────────────────────────────────────────
const EMPTY_ADDON = { name: '', credits: '', price: '', currency: 'USD', description: '', sortOrder: 0, isActive: true };

function AddonsTab() {
  const [addons, setAddons] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(EMPTY_ADDON);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    adminAiCreditAPI.addons().then((r) => setAddons(r.data.addons)).catch((err) => toast.error(errMsg(err, 'Could not load add-ons')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (a) => {
    setEditing(a ? a.id : 'new');
    setForm(a ? { name: a.name, credits: String(a.credits), price: String(a.price), currency: a.currency, description: a.description || '', sortOrder: a.sort_order, isActive: Boolean(a.is_active) } : EMPTY_ADDON);
  };
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, credits: Number(form.credits), price: Number(form.price), sortOrder: Number(form.sortOrder) || 0 };
      if (editing === 'new') await adminAiCreditAPI.createAddon(body);
      else await adminAiCreditAPI.updateAddon(editing, body);
      toast.success('Add-on saved');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (a) => {
    try { await adminAiCreditAPI.setAddonActive(a.id, !a.is_active); load(); } catch (err) { toast.error(errMsg(err, 'Could not change it')); }
  };
  const remove = async (a) => {
    if (!(await alert.confirm({ title: `Remove "${a.name}"?`, text: 'It disappears from sale. Credits customers already bought are not affected.', confirm: 'Remove' }))) return;
    try { await adminAiCreditAPI.deleteAddon(a.id); toast.success('Removed'); load(); } catch (err) { toast.error(errMsg(err, 'Could not remove it')); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {editing ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="addon-editor">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Display name *</label><input className="form-input" maxLength={120} placeholder="100K AI Credits" value={form.name} onChange={set('name')} /></div>
            <div><label style={label}>Credits *</label><input className="form-input" type="number" min="1" step="1" placeholder="100000" value={form.credits} onChange={set('credits')} /></div>
            <div><label style={label}>Price *</label><input className="form-input" type="number" min="0" step="0.01" placeholder="9.99" value={form.price} onChange={set('price')} /></div>
            <div><label style={label}>Currency</label><input className="form-input" maxLength={3} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} /></div>
            <div><label style={label}>Sort order</label><input className="form-input" type="number" step="1" value={form.sortOrder} onChange={set('sortOrder')} /></div>
            <div><label style={label}>Expiry</label><div className="form-input" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}><InfinityIcon size={14} /> Never</div></div>
          </div>
          <div><label style={label}>Description</label><textarea className="form-input" rows={2} maxLength={500} value={form.description} onChange={set('description')} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', color: 'var(--text-primary)' }}><input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> On sale</label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button>
          </div>
          {editing !== 'new' && <span style={small}>Changing credits or price only affects future purchases.</span>}
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => open(null)} data-testid="new-addon"><Plus size={14} /> New add-on</button>
      )}
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Add-on</th><th style={{ textAlign: 'right' }}>Credits</th><th style={{ textAlign: 'right' }}>Price</th><th>Expiry</th><th style={{ textAlign: 'right' }}>Sold</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!addons ? <EmptyRow cols={7} text="Loading…" /> : addons.length === 0 ? <EmptyRow cols={7} text="No add-ons yet — create the packs customers can buy." /> : addons.map((a) => (
              <tr key={a.id}>
                <td><div style={{ fontWeight: 700 }}>{a.name}</div>{a.description && <div style={small}>{a.description}</div>}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCredits(a.credits)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(a.price, a.currency)}</td>
                <td>Never</td>
                <td style={{ textAlign: 'right' }}>{fmtCredits(a.sold)}</td>
                <td>
                  <button type="button" className={`badge ${a.is_active ? 'badge-success' : 'badge-muted'}`} style={{ cursor: 'pointer', border: 'none' }} onClick={() => toggle(a)} title="Click to switch">
                    {a.is_active ? 'On sale' : 'Off'}
                  </button>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(a)} aria-label={`Edit ${a.name}`}><Pencil size={13} /></button>{' '}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(a)} aria-label={`Remove ${a.name}`} style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Usage ───────────────────────────────────────────────────────────────────
function AccountPicker({ value, onChange, placeholder = 'Any account' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => adminAiCreditAPI.accounts(q).then((r) => setResults(r.data.accounts)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <div className="form-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name} <span style={small}>#{value.id}</span></span>
        <button type="button" onClick={() => onChange(null)} aria-label="Clear account" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={13} /></button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
      {results.length > 0 && (
        <div className="card" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', padding: 4, maxHeight: 240, overflowY: 'auto' }}>
          {results.map((a) => (
            <button key={a.id} type="button" onClick={() => { onChange(a); setQ(''); setResults([]); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.82rem', borderRadius: 6 }}>
              {a.name} <span style={small}>#{a.id} · {String(a.accountType).replace('_', ' ').toLowerCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageTab() {
  const [filters, setFilters] = useState({ from: daysAgo(30), to: today(), account: null, resellerId: '', packageId: '', model: '', feature: '', userId: '', integrationId: '', agentId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  useEffect(() => { adminAiCreditAPI.filters().then((r) => setOptions(r.data)).catch(() => {}); }, []);
  const query = useMemo(() => {
    const [provider, model] = filters.model ? filters.model.split('|') : ['', ''];
    return {
      from: filters.from, to: filters.to, page, pageSize: 25,
      agencyId: filters.account?.id || undefined, resellerId: filters.resellerId || undefined, packageId: filters.packageId || undefined,
      provider: provider || undefined, model: model || undefined, feature: filters.feature || undefined,
      userId: filters.userId || undefined, integrationId: filters.integrationId || undefined, agentId: filters.agentId || undefined,
    };
  }, [filters, page]);
  useEffect(() => {
    let alive = true;
    adminAiCreditAPI.usage(query).then((r) => alive && setData(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load usage')));
    return () => { alive = false; };
  }, [query]);
  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e?.target ? e.target.value : e })); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ gridColumn: 'span 2' }}><label style={label}>Date range</label><RangePicker value={filters} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, ...v })); }} /></div>
        <div><label style={label}>Account</label><AccountPicker value={filters.account} onChange={set('account')} /></div>
        <div><label style={label}>Reseller</label>
          <select className="form-input" value={filters.resellerId} onChange={set('resellerId')}><option value="">Any reseller</option>{(options?.resellers || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div><label style={label}>Package</label>
          <select className="form-input" value={filters.packageId} onChange={set('packageId')}><option value="">Any package</option>{(options?.packages || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}</select></div>
        <div><label style={label}>Provider / model</label>
          <select className="form-input" value={filters.model} onChange={set('model')}><option value="">Any model</option>{(options?.models || []).map((m) => <option key={`${m.provider}|${m.model}`} value={`${m.provider}|${m.model}`}>{m.provider} · {m.model}</option>)}</select></div>
        <div><label style={label}>Feature</label>
          <select className="form-input" value={filters.feature} onChange={set('feature')}><option value="">Any feature</option>{(options?.features || []).map((f) => <option key={f} value={f}>{featureLabel(f)}</option>)}</select></div>
        <div><label style={label}>End user (user id)</label><input className="form-input" inputMode="numeric" value={filters.userId} onChange={(e) => set('userId')(e.target.value.replace(/\D/g, ''))} /></div>
        <div><label style={label}>Bot (id)</label><input className="form-input" inputMode="numeric" value={filters.integrationId} onChange={(e) => set('integrationId')(e.target.value.replace(/\D/g, ''))} /></div>
        <div><label style={label}>AI agent (id)</label><input className="form-input" inputMode="numeric" value={filters.agentId} onChange={(e) => set('agentId')(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      {data && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <span><strong style={{ color: 'var(--text-primary)' }}>{fmtCredits(data.total)}</strong> calls</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{fmtCredits(data.sums.credits)}</strong> credits</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{fmtCredits(data.sums.inputTokens)}</strong> in / <strong style={{ color: 'var(--text-primary)' }}>{fmtCredits(data.sums.outputTokens)}</strong> out tokens</span>
        </div>
      )}
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Account</th><th>User</th><th>Feature</th><th>Provider / model</th><th>Bot / agent</th><th style={{ textAlign: 'right' }}>Input</th><th style={{ textAlign: 'right' }}>Output</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Credits</th></tr></thead>
          <tbody>
            {!data ? <EmptyRow cols={10} text="Loading…" /> : data.usage.length === 0 ? <EmptyRow cols={10} text="No AI usage matches these filters." /> : data.usage.map((u) => (
              <tr key={u.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                <td>{u.account_name || `#${u.agency_id}`}<div style={small}>{u.reseller_name ? `via ${u.reseller_name}` : u.package_name || ''}</div></td>
                <td>{u.user_name || '—'}</td>
                <td>{featureLabel(u.feature)}</td>
                <td style={{ fontSize: '0.78rem' }}>{u.provider || '—'}<div style={small}>{u.model}</div></td>
                <td style={{ fontSize: '0.8rem' }}>{u.bot_name || '—'}<div style={small}>{u.agent_name || ''}</div></td>
                <td style={{ textAlign: 'right' }}>{u.input_tokens === null ? '—' : fmtCredits(u.input_tokens)}</td>
                <td style={{ textAlign: 'right' }}>{u.output_tokens === null ? '—' : fmtCredits(u.output_tokens)}</td>
                <td style={{ textAlign: 'right' }} title={u.estimated ? 'Estimated — the provider returned no token counts' : undefined}>{u.total_tokens === null ? '—' : fmtCredits(u.total_tokens)}{u.estimated ? ' ≈' : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCredits(u.credits)}{Number(u.uncovered) > 0 && <div style={{ ...small, color: 'var(--warning)' }}>{fmtCredits(u.uncovered)} uncovered</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}

// ─── Ledger ──────────────────────────────────────────────────────────────────
function TransactionsTab() {
  const [filters, setFilters] = useState({ scope: '', type: '', account: null, includeUsage: false, from: daysAgo(90), to: today() });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    adminAiCreditAPI.transactions({
      page, pageSize: 25, from: filters.from, to: filters.to, scope: filters.scope || undefined, type: filters.type || undefined,
      agencyId: filters.account?.id || undefined, includeUsage: filters.includeUsage ? '1' : undefined,
    }).then((r) => alive && setData(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load the ledger')));
    return () => { alive = false; };
  }, [filters, page]);
  const set = (k) => (v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
        <div style={{ gridColumn: 'span 2' }}><label style={label}>Date range</label><RangePicker value={filters} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, ...v })); }} /></div>
        <div><label style={label}>Scope</label><select className="form-input" value={filters.scope} onChange={(e) => set('scope')(e.target.value)}><option value="">Accounts + platform</option><option value="ACCOUNT">Accounts</option><option value="PLATFORM">Platform pool</option></select></div>
        <div><label style={label}>Type</label><select className="form-input" value={filters.type} onChange={(e) => set('type')(e.target.value)}>
          <option value="">Any (except usage)</option>
          {['PACKAGE_CREDIT_GRANTED', 'PACKAGE_CREDIT_RESET', 'ADDON_PURCHASE', 'AI_USAGE', 'ADMIN_ADJUSTMENT', 'REFUND', 'PLATFORM_CREDIT_ADDED', 'PLATFORM_CREDIT_REMOVED'].map((t) => <option key={t} value={t}>{transactionLabel(t)}</option>)}
        </select></div>
        <div><label style={label}>Account</label><AccountPicker value={filters.account} onChange={set('account')} /></div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={filters.includeUsage} onChange={(e) => set('includeUsage')(e.target.checked)} /> Include AI usage rows</label>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Bucket</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Before → after</th><th>Details</th></tr></thead>
          <tbody>
            {!data ? <EmptyRow cols={7} text="Loading…" /> : data.transactions.length === 0 ? <EmptyRow cols={7} text="No ledger entries match." /> : data.transactions.map((t) => {
              const meta = typeof t.metadata === 'string' ? JSON.parse(t.metadata || '{}') : (t.metadata || {});
              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                  <td>{t.scope === 'PLATFORM' && !t.account_name ? 'Platform' : t.account_name || '—'}{t.user_name && <div style={small}>{t.user_name}</div>}</td>
                  <td>{transactionLabel(t.type)}</td>
                  <td><span className="badge badge-muted">{BUCKET_LABELS[t.bucket] || t.bucket}</span></td>
                  <td style={{ textAlign: 'right' }}>{meta.unlimited ? 'Unlimited' : <Amount value={t.amount} />}</td>
                  <td style={{ textAlign: 'right', ...small }}>{t.balance_before === null ? '∞' : fmtCredits(t.balance_before)} → {t.balance_after === null ? '∞' : fmtCredits(t.balance_after)}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{meta.note || meta.addonName || meta.packageName || (meta.feature ? featureLabel(meta.feature) : '') || t.source || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}

// ─── Purchases ───────────────────────────────────────────────────────────────
function PurchasesTab() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    adminAiCreditAPI.purchases({ page, pageSize: 25, status: status || undefined }).then((r) => setData(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load purchases')));
  }, [page, status]);
  useEffect(() => { load(); }, [load]);
  const refund = async (p) => {
    const ok = await alert.confirm({
      title: 'Mark this purchase refunded?',
      text: `The ${fmtCredits(p.credits)} credits still unused from it are taken back. Refund the money itself in ${p.provider === 'STRIPE' ? 'Stripe' : p.provider}.`,
      confirm: 'Refund credits',
    });
    if (!ok) return;
    try { const r = await adminAiCreditAPI.refund(p.id, 'Refunded by Super Admin'); toast.success(r.data.message); load(); } catch (err) { toast.error(errMsg(err, 'Could not refund')); }
  };
  const badge = { PAID: 'badge-success', PENDING: 'badge-warning', FAILED: 'badge-danger', CANCELLED: 'badge-muted', REFUNDED: 'badge-muted' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <select className="form-input" style={{ width: 200 }} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Status">
        <option value="">Any status</option>{['PAID', 'PENDING', 'REFUNDED', 'FAILED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
      </select>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Account</th><th>Add-on</th><th style={{ textAlign: 'right' }}>Credits</th><th style={{ textAlign: 'right' }}>Paid</th><th>Gateway</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!data ? <EmptyRow cols={8} text="Loading…" /> : data.purchases.length === 0 ? <EmptyRow cols={8} text="No purchases." /> : data.purchases.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.paid_at || p.created_at)}</td>
                <td>{p.account_name}<div style={small}>{p.user_name}</div></td>
                <td>{p.addon_name}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCredits(p.credits)}{Number(p.refunded_credits) > 0 && <div style={small}>{fmtCredits(p.refunded_credits)} taken back</div>}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(p.charged_amount ?? p.price, p.charged_currency || p.currency)}</td>
                <td>{p.provider}<div style={{ ...small, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.gateway_ref || ''}>{p.gateway_ref || ''}</div></td>
                <td><span className={`badge ${badge[p.status] || 'badge-muted'}`}>{p.status}</span></td>
                <td>{p.status === 'PAID' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => refund(p)}><Undo2 size={13} /> Refund</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}

// ─── Accounts (look up + adjust) ─────────────────────────────────────────────
function AccountsTab() {
  const [account, setAccount] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ bucket: 'PURCHASED', amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    if (!account) { setDetail(null); return; }
    adminAiCreditAPI.account(account.id).then((r) => setDetail(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load the account')));
  }, [account]);
  useEffect(() => { load(); }, [load]);
  const adjust = async () => {
    setSaving(true);
    try {
      await adminAiCreditAPI.adjust(account.id, { bucket: form.bucket, amount: Math.trunc(Number(form.amount)), note: form.note });
      toast.success('Credits adjusted');
      setForm((f) => ({ ...f, amount: '', note: '' }));
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Could not adjust'));
    } finally {
      setSaving(false);
    }
  };
  const s = detail?.summary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ maxWidth: 420 }}><label style={label}><Search size={12} /> Find an account</label><AccountPicker value={account} onChange={setAccount} placeholder="Workspace name, id or owner email" /></div>
      {s && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <CreditStat icon={Package} label="Plan credits" value={s.unlimitedPackage ? 'Unlimited' : fmtCredits(s.packageRemaining)} hint={s.unlimitedPackage ? s.packageName : `of ${fmtCredits(s.packageAllowance)} · ${s.packageName}`} />
            <CreditStat icon={Sparkles} tone="success" label="Purchased credits" value={fmtCredits(s.purchasedBalance)} hint={`${fmtCredits(s.lifetimePurchased)} bought in total`} />
            <CreditStat icon={Activity} tone="muted" label="Used this month" value={fmtCredits(s.usedThisPeriod)} hint={`${fmtCredits(s.lifetimeUsed)} in total`} />
            <CreditStat icon={Wallet} label="Available" value={s.unlimitedPackage ? 'Unlimited' : fmtCredits(s.available)} hint={s.canPurchase ? 'Can buy add-ons' : 'Can\'t buy add-ons'} />
          </div>
          <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={label}>Credits</label><select className="form-input" value={form.bucket} onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))}><option value="PURCHASED">Purchased (never expire)</option><option value="PACKAGE">Plan (this month only)</option></select></div>
            <div style={{ width: 160 }}><label style={label}>Amount (+ / −)</label><input className="form-input" type="number" step="1" placeholder="e.g. 50000 or -2000" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div style={{ flex: '1 1 240px' }}><label style={label}>Reason (required, kept in the ledger)</label><input className="form-input" maxLength={300} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !form.amount || !form.note.trim()} onClick={adjust}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Adjust</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
function SettingsTab() {
  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { adminAiCreditAPI.settings().then((r) => setState(r.data)).catch((err) => toast.error(errMsg(err, 'Could not load settings'))); }, []);
  if (!state) return <div className="card" style={{ textAlign: 'center' }}><Loader2 size={18} className="animate-spin" /></div>;
  const st = state.settings;
  const set = (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setRate = (i, patch) => set({ modelRates: st.modelRates.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const save = async () => {
    setSaving(true);
    try { const r = await adminAiCreditAPI.saveSettings(st); set(r.data.settings); toast.success('Settings saved'); } catch (err) { toast.error(errMsg(err, 'Could not save')); } finally { setSaving(false); }
  };
  const providerModels = (id) => state.providers.find((p) => p.id === id)?.models || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div><label style={label}>Credits per input token</label><input className="form-input" type="number" min="0" step="0.01" value={st.defaultRates.inputPerToken} onChange={(e) => set({ defaultRates: { ...st.defaultRates, inputPerToken: e.target.value } })} /></div>
        <div><label style={label}>Credits per output token</label><input className="form-input" type="number" min="0" step="0.01" value={st.defaultRates.outputPerToken} onChange={(e) => set({ defaultRates: { ...st.defaultRates, outputPerToken: e.target.value } })} /></div>
        <div><label style={label}>Credits per embedding token</label><input className="form-input" type="number" min="0" step="0.01" value={st.embeddingPerToken} onChange={(e) => set({ embeddingPerToken: e.target.value })} /></div>
        <div><label style={label}>Credits per voice transcription</label><input className="form-input" type="number" min="0" step="1" value={st.transcriptionCreditsPerCall} onChange={(e) => set({ transcriptionCreditsPerCall: e.target.value })} /></div>
        <div><label style={label}>Minimum credits per AI call</label><input className="form-input" type="number" min="0" step="1" value={st.minimumCreditsPerCall} onChange={(e) => set({ minimumCreditsPerCall: e.target.value })} /></div>
        <div><label style={label}>Spend first</label>
          <select className="form-input" value={st.consumptionOrder[0]} onChange={(e) => set({ consumptionOrder: e.target.value === 'PURCHASED' ? ['PURCHASED', 'PACKAGE'] : ['PACKAGE', 'PURCHASED'] })}>
            <option value="PACKAGE">Plan credits, then purchased (recommended)</option>
            <option value="PURCHASED">Purchased credits, then plan</option>
          </select></div>
        <div><label style={label}>Warn when the platform pool is below</label><input className="form-input" type="number" min="0" step="1" value={st.lowPlatformBalanceWarning} onChange={(e) => set({ lowPlatformBalanceWarning: e.target.value })} /></div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Rates per provider / model</div>
        <span style={small}>Overrides the default rates. Model "*" = every model of that provider. Plan allowances (Packages → AI Credits) are in these same credits.</span>
        {st.modelRates.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 0.8fr 0.8fr auto', gap: 8, alignItems: 'center' }}>
            <select className="form-input" value={r.provider} onChange={(e) => setRate(i, { provider: e.target.value, model: '*' })} aria-label="Provider">
              {state.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select className="form-input" value={r.model} onChange={(e) => setRate(i, { model: e.target.value })} aria-label="Model">
              <option value="*">All models</option>{providerModels(r.provider).map((m) => <option key={m} value={m}>{m}</option>)}
              {r.model !== '*' && !providerModels(r.provider).includes(r.model) && <option value={r.model}>{r.model}</option>}
            </select>
            <input className="form-input" type="number" min="0" step="0.01" value={r.inputPerToken ?? ''} onChange={(e) => setRate(i, { inputPerToken: e.target.value })} placeholder="Input / token" aria-label="Input credits per token" />
            <input className="form-input" type="number" min="0" step="0.01" value={r.outputPerToken ?? ''} onChange={(e) => setRate(i, { outputPerToken: e.target.value })} placeholder="Output / token" aria-label="Output credits per token" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ modelRates: st.modelRates.filter((_, j) => j !== i) })} aria-label="Remove rate"><X size={13} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ modelRates: [...st.modelRates, { provider: state.providers[0]?.id || 'openai', model: '*', inputPerToken: 1, outputPerToken: 1 }] })}><Plus size={13} /> Add rate</button>
      </div>
      <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save settings</button>
    </div>
  );
}

export default function AiCreditsAdminPage() {
  const [tab, setTab] = useUrlState('tab', 'overview', { allowed: ['overview', 'addons', 'usage', 'ledger', 'purchases', 'accounts', 'settings'] });
  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">AI Credits</h1>
        <p className="page-subtitle">Every account's AI runs on the platform's AI providers and spends AI credits: plan credits each month, then purchased add-on credits (never expire).</p>
      </div>
      <div className="page-body">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'overview', label: 'Overview', icon: Database },
            { key: 'addons', label: 'Add-ons', icon: Sparkles },
            { key: 'usage', label: 'Usage', icon: Activity },
            { key: 'ledger', label: 'Ledger', icon: ListOrdered },
            { key: 'purchases', label: 'Purchases', icon: Receipt },
            { key: 'accounts', label: 'Accounts', icon: Users },
            { key: 'settings', label: 'Settings', icon: Settings },
          ]}
        />
        {tab === 'overview' && <OverviewTab />}
        {tab === 'addons' && <AddonsTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'ledger' && <TransactionsTab />}
        {tab === 'purchases' && <PurchasesTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </AppLayout>
  );
}
