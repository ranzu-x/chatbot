import { useState } from 'react';
import { MailWarning, RefreshCw } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';
import { authAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { useResendVerification } from '../../hooks/useResendVerification';

/**
 * Shown across the dashboard until the signed-in user verifies their email.
 * Soft enforcement: it never blocks anything, it just keeps asking (and the
 * Community Forum won't let an unverified user post). Platform staff
 * (ADMIN) never see it. Accounts that existed before verification shipped
 * were backfilled as verified (migrate_verify_existing_users.js).
 */
export default function EmailVerifyBanner() {
  const { user, setUser } = useAuth();
  const { resend, sending, cooldown } = useResendVerification();
  const [checking, setChecking] = useState(false);

  if (!user || user.emailVerified !== false || user.role === 'ADMIN') return null;

  // The link may have been clicked on another device/tab — re-read the account.
  const refresh = async () => {
    setChecking(true);
    try {
      const res = await authAPI.me();
      setUser(res.data.user);
      if (res.data.user?.emailVerified) notify.success('Email verified — thank you!');
      else notify.error("Not verified yet — open the link in the email we sent you.");
    } catch {
      notify.error('Could not check your status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const onResend = async () => {
    const result = await resend();
    if (result === 'already') refresh();
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 20px', background: '#fef3c7', borderBottom: '1px solid #fde68a', color: '#92400e',
      }}
    >
      <MailWarning size={17} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 220, fontSize: '0.84rem', fontWeight: 600 }}>
        Please verify your email address. We sent a link to <strong>{user.email}</strong> — click it to verify your account.
      </span>
      <button
        type="button"
        onClick={onResend}
        disabled={sending || cooldown > 0}
        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #92400e', background: 'transparent', color: '#92400e', fontWeight: 700, fontSize: '0.78rem', cursor: sending || cooldown > 0 ? 'not-allowed' : 'pointer', opacity: sending || cooldown > 0 ? 0.6 : 1 }}
      >
        {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
      </button>
      <button
        type="button"
        onClick={refresh}
        disabled={checking}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
      >
        <RefreshCw size={12} className={checking ? 'animate-spin' : ''} /> I've verified
      </button>
    </div>
  );
}
