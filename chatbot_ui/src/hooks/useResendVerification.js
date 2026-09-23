import { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { notify } from '../utils/alerts';

/**
 * "Resend verification email" with the server's one-per-minute limit
 * mirrored as a visible countdown, so the button explains itself instead of
 * just failing. Pass `initialCooldown` when an email was JUST sent (e.g. right
 * after signup) so the button starts in its waiting state.
 */
export function useResendVerification(initialCooldown = 0) {
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Resolves 'sent' | 'already' | 'wait' | 'error' so callers can react (e.g. refresh the session on 'already'). */
  const resend = useCallback(async () => {
    setSending(true);
    try {
      const res = await authAPI.resendVerification();
      if (res.data?.alreadyVerified) {
        notify.success('Your email is already verified.');
        return 'already';
      }
      setCooldown(res.data?.retryAfterSeconds || 60);
      notify.success('Verification email sent — check your inbox (and spam folder).');
      return 'sent';
    } catch (err) {
      if (err?.response?.status === 429) {
        setCooldown(err.response.data?.retryAfterSeconds || 60);
        notify.error(err.response.data?.message || 'Please wait a moment before requesting another email.');
        return 'wait';
      }
      notify.error(err?.response?.data?.message || 'Could not send the email. Please try again shortly.');
      return 'error';
    } finally {
      setSending(false);
    }
  }, []);

  return { resend, sending, cooldown };
}
