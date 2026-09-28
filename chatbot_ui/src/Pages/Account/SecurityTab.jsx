import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, KeyRound, Copy, Download, Loader2, LogOut, Smartphone } from 'lucide-react';
import { authAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { notify, showAlert } from '../../utils/alerts';

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 18 };
const hint = { fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' };

function BackupCodes({ codes, onDone }) {
  const text = codes.join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); notify.success('Codes copied'); } catch { notify.error('Copy failed'); } };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`Backup codes — each works once\n\n${text}\n`], { type: 'text/plain' }));
    a.download = 'backup-codes.txt';
    a.click();
  };
  return (
    <div style={{ marginTop: 14, padding: 14, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10 }}>
      <strong style={{ fontSize: '0.86rem' }}>Save these backup codes now</strong>
      <p style={hint}>If you lose your phone, each code signs you in once. They won't be shown again.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, margin: '12px 0', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Copy size={13} /> Copy</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}><Download size={13} /> Download</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>I've saved them</button>
      </div>
    </div>
  );
}

/** Confirm with password + a current code (or a backup code) — for turning 2FA off / new backup codes. */
function Confirm({ title, action, danger, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const isBackup = /[a-z-]/i.test(code);
    try { await onConfirm({ password, ...(isBackup ? { backupCode: code } : { code }) }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 14, padding: 14, border: '1px solid #e2e8f0', borderRadius: 10, display: 'grid', gap: 10, maxWidth: 360 }}>
      <strong style={{ fontSize: '0.86rem' }}>{title}</strong>
      <input className="form-input" type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <input className="form-input" placeholder="Code from the app, or a backup code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} required />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{busy && <Loader2 size={13} className="animate-spin" />} {action}</button>
      </div>
    </form>
  );
}

/**
 * My Account → Security. Two-factor sign-in (optional for every user —
 * chatbot_api/utils/totp.js) and "sign out of all devices".
 */
export default function SecurityTab() {
  const { signOutEverywhere } = useAuth();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null); // { qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState(null);
  const [confirming, setConfirming] = useState(null); // 'disable' | 'codes'

  const load = () => authAPI.getTwoFactor().then((res) => setStatus(res.data)).catch(() => setStatus({ enabled: false }));
  useEffect(() => { load(); }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await authAPI.setupTwoFactor();
      setSetup(res.data);
      setCode('');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not start the setup');
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authAPI.enableTwoFactor(code.replace(/\s+/g, ''));
      setSetup(null);
      setBackupCodes(res.data.backupCodes);
      notify.success('Two-factor sign-in is on');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'That code is not right');
    } finally {
      setBusy(false);
    }
  };

  const disable = async (data) => {
    try {
      await authAPI.disableTwoFactor(data);
      setConfirming(null);
      notify.success('Two-factor sign-in is off');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not turn it off');
    }
  };

  const regenerate = async (data) => {
    try {
      const res = await authAPI.newBackupCodes(data);
      setConfirming(null);
      setBackupCodes(res.data.backupCodes);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not create new codes');
    }
  };

  const everywhere = async () => {
    const ok = await showAlert.confirm({
      title: 'Sign out of all other devices?',
      text: 'Every other browser, phone and tab signed in to your account is signed out now. This one stays signed in.',
      confirmButtonText: 'Sign out everywhere',
    });
    if (!ok) return;
    try {
      await signOutEverywhere();
      notify.success('Signed out of all other devices');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not sign out other devices');
    }
  };

  if (!status) return <div style={{ padding: 30 }}><Loader2 className="animate-spin" size={20} /></div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              {status.enabled ? <ShieldCheck size={18} color="#16a34a" /> : <Smartphone size={18} color="#64748b" />} Two-factor sign-in
              <span className={`badge ${status.enabled ? 'badge-success' : 'badge-muted'}`}>{status.enabled ? 'On' : 'Off'}</span>
            </div>
            <p style={hint}>
              After your password, you also enter a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).
              Someone who learns your password still can't get in.
            </p>
            {status.enabled && <p style={hint}>Backup codes left: <strong>{status.backupCodesLeft}</strong></p>}
          </div>
        </div>

        {!status.enabled && !setup && (
          <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={startSetup} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Turn on
          </button>
        )}

        {setup && (
          <form onSubmit={enable} style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ border: '1px solid #e2e8f0', borderRadius: 10 }} />
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: '0.84rem' }}>
                <strong>1.</strong> Scan this QR code with your authenticator app.
                <div style={{ ...hint, marginTop: 6 }}>Can't scan? Enter this key instead:</div>
                <code style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              </div>
              <div style={{ fontSize: '0.84rem' }}><strong>2.</strong> Enter the 6-digit code the app shows.</div>
              <input className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 180, letterSpacing: 4, fontFamily: 'var(--font-mono)' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSetup(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || code.replace(/\s+/g, '').length !== 6}>{busy && <Loader2 size={13} className="animate-spin" />} Verify and turn on</button>
              </div>
            </div>
          </form>
        )}

        {backupCodes && <BackupCodes codes={backupCodes} onDone={() => setBackupCodes(null)} />}

        {status.enabled && !confirming && !backupCodes && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming('codes')}><KeyRound size={13} /> New backup codes</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming('disable')}><ShieldOff size={13} /> Turn off</button>
          </div>
        )}
        {confirming === 'disable' && <Confirm title="Turn off two-factor sign-in" action="Turn off" danger onConfirm={disable} onCancel={() => setConfirming(null)} />}
        {confirming === 'codes' && <Confirm title="Create new backup codes (the old ones stop working)" action="Create codes" onConfirm={regenerate} onCancel={() => setConfirming(null)} />}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}><LogOut size={18} color="#64748b" /> Signed-in devices</div>
        <p style={hint}>Lost a device or signed in on a shared computer? Sign out everywhere else — this browser stays signed in.</p>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={everywhere}>Sign out of all other devices</button>
      </div>
    </div>
  );
}
