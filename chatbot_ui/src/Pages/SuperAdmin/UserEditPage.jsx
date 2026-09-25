import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI, packageAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import {
  ArrowLeft, User, Lock, CreditCard, Globe, ShieldCheck, MessagesSquare, BarChart3,
  Eye, EyeOff, RotateCcw, CheckCircle2, AlertCircle, Save, Trash2,
} from 'lucide-react';

// Super Admin → User Manager → full-page create / edit (replaces the old
// modal in UsersPage.jsx). Everything comes from GET /admin/users/:id and is
// saved with one PUT /admin/users/:id (routes/admin.js). Creating a user is
// POST /admin/users (name/email/password/role) followed by that same PUT for
// the remaining fields.
//
// Special coupon + discount % are stored and shown only — they aren't applied
// at checkout yet. "Comments" covers forum replies now and blog comments once
// the blog has them. The expiry date is stored on the active subscription.

const EMPTY_FORM = {
  name: '', email: '', phone: '', address: '', role: 'USER',
  newPassword: '', confirmPassword: '',
  packageId: '', expiryDate: '', specialCoupon: '', discountPercent: '',
  isActive: true, emailVerified: true, canForumPost: true, canComment: true,
  customDomain: '', subdomain: '',
};

// DATETIME (as ISO from the API) → local YYYY-MM-DD for <input type="date">.
function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formFromUser(u) {
  return {
    name: u.name || '',
    email: u.email || '',
    phone: u.phone || '',
    address: u.address || '',
    role: u.role || 'USER',
    newPassword: '',
    confirmPassword: '',
    packageId: u.subscription?.package_id ? String(u.subscription.package_id) : (u.package_id ? String(u.package_id) : ''),
    expiryDate: toDateInput(u.subscription?.expires_at || u.subscription?.current_period_end),
    specialCoupon: u.special_coupon || '',
    discountPercent: u.discount_percent === null || u.discount_percent === undefined ? '' : String(u.discount_percent),
    isActive: !!u.is_active,
    emailVerified: !!u.email_verified_at,
    canForumPost: !!u.can_forum_post,
    canComment: !!u.can_comment,
    customDomain: u.workspace?.custom_domain || '',
    subdomain: u.workspace?.subdomain || '',
  };
}

// ─── Small building blocks ───────────────────────────────────────────────────

