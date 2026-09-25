import { useState } from 'react';
import { Link } from 'react-router';
import { KeyRound, MailCheck } from 'lucide-react';
import { authAPI } from '../../services/api';

// Step 1 of password reset: ask for the email. The API answers the same way
// whether or not an account exists, so this page does too.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await authAPI.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err?.response?.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-slide-up" style={{ maxWidth: 420 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          {sent ? <MailCheck size={20} /> : <KeyRound size={20} />}
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Check your email</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              If an account exists for <strong>{email.trim()}</strong>, we've sent a link to reset the password. It expires in 1 hour.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ padding: '9px 22px' }}>Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', textAlign: 'center' }}>Forgot your password?</h1>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '0 0 18px', textAlign: 'center' }}>
              Enter your account email and we'll send you a link to choose a new one.
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 10 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={sending}>
              {sending ? 'Sending…' : 'Send reset link'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: '0.84rem' }}>
              <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
