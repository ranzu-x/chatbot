import { useEffect, useState, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { couponAPI, packageAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { Ticket, Plus, Pencil, Trash2, Loader2, Save, X } from 'lucide-react';

/**
 * Super Admin → Coupons. Codes customers type at checkout (public pricing
 * page and the dashboard billing tab). A user's "special coupon" in the User
 * Manager names one of these codes and is applied automatically. How it
 * combines with package / personal discounts: chatbot_api/utils/checkoutPricing.js.
 */

const EMPTY = {
  code: '', description: '', discountType: 'PERCENT', amount: '', duration: 'ONCE',
  packageIds: [], maxRedemptions: '', perCustomerLimit: '1', startsAt: '', endsAt: '', isActive: true,
};

const toLocalInput = (d) => (d ? new Date(d).toISOString().slice(0, 16) : '');

function fromRow(c) {
  let pkgs = c.package_ids;
  if (typeof pkgs === 'string') { try { pkgs = JSON.parse(pkgs); } catch { pkgs = []; } }
  return {
    code: c.code, description: c.description || '', discountType: c.discount_type, amount: String(Number(c.amount)),
    duration: c.duration, packageIds: pkgs || [], maxRedemptions: c.max_redemptions ?? '', perCustomerLimit: c.per_customer_limit ?? '',
    startsAt: toLocalInput(c.starts_at), endsAt: toLocalInput(c.ends_at), isActive: Boolean(c.is_active),
  };
}

function statusOf(c) {
  const now = Date.now();
  if (!c.is_active) return ['badge-muted', 'Off'];
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return ['badge-warning', 'Scheduled'];
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return ['badge-muted', 'Ended'];
  if (c.max_redemptions && Number(c.redemptions) >= c.max_redemptions) return ['badge-muted', 'Used up'];
  return ['badge-success', 'Active'];
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | coupon id
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    couponAPI.getAll()
      .then((res) => setCoupons(res.data?.coupons || []))
      .catch(() => notify.error('Could not load coupons'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    packageAPI.getAll().then((res) => setPackages(res.data?.packages || res.data || [])).catch(() => {});
  }, [load]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const startNew = () => { setForm(EMPTY); setEditing('new'); };
  const startEdit = (c) => { setForm(fromRow(c)); setEditing(c.id); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      amount: Number(form.amount),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    };
    try {
      if (editing === 'new') await couponAPI.create(payload);
      else await couponAPI.update(editing, payload);
      notify.success('Coupon saved');
      setEditing(null);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save the coupon');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    const ok = await showAlert.confirm({ title: `Delete coupon ${c.code}?`, text: 'A coupon that was already used is switched off instead, so past invoices keep their record.', confirmButtonText: 'Delete' });
    if (!ok) return;
    try {
      const res = await couponAPI.remove(c.id);
      notify.success(res.data?.message || 'Coupon deleted');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not delete the coupon');
    }
  };

  const togglePackage = (id) => set({ packageIds: form.packageIds.includes(id) ? form.packageIds.filter((x) => x !== id) : [...form.packageIds, id] });
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

  return (
    <AppLayout>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Ticket size={20} /> Coupons</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Codes customers enter at checkout. The larger of a plan's own discount and the customer's personal discount applies first; a coupon comes off what's left.
            </p>
          </div>
          {editing === null && <button type="button" className="btn btn-primary" onClick={startNew}><Plus size={15} /> New coupon</button>}
        </div>

        {editing !== null && (
          <form onSubmit={save} className="card" style={{ padding: 20, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong>{editing === 'new' ? 'New coupon' : `Edit ${form.code}`}</strong>
              <button type="button" onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <span style={lbl}>Code *</span>
                <input className="form-input w-full" style={{ textTransform: 'uppercase' }} required value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="e.g. WELCOME20" />
              </div>
              <div>
                <span style={lbl}>Discount *</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" style={{ flex: 1 }} type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
                  <select className="form-input" style={{ width: 110 }} value={form.discountType} onChange={(e) => set({ discountType: e.target.value })}>
                    <option value="PERCENT">% off</option>
                    <option value="FIXED">USD off</option>
                  </select>
                </div>
              </div>
              <div>
                <span style={lbl}>Applies to</span>
                <select className="form-input w-full" value={form.duration} onChange={(e) => set({ duration: e.target.value })}>
                  <option value="ONCE">The first payment only</option>
                  <option value="FOREVER">Every renewal (card payments)</option>
                </select>
              </div>
              <div>
                <span style={lbl}>Starts</span>
                <input className="form-input w-full" type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
              </div>
              <div>
                <span style={lbl}>Ends</span>
                <input className="form-input w-full" type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
              </div>
              <div>
                <span style={lbl}>Total uses (empty = unlimited)</span>
                <input className="form-input w-full" type="number" min="1" value={form.maxRedemptions} onChange={(e) => set({ maxRedemptions: e.target.value })} />
              </div>
              <div>
                <span style={lbl}>Uses per customer (empty = unlimited)</span>
                <input className="form-input w-full" type="number" min="1" value={form.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={lbl}>Description (internal)</span>
                <input className="form-input w-full" maxLength={255} value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={lbl}>Only for these plans (none selected = every plan)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {packages.map((p) => (
                    <label key={p.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', background: form.packageIds.includes(p.id) ? 'var(--bg-hover)' : 'transparent' }}>
                      <input type="checkbox" checked={form.packageIds.includes(p.id)} onChange={() => togglePackage(p.id)} />
                      {p.name} · {p.billing_cycle}
                    </label>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem' }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Active
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save coupon</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : coupons.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Ticket size={26} /></div>
            <div className="empty-title">No coupons yet</div>
            <div className="empty-desc">Create a code, then share it or set it as a user's special coupon in the User Manager.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Code</th><th>Discount</th><th>Valid</th><th>Used</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const [cls, text] = statusOf(c);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="font-medium" style={{ fontFamily: 'var(--font-mono)' }}>{c.code}</div>
                        {c.description && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.description}</div>}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {c.discount_type === 'PERCENT' ? `${Number(c.amount)}%` : `$${Number(c.amount).toFixed(2)}`} off
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.duration === 'FOREVER' ? 'every renewal' : 'first payment'}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : 'Now'} – {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : 'no end'}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {c.redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}
                        {Number(c.total_discount) > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{Number(c.total_discount).toFixed(2)} discounted</div>}
                      </td>
                      <td><span className={`badge ${cls}`}>{text}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(c)}><Pencil size={12} /></button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(c)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
