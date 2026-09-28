import { useState } from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

/**
 * Second sign-in step when the account has two-factor login on: the
 * 6-digit code from the authenticator app, or a one-time backup code.
 * `onSubmit({ code } | { backupCode })` returns a promise; errors are shown by the parent.
 */
export default function TwoFactorStep({ onSubmit, onBack, loading, error, primaryColor = '#2563eb' }) {
  const [useBackup, setUseBackup] = useState(false);
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onSubmit(useBackup ? { backupCode: v } : { code: v.replace(/\s+/g, '') });
  };

  return (
    <form className="login-form" onSubmit={submit}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <ShieldCheck size={30} color={primaryColor} />
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '6px 0 4px', color: '#0f172a' }}>Two-factor sign-in</h2>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
          {useBackup ? 'Enter one of the backup codes you saved. Each code works once.' : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div className="form-group">
        <input
          className="form-input"
          autoFocus
          inputMode={useBackup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          maxLength={useBackup ? 20 : 7}
          placeholder={useBackup ? 'xxxxx-xxxxx' : '123456'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: useBackup ? 1 : 6, fontFamily: 'var(--font-mono)' }}
        />
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || !value.trim()} style={{ background: primaryColor, justifyContent: 'center' }}>
        {loading ? 'Checking…' : 'Verify'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: '0.78rem' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={13} /> Back
        </button>
        <button type="button" onClick={() => { setUseBackup((b) => !b); setValue(''); }} style={{ background: 'none', border: 'none', color: primaryColor, cursor: 'pointer', fontWeight: 600 }}>
          {useBackup ? 'Use the app code instead' : 'Use a backup code'}
        </button>
      </div>
    </form>
  );
}