function Card({ icon, title, subtitle, children, action }) {
  const Icon = icon;
  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function Field({ label, hint, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none', padding: 2, flexShrink: 0,
        background: checked ? 'var(--success)' : '#d4d4d8', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'background .15s ease', display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </button>
  );
}

function ToggleRow({ title, description, checked, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '10px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {description && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.45 }}>{description}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Badge({ tone = 'neutral', children }) {
  const tones = {
    success: { bg: 'rgba(16,185,129,0.12)', fg: '#059669' },
    warning: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
    danger: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626' },
    neutral: { bg: 'var(--bg-hover)', fg: 'var(--text-secondary)' },
  };
  const t = tones[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        className="form-input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{ paddingRight: 36 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        title={show ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4, display: 'flex' }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UserEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [packageNote, setPackageNote] = useState('');

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setFromEvent = (key) => (e) => set(key)(e.target.value);

  useEffect(() => {
    packageAPI.getAll()
      .then((res) => setPackages(res.data?.packages || res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) {
      setDetail(null);
      setForm(EMPTY_FORM);
      setInitialForm(EMPTY_FORM);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    adminAPI.getUser(id)
      .then((res) => {
        if (cancelled) return;
        const u = res.data.user;
        setDetail(u);
        const f = formFromUser(u);
        setForm(f);
        setInitialForm(f);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.status === 404 ? 'This user no longer exists.' : 'Failed to load this user.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isNew]);

  const isResellerWorkspace = detail?.workspace?.account_type === 'RESELLER';
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const passwordMismatch = form.confirmPassword !== '' && form.newPassword !== form.confirmPassword;

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const goBack = async () => {
    if (isDirty && !(await showAlert.confirm({ title: 'Discard changes?', text: 'Your unsaved changes to this user will be lost.', confirmButtonText: 'Discard' }))) return;
    navigate('/admin/users');
  };

  // Only fields that changed are sent, so saving never touches (for
  // example) the subscription unless the package or expiry was edited.
  const buildPayload = () => {
    const p = {};
    const changed = (k) => form[k] !== initialForm[k];
    if (isNew || changed('name')) p.name = form.name.trim();
    if (isNew || changed('email')) p.email = form.email.trim();
    if (isNew || changed('phone')) p.phone = form.phone.trim();
    if (isNew || changed('address')) p.address = form.address.trim();
    if (!isNew && changed('role')) p.role = form.role;
    if (!isNew && form.newPassword) p.newPassword = form.newPassword;
    if (changed('packageId') && form.packageId) p.packageId = Number(form.packageId);
    if (changed('expiryDate')) p.expiryDate = form.expiryDate ? `${form.expiryDate}T23:59:59` : null;
    if (isNew || changed('specialCoupon')) p.specialCoupon = form.specialCoupon.trim();
    if (isNew || changed('discountPercent')) p.discountPercent = form.discountPercent === '' ? null : Number(form.discountPercent);
    if (isNew || changed('isActive')) p.isActive = form.isActive;
    if (isNew || changed('emailVerified')) p.emailVerified = form.emailVerified;
    if (isNew || changed('canForumPost')) p.canForumPost = form.canForumPost;
    if (isNew || changed('canComment')) p.canComment = form.canComment;
    if (isResellerWorkspace && (changed('customDomain') || changed('subdomain'))) {
      p.customDomain = form.customDomain.trim();
      p.subdomain = form.subdomain.trim();
    }
    return p;
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { notify.error('Full name and email are required'); return; }
    if (isNew && !form.newPassword) { notify.error('Set a password for the new user'); return; }
    if (form.newPassword && form.newPassword.length < 6) { notify.error('Password must be at least 6 characters'); return; }
    if (form.newPassword !== form.confirmPassword) { notify.error('The two passwords do not match'); return; }
    if (form.discountPercent !== '' && (Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100)) {
      notify.error('Discount must be between 0 and 100'); return;
    }

    setSaving(true);
    setPackageNote('');
    try {
      let userId = id;
      if (isNew) {
        const created = await adminAPI.createUser({ name: form.name.trim(), email: form.email.trim(), password: form.newPassword, role: form.role });
        userId = created.data?.user?.id;
      }
      const res = await adminAPI.updateUser(userId, buildPayload());
      if (res.data?.packageChange) setPackageNote(res.data.packageChange.note);
      notify.success(isNew ? 'User created' : 'User updated');
      if (isNew) {
        navigate(`/admin/users/${userId}/edit`, { replace: true });
      } else {
        const u = res.data.user;
        setDetail(u);
        const f = formFromUser(u);
        setForm(f);
        setInitialForm(f);
      }
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save this user');
    } finally {
      setSaving(false);
    }
  };

  const handleResetUsage = async () => {
    const ok = await showAlert.confirm({
      title: 'Reset monthly usage?',
      text: "This month's message, AI-token and social-post counters start again from zero for this user's workspace. No data is deleted.",
      confirmButtonText: 'Reset usage',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const res = await adminAPI.resetUserUsage(id);
      setDetail((d) => ({ ...d, usage: res.data.usage, workspace: { ...d.workspace, usage_reset_at: new Date().toISOString() } }));
      notify.success('Monthly usage reset');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not reset usage');
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    const ok = await showAlert.confirm({ title: `Delete ${detail?.name}?`, text: 'This permanently deletes the user. This cannot be undone.', confirmButtonText: 'Delete user' });
    if (!ok) return;
    try {
      await adminAPI.deleteUser(id);
      notify.success('User deleted');
      navigate('/admin/users');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Delete failed');
    }
  };

  if (loading || loadError) {
    return (
      <AppLayout>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
          {loading ? 'Loading user…' : (
            <>
              <p style={{ margin: '0 0 12px' }}>{loadError}</p>
              <Link to="/admin/users">Back to User Manager</Link>
            </>
          )}
        </div>
      </AppLayout>
    );
  }

  const usageSince = (() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const reset = detail?.workspace?.usage_reset_at ? new Date(detail.workspace.usage_reset_at) : null;
    return reset && reset > monthStart ? reset : monthStart;
  })();
  const selectedPackage = packages.find((p) => String(p.id) === String(form.packageId));
  const expiryPassed = form.expiryDate && new Date(`${form.expiryDate}T23:59:59`) < new Date();

  return (
    <AppLayout>
      <form onSubmit={handleSave} style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 0' }}>
        {/* ── Header ── */}
        <button type="button" onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, marginBottom: 14, color: 'var(--text-tertiary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={14} /> User Manager
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, flexShrink: 0 }}>
              {(form.name || '?').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {isNew ? 'New user' : (detail?.name || 'Edit user')}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {!isNew && <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{detail?.email}</span>}
                {!isNew && <Badge tone={detail?.is_active ? 'success' : 'neutral'}>● {detail?.is_active ? 'Active' : 'Inactive'}</Badge>}
                {!isNew && (detail?.email_verified_at
                  ? <Badge tone="success"><CheckCircle2 size={11} /> Email verified</Badge>
                  : <Badge tone="warning"><AlertCircle size={11} /> Email not verified</Badge>)}
                {detail?.workspace && <Badge>{detail.workspace.account_type === 'RESELLER' ? 'Reseller' : detail.workspace.account_type === 'DIRECT_CUSTOMER' ? 'End User' : detail.workspace.account_type}</Badge>}
              </div>
            </div>
          </div>
          {!isNew && (
            <button type="button" onClick={handleDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={14} /> Delete user
            </button>
          )}
        </div>

        <div className="user-edit-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}>
          {/* ── Main column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <Card icon={User} title="Profile" subtitle="Who this user is and how to reach them">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                <Field label="Full name">
                  <input required className="form-input w-full" value={form.name} onChange={setFromEvent('name')} placeholder="e.g. John Doe" />
                </Field>
                <Field label="Email">
                  <input required type="email" className="form-input w-full" value={form.email} onChange={setFromEvent('email')} placeholder="john@example.com" />
                </Field>
                <Field label="WhatsApp mobile number" hint="Include the country code, e.g. +8801XXXXXXXXX">
                  <input type="tel" className="form-input w-full" value={form.phone} onChange={setFromEvent('phone')} placeholder="+8801XXXXXXXXX" />
                </Field>
                <Field label="Role">
                  <select className="form-input w-full" value={form.role} onChange={setFromEvent('role')}>
                    <option value="USER">User</option>
                    <option value="RESELLER">Reseller</option>
                    <option value="ADMIN">Super Admin</option>
                  </select>
                </Field>
                <Field label="Address" span={2}>
                  <textarea className="form-input w-full" rows={2} value={form.address} onChange={setFromEvent('address')} placeholder="Street, city, country" style={{ resize: 'vertical' }} />
                </Field>
              </div>
            </Card>

            <Card icon={Lock} title={isNew ? 'Password' : 'Change password'} subtitle={isNew ? 'The user signs in with this password' : 'Leave both fields empty to keep the current password'}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                <Field label={isNew ? 'Password' : 'New password'} hint="At least 6 characters">
                  <PasswordInput value={form.newPassword} onChange={set('newPassword')} placeholder="••••••••" autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <PasswordInput value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" autoComplete="new-password" />
                  {passwordMismatch && <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 4 }}>Passwords don't match</div>}
                </Field>
              </div>
            </Card>

            <Card icon={CreditCard} title="Subscription" subtitle="Plan, expiry and special pricing">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                <Field label="Subscription package" hint={detail?.subscription ? `Current: ${detail.subscription.package_name || 'Unknown'}` : (isNew ? null : 'No active subscription')}>
                  <select className="form-input w-full" value={form.packageId} onChange={setFromEvent('packageId')} disabled={form.role === 'ADMIN'}>
                    <option value="">— No package —</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.type ? ` · ${p.type.replace('_', ' ').toLowerCase()}` : ''}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Expiry date"
                  hint={expiryPassed ? <span style={{ color: '#b45309' }}>This date is in the past (saved only — expiry is not enforced yet).</span> : 'Saved only — access is not cut off at this date yet. Leave empty for no expiry.'}
                >
                  <input type="date" className="form-input w-full" value={form.expiryDate} onChange={setFromEvent('expiryDate')} disabled={!form.packageId} />
                </Field>
                <Field label="Special coupon" hint="Saved on the user — not applied at checkout yet">
                  <input className="form-input w-full" value={form.specialCoupon} onChange={(e) => set('specialCoupon')(e.target.value.toUpperCase())} placeholder="e.g. VIP2026" maxLength={64} style={{ fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }} />
                </Field>
                <Field label="Discount percentage" hint={selectedPackage && form.discountPercent !== '' ? `≈ ${(Number(selectedPackage.price) * (1 - Number(form.discountPercent) / 100)).toFixed(2)} instead of ${Number(selectedPackage.price).toFixed(2)} — saved only, not applied at checkout yet` : 'Between 0 and 100 — saved only, not applied at checkout yet'}>
                  <div style={{ position: 'relative' }}>
                    <input type="number" min="0" max="100" step="0.01" className="form-input w-full" value={form.discountPercent} onChange={setFromEvent('discountPercent')} placeholder="0" style={{ paddingRight: 28 }} />
                    <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>%</span>
                  </div>
                </Field>
              </div>
              {packageNote && (
                <div style={{ marginTop: 14, background: 'rgba(37,99,235,0.07)', color: '#1d4ed8', padding: '10px 12px', borderRadius: 8, fontSize: '0.76rem', lineHeight: 1.5 }}>
                  {packageNote}
                </div>
              )}
            </Card>

            {isResellerWorkspace && (
              <Card
                icon={Globe}
                title="Reseller domain"
                subtitle="Where this reseller's customers sign up and sign in"
                action={form.customDomain && (detail.workspace.domain_verified && form.customDomain === initialForm.customDomain
                  ? <Badge tone="success"><CheckCircle2 size={11} /> Verified</Badge>
                  : <Badge tone="warning">Not verified</Badge>)}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <Field label="Custom domain" hint="e.g. app.theirbrand.com — a changed domain must be verified again">
                    <input className="form-input w-full" value={form.customDomain} onChange={setFromEvent('customDomain')} placeholder="app.example.com" />
                  </Field>
                  <Field label="Subdomain" hint="Letters, numbers and dashes only">
                    <input className="form-input w-full" value={form.subdomain} onChange={(e) => set('subdomain')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="theirbrand" />
                  </Field>
                </div>
              </Card>
            )}
          </div>

          {/* ── Side column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <Card icon={ShieldCheck} title="Account">
              <ToggleRow
                title="Account active"
                description="Inactive users are signed out and can't sign in."
                checked={form.isActive}
                onChange={set('isActive')}
              />
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div style={{ padding: '10px 0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>Email verification</span>
                  {isNew ? <Badge>New</Badge> : detail?.email_verified_at
                    ? <Badge tone="success"><CheckCircle2 size={11} /> Verified</Badge>
                    : <Badge tone="warning"><AlertCircle size={11} /> Not verified</Badge>}
                </div>
                {!isNew && detail?.email_verified_at && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 3 }}>
                    Verified on {new Date(detail.email_verified_at).toLocaleString()}
                  </div>
                )}
              </div>
              <ToggleRow
                title="Mark email as verified"
                description="Turn on to verify it manually. Turning it off makes the user confirm their email again."
                checked={form.emailVerified}
                onChange={set('emailVerified')}
              />
            </Card>

            <Card icon={MessagesSquare} title="Community">
              <ToggleRow
                title="Forum posting"
                description="Can start new threads in the Community Forum."
                checked={form.canForumPost}
                onChange={set('canForumPost')}
              />
              <div style={{ borderTop: '1px solid var(--border)' }} />
              <ToggleRow
                title="Forum & blog comments"
                description="Can reply in the forum. Blog comments will follow this setting once the blog has comments."
                checked={form.canComment}
                onChange={set('canComment')}
              />
            </Card>

            {!isNew && (
              <Card
                icon={BarChart3}
                title="Monthly usage"
                subtitle={detail?.workspace ? `Since ${usageSince.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'No workspace'}
              >
                {detail?.usage ? (
                  <>
                    {[
                      ['Messages sent', detail.usage.outboundMessages],
                      ['AI tokens', detail.usage.aiTokens],
                      ['Social posts', detail.usage.socialPosts],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                        <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{Number(value || 0).toLocaleString()}</strong>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleResetUsage}
                      disabled={resetting}
                      style={{ marginTop: 10, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: resetting ? 'default' : 'pointer' }}
                    >
                      <RotateCcw size={13} className={resetting ? 'animate-spin' : ''} /> {resetting ? 'Resetting…' : 'Reset monthly usage'}
                    </button>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>This user doesn't own a workspace, so there's no usage to show.</p>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* ── Sticky save bar ── */}
        <div style={{ position: 'sticky', bottom: 0, zIndex: 20, marginTop: 18, paddingBottom: 16, background: 'linear-gradient(to top, var(--bg-base) 70%, transparent)' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-md)' }}>
            <span style={{ marginRight: 'auto', fontSize: '0.78rem', color: isDirty ? '#b45309' : 'var(--text-tertiary)' }}>
              {isDirty ? 'You have unsaved changes' : (isNew ? '' : 'All changes saved')}
            </span>
            <button type="button" onClick={goBack} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || (!isDirty && !isNew) || passwordMismatch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, opacity: saving || (!isDirty && !isNew) || passwordMismatch ? 0.5 : 1 }}>
              <Save size={14} /> {saving ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>

      <style>{`
        @media (max-width: 960px) {
          .user-edit-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </AppLayout>
  );
}
