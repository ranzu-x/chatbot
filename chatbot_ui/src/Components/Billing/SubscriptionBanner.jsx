import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, Clock } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';
import { notify } from '../../utils/alerts';

const WARN_DAYS = 7;
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });

/**
 * Plan status under the top bar (AppLayout): red when the plan has expired
 * and the workspace is read-only (chatbot_api/utils/subscriptionStatus.js),
 * amber in the last 7 days before it ends. Hidden for the Super Admin.
 */
export default function SubscriptionBanner() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const lastToast = useRef(0);

  // A refused change (402) means the plan just expired — show it now, not on next load.
  useEffect(() => {
    const onExpired = (e) => {
      refreshUser?.();
      if (Date.now() - lastToast.current > 15000) {
        lastToast.current = Date.now();
        notify.error(e.detail?.message || 'Your plan has expired — this workspace is read-only.');
      }
    };
    window.addEventListener('subscription:expired', onExpired);
    return () => window.removeEventListener('subscription:expired', onExpired);
  }, [refreshUser]);

  const sub = user?.subscription;
  if (!user || user.role === 'ADMIN' || !sub) return null;

  const renew = () => navigate('/my-account?tab=billing');
  const fromReseller = sub.source === 'RESELLER';

  if (sub.expired) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: '#fef2f2', borderBottom: '1px solid #fecaca', color: '#991b1b', fontSize: '0.84rem', flexWrap: 'wrap' }}>
        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 220 }}>
          {fromReseller
            ? "Your provider's plan has expired, so this workspace is read-only — you can view everything, but changes and automation are paused. Please contact your provider."
            : <>Your plan{sub.packageName ? ` (${sub.packageName})` : ''} expired{sub.endsAt ? ` on ${fmtDate(sub.endsAt)}` : ''}. This workspace is <strong>read-only</strong>: you can view everything, but changes, bots, broadcasts and other automation are paused until you renew.</>}
        </span>
        {!fromReseller && (
          <button type="button" onClick={renew} className="btn btn-primary btn-sm" style={{ background: '#dc2626', borderColor: '#dc2626' }}>
            Renew plan
          </button>
        )}
      </div>
    );
  }

  if (sub.endsAt && !fromReseller) {
    const daysLeft = Math.ceil((new Date(sub.endsAt).getTime() - Date.now()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= WARN_DAYS) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#92400e', fontSize: '0.82rem', flexWrap: 'wrap' }}>
          <Clock size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 220 }}>
            Your plan ends {daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`} ({fmtDate(sub.endsAt)}). Renew to keep everything running — after that the workspace becomes read-only.
          </span>
          <button type="button" onClick={renew} className="btn btn-secondary btn-sm">Renew</button>
        </div>
      );
    }
  }
  return null;
}
