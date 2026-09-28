import { alert } from '../../lib/alerts';

// Confirmation dialogs for saving / sending a broadcast — shared by the Flow
// Builder's Review & Send dialog and the Broadcasting page's Configure and Send,
// so both ask the same questions. Every number shown comes from the server's
// audience calculation (routes/broadcasts.js); the server also refuses an
// unconfirmed "no filter" / large audience on send (409), so these can't be
// skipped by calling the API directly.

/**
 * A WhatsApp "Inside 24 hours" (WINDOW) broadcast can't be scheduled — only
 * sent now. Mirrors canSchedule in routes/broadcasts.js (which enforces it).
 */
export function canScheduleBroadcast(platform, mode) {
  return !(String(platform || '').toUpperCase() === 'WHATSAPP' && mode === 'WINDOW');
}

/** A Messenger "Utility template" broadcast (mirrors needsUtilityConfirmation in routes/broadcasts.js). */
export function isUtilityBroadcast(platform, mode) {
  return String(platform || '').toUpperCase() === 'FACEBOOK' && mode === 'TEMPLATE';
}

const fmt = (n) => Number(n || 0).toLocaleString();
const plural = (n) => (Number(n) === 1 ? 'subscriber' : 'subscribers');
const reachFact = (count) => ({ label: 'Audience', value: `${fmt(count)} ${plural(count)}` });

/**
 * Walks the user through the audience warnings, then the final confirmation.
 * `audience` = { audienceCount, noFilter, largeAudienceThreshold } from the server.
 * `action` = 'draft' | 'send' | 'schedule'. Resolves true only if every step was confirmed.
 */
export async function confirmBroadcastAudience({ audience, action, accountLabel, scheduledAt, utility = false }) {
  const count = audience?.audienceCount ?? 0;
  const threshold = audience?.largeAudienceThreshold ?? Infinity;

  // Messenger Utility broadcast: allowed only as a personal, transactional
  // update to each subscriber — Meta counts announcements as marketing.
  if (utility && action !== 'draft') {
    const ok = await alert.confirm({
      tone: 'info',
      focusCancel: true,
      title: 'Personal update for each subscriber?',
      text: 'Messenger Utility templates may only carry an order, account, appointment or event update that applies to the person receiving it.\n\nGeneral announcements, offers or news are marketing — Meta can restrict the Page for sending them this way.',
      check: { label: 'Each subscriber gets their own transactional update — not an announcement or promotion.', required: true },
      confirm: 'Continue',
      confirmTone: 'primary',
    });
    if (!ok) return false;
  }

  if (audience?.noFilter) {
    const ok = await alert.confirm({
      tone: 'warning',
      focusCancel: true,
      title: 'No Audience Filter Selected',
      text: `No label or subscriber has been selected. This broadcast will be sent to all eligible subscribers${accountLabel ? ` of ${accountLabel}` : ''}.\n\nDo you want to continue?`,
      facts: [reachFact(count)],
      confirm: 'Continue',
    });
    if (!ok) return false;
  }

  if (count >= threshold) {
    const ok = await alert.confirm({
      tone: 'warning',
      focusCancel: true,
      title: 'Large Audience Warning',
      text: 'This broadcast is configured to reach a large audience. Please confirm that you want to continue.',
      facts: [reachFact(count)],
      confirm: 'Continue',
    });
    if (!ok) return false;
  }

  if (action === 'draft') {
    return alert.confirm({
      tone: 'primary',
      focusCancel: true,
      title: 'Save Broadcasting Draft?',
      text: 'Do you want to save this broadcasting as a draft? Nothing will be sent yet.',
      facts: [reachFact(count)],
      confirm: 'Save Draft',
    });
  }
  if (action === 'schedule') {
    return alert.confirm({
      tone: 'primary',
      focusCancel: true,
      title: 'Schedule Broadcast?',
      text: 'This broadcast will be sent at the scheduled time.',
      facts: [reachFact(count), { label: 'On', value: new Date(scheduledAt).toLocaleString() }],
      confirm: 'Schedule',
    });
  }
  return alert.confirm({
    tone: 'primary',
    focusCancel: true,
    title: 'Send Broadcast Now?',
    text: "This broadcast will start sending immediately. This can't be undone.",
    facts: [reachFact(count)],
    confirm: 'Send Now',
  });
}

/** Success alert after sending / scheduling; resolves true when "Go to Broadcasting" was clicked. */
export function showSendStarted({ scheduledAt, rescheduled } = {}) {
  return alert.success({
    title: scheduledAt ? (rescheduled ? 'Broadcast Rescheduled' : 'Broadcast Scheduled') : 'Broadcast Started',
    text: scheduledAt
      ? 'It will be sent at the scheduled time.'
      : 'Sending has started. You can follow its progress on the Broadcasting page.',
    facts: scheduledAt ? [{ label: 'On', value: new Date(scheduledAt).toLocaleString() }] : undefined,
    confirm: 'Go to Broadcasting',
  });
}

export function showBroadcastError(err, fallback = 'Something went wrong') {
  const data = err?.response?.data;
  const items = Array.isArray(data?.errors) && data.errors.length > 1 ? data.errors.map(String) : undefined;
  return alert.error({
    title: 'Not ready yet',
    text: data?.message || err?.message || fallback,
    items,
  });
}
