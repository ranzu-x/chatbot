import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { MailCheck, MailX, Sparkles } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';
import { authAPI } from '../../services/api';
import { useResendVerification } from '../../hooks/useResendVerification';

const ROLE_HOME = { ADMIN: '/admin', RESELLER: '/agency', USER: '/agency' };

// The page the verification email's link opens (${FRONTEND_URL}/verify-email?token=…).
// Public: works whether or not the visitor is signed in (they may click the
// link on a different device than the one they signed up on). If they ARE
// signed in, their session is refreshed so the dashboard's "verify your
// email" banner disappears immediately.
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { resend, sending, cooldown } = useResendVerification();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This link is missing its verification token.');
      return;
    }
    authAPI.verifyEmail(token)
      .then(async () => {
        setStatus('success');
        if (localStorage.getItem('auth_token')) {
          try {
            const res = await authAPI.me();
            setUser(res.data.user);
          } catch {
            // The account is verified either way; refreshing the session is a nicety.
          }
        }
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.response?.data?.message || 'This verification link is invalid or has expired.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const home = ROLE_HOME[user?.role] || '/login';

  return (
    <div className="login-page">
      <div className="login-card animate-slide-up" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Sparkles size={20} />
        </div>

        {status === 'loading' && (
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Verifying your email…</h1>
            <div className="loading-spinner" style={{ margin: '18px auto 4px' }} />
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <MailCheck size={26} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Email verified</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              Thanks — your account is verified. You're all set.
            </p>
            <button type="button" className="btn btn-primary" style={{ padding: '9px 22px' }} onClick={() => navigate(user ? home : '/login', { replace: true })}>
              {user ? 'Continue to your dashboard' : 'Sign in'}
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <MailX size={26} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Verification failed</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>{message}</p>
            {user ? (
              <button type="button" className="btn btn-primary" style={{ padding: '9px 22px' }} disabled={sending || cooldown > 0} onClick={resend}>
                {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send me a new link'}
              </button>
            ) : (
              <Link to="/login" className="btn btn-primary" style={{ padding: '9px 22px' }}>Sign in to request a new link</Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
