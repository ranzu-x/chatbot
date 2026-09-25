import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { KeyRound, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../../services/api';

const MIN_LENGTH = 8; // mirrors MIN_PASSWORD_LENGTH in chatbot_api/utils/passwordReset.js

// Step 2 of password reset: the page the emailed link opens
// (${FRONTEND_URL}/reset-password?token=…). Public. A successful reset signs
// every session out, including this browser's, so the user signs in fresh.
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(token ? '' : 'This reset link is missing its token. Request a new one.');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) { setError(`Password must be at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setError('');
    setSaving(true);
    try {
      await authAPI.resetPassword(token, password);
      try { localStorage.removeItem('auth_token'); } catch { /* storage unavailable */ }
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not reset the password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-slide-up" style={{ maxWidth: 420 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          {done ? <CheckCircle2 size={20} /> : <KeyRound size={20} />}
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Password changed</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              You've been signed out everywhere. Sign in with your new password.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ padding: '9px 22px' }}>Sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 18px', textAlign: 'center' }}>Choose a new password</h1>
            <div className="form-group">
              <label className="form-label" htmlFor="reset-password">New password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="reset-password"
                  type={show ? 'text' : 'password'}
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  disabled={!token}
                  style={{ paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>At least {MIN_LENGTH} characters.</span>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reset-confirm">Confirm new password</label>
              <input
                id="reset-confirm"
                type={show ? 'text' : 'password'}
                className="form-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                disabled={!token}
              />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 10 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving || !token}>
              {saving ? 'Saving…' : 'Set new password'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: '0.84rem' }}>
              <Link to="/forgot-password">Request a new link</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
