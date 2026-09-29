import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, Save, Mail, KeyRound, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import UserAvatar from '../../Components/Common/UserAvatar';
import { authAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { notify, showAlert } from '../../utils/alerts';
import { accountLabel } from '../../utils/accountLabel';

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 18 };
const title = { margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 };
const hint = { fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' };
const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 5 };
const MIN_PASSWORD = 6;

const errorOf = (err, fallback) => err?.response?.data?.message || fallback;

function PasswordField({ value, onChange, placeholder, autoComplete }) {
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
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex' }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

/**
 * My Account → Profile: the signed-in person edits their own picture, name,
 * phone, address, sign-in email and password (routes/auth.js /auth/profile*).
 */
export default function ProfileTab() {
  const { user, refreshUser, changePassword } = useAuth();
  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState({ name: '', phone: '', address: '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef(null);

  const [emailForm, setEmailForm] = useState(null); // { email, currentPassword } while editing
  const [savingEmail, setSavingEmail] = useState(false);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const applyProfile = (p) => {
    setProfile(p);
    setDetails({ name: p.name || '', phone: p.phone || '', address: p.address || '' });
  };

  useEffect(() => {
    authAPI.getProfile()
      .then((res) => applyProfile(res.data.profile))
      .catch(() => notify.error('Could not load your profile'));
  }, []);

  if (!profile) {
    return <div style={{ padding: 40, color: '#64748b', fontSize: '0.85rem' }}><Loader2 size={16} className="animate-spin" /> Loading your profile…</div>;
  }

  const detailsDirty = details.name !== (profile.name || '') || details.phone !== (profile.phone || '') || details.address !== (profile.address || '');

  const saveDetails = async (e) => {
    e.preventDefault();
    if (!details.name.trim()) { notify.error("Your name can't be empty"); return; }
    setSavingDetails(true);
    try {
      const res = await authAPI.updateProfile({ name: details.name.trim(), phone: details.phone.trim(), address: details.address.trim() });
      applyProfile(res.data.profile);
      refreshUser();
      notify.success('Profile updated');
    } catch (err) {
      notify.error(errorOf(err, 'Could not save your profile'));
    } finally {
      setSavingDetails(false);
    }
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { notify.error('The picture must be 2 MB or smaller'); return; }
    setAvatarBusy(true);
    try {
      const res = await authAPI.uploadAvatar(file);
      applyProfile(res.data.profile);
      refreshUser();
      notify.success('Profile picture updated');
    } catch (err) {
      notify.error(errorOf(err, 'Upload failed'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    const ok = await showAlert.confirm({ title: 'Remove your profile picture?', text: 'The default picture is shown instead.', confirmButtonText: 'Remove' });
    if (!ok) return;
    setAvatarBusy(true);
    try {
      const res = await authAPI.removeAvatar();
      applyProfile(res.data.profile);
      refreshUser();
      notify.success('Profile picture removed');
    } catch (err) {
      notify.error(errorOf(err, 'Could not remove it'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    if (!emailForm.email.trim() || !emailForm.currentPassword) { notify.error('Enter the new email and your current password'); return; }
    setSavingEmail(true);
    try {
      const res = await authAPI.changeEmail({ email: emailForm.email.trim(), currentPassword: emailForm.currentPassword });
      applyProfile(res.data.profile);
      setEmailForm(null);
      refreshUser();
      notify.success(res.data.message || 'Email updated');
    } catch (err) {
      notify.error(errorOf(err, 'Could not change your email'));
    } finally {
      setSavingEmail(false);
    }
  };

  const pwMismatch = pw.confirm !== '' && pw.next !== pw.confirm;
  const savePassword = async (e) => {
    e.preventDefault();
    if (!pw.current) { notify.error('Enter your current password'); return; }
    if (pw.next.length < MIN_PASSWORD) { notify.error(`The new password must be at least ${MIN_PASSWORD} characters`); return; }
    if (pw.next !== pw.confirm) { notify.error("The new passwords don't match"); return; }
    setSavingPw(true);
    try {
      await changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      notify.success('Password changed — you were signed out on your other devices');
    } catch (err) {
      notify.error(errorOf(err, 'Could not change your password'));
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* ── Picture ── */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <UserAvatar src={profile.avatar} name={profile.name} size={72} />
          {avatarBusy && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{profile.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{accountLabel(user)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickAvatar} style={{ display: 'none' }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={avatarBusy} onClick={() => fileRef.current?.click()}>
              <Camera size={13} /> {profile.avatar ? 'Change picture' : 'Upload picture'}
            </button>
            {profile.avatar && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={avatarBusy} onClick={removeAvatar}>
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
          <p style={hint}>PNG, JPG or WEBP, up to 2 MB. A square picture looks best.</p>
        </div>
      </div>

      {/* ── Details ── */}
      <form onSubmit={saveDetails} style={card}>
        <h3 style={title}>Personal details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
          <div>
            <label style={label} htmlFor="pf-name">Full name</label>
            <input id="pf-name" className="form-input w-full" value={details.name} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} maxLength={150} />
          </div>
          <div>
            <label style={label} htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" type="tel" className="form-input w-full" value={details.phone} onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label} htmlFor="pf-address">Address</label>
            <textarea id="pf-address" rows={2} className="form-input w-full" value={details.address} onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))} placeholder="Street, city, country" style={{ resize: 'vertical' }} maxLength={500} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={savingDetails || !detailsDirty}>
            {savingDetails ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save changes
          </button>
        </div>
      </form>

      {/* ── Email ── */}
      <div style={card}>
        <h3 style={title}><Mail size={16} /> Sign-in email</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{profile.email}</span>
          {profile.emailVerified
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}><CheckCircle2 size={12} /> Verified</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#b45309' }}><AlertCircle size={12} /> Not verified</span>}
          {!emailForm && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEmailForm({ email: '', currentPassword: '' })}>
              Change email
            </button>
          )}
        </div>
        {emailForm && (
          <form onSubmit={saveEmail} style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={label} htmlFor="pf-email">New email</label>
              <input id="pf-email" type="email" className="form-input w-full" value={emailForm.email} onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value }))} autoComplete="email" />
            </div>
            <div>
              <label style={label}>Current password</label>
              <PasswordField value={emailForm.currentPassword} onChange={(v) => setEmailForm((f) => ({ ...f, currentPassword: v }))} autoComplete="current-password" />
            </div>
            <p style={{ ...hint, gridColumn: '1 / -1', margin: 0 }}>We'll send a link to the new address to confirm it. You sign in with the new email from now on.</p>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEmailForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingEmail}>
                {savingEmail ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Update email
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Password ── */}
      <form onSubmit={savePassword} style={card}>
        <h3 style={title}><KeyRound size={16} /> Change password</h3>
        <p style={hint}>You stay signed in here; every other device is signed out.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 14 }}>
          <div>
            <label style={label}>Current password</label>
            <PasswordField value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} autoComplete="current-password" />
          </div>
          <div>
            <label style={label}>New password</label>
            <PasswordField value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} />
          </div>
          <div>
            <label style={label}>Confirm new password</label>
            <PasswordField value={pw.confirm} onChange={(v) => setPw((p) => ({ ...p, confirm: v }))} autoComplete="new-password" />
            {pwMismatch && <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 4 }}>Passwords don't match</div>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={savingPw || !pw.current || !pw.next || pwMismatch}>
            {savingPw ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Change password
          </button>
        </div>
      </form>
    </div>
  );
}
