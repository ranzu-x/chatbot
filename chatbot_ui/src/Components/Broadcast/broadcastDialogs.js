import Swal from 'sweetalert2';

// Confirmation dialogs for saving / sending a broadcast — shared by the Flow
// Builder's Review & Send dialog and the Broadcasting page's Configure and Send,
// so both ask the same questions. Every number shown comes from the server's
// audience calculation (routes/broadcasts.js); the server also refuses an
// unconfirmed "no filter" / large audience on send (409), so these can't be
// skipped by calling the API directly.

const cssVar = (name, fallback) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
};

/**
 * A WhatsApp "Inside 24 hours" (WINDOW) broadcast can't be scheduled — only
 * sent now. Mirrors canSchedule in routes/broadcasts.js (which enforces it).
 */
export function canScheduleBroadcast(platform, mode) {
  return !(String(platform || '').toUpperCase() === 'WHATSAPP' && mode === 'WINDOW');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const plural = (n) => (Number(n) === 1 ? 'subscriber' : 'subscribers');

const baseOptions = () => ({
  showCancelButton: true,
  reverseButtons: true,
  focusCancel: true,
  cancelButtonText: 'Cancel',
  confirmButtonColor: cssVar('--primary', '#2563eb'),
  cancelButtonColor: '#94a3b8',
});

async function ask(options) {
  const res = await Swal.fire({ ...baseOptions(), ...options });
  return res.isConfirmed;
}

/**
 * Walks the user through the audience warnings, then the final confirmation.
 * `audience` = { audienceCount, noFilter, largeAudienceThreshold } from the server.
 * `action` = 'draft' | 'send' | 'schedule'. Resolves true only if every step was confirmed.
 */
export async function confirmBroadcastAudience({ audience, action, accountLabel, scheduledAt }) {
  const count = audience?.audienceCount ?? 0;
  const threshold = audience?.largeAudienceThreshold ?? Infinity;

  if (audience?.noFilter) {
    const ok = await ask({
      icon: 'warning',
      title: 'No Audience Filter Selected',
      html: `No label or subscriber has been selected.<br/>This broadcast will be sent to <strong>all eligible subscribers</strong>${accountLabel ? ` of <strong>${esc(accountLabel)}</strong>` : ''} — ${fmt(count)} ${plural(count)} right now.<br/><br/>Do you want to continue?`,
      confirmButtonText: 'Continue',
    });
    if (!ok) return false;
  }

  if (count >= threshold) {
    const ok = await ask({
      icon: 'warning',
      title: 'Large Audience Warning',
      html: `This broadcast is configured to reach <strong>${fmt(count)} ${plural(count)}</strong>.<br/><br/>Please confirm that you want to continue.`,
      confirmButtonText: 'Continue',
    });
    if (!ok) return false;
  }

  const reach = `<strong>${fmt(count)} ${plural(count)}</strong>`;
  if (action === 'draft') {
    return ask({
      icon: 'question',
      title: 'Save Broadcasting Draft?',
      html: `This broadcast is currently configured to reach approximately ${reach}.<br/><br/>Do you want to save this broadcasting as a draft? Nothing will be sent yet.`,
      confirmButtonText: 'Save Draft',
    });
  }
  if (action === 'schedule') {
    return ask({
      icon: 'question',
      title: 'Schedule Broadcast?',
      html: `This broadcast will be sent to ${reach} on <strong>${esc(new Date(scheduledAt).toLocaleString())}</strong>.`,
      confirmButtonText: 'Schedule',
    });
  }
  return ask({
    icon: 'question',
    title: 'Send Broadcast Now?',
    html: `This broadcast will start sending to ${reach} immediately. This can't be undone.`,
    confirmButtonText: 'Send Now',
  });
}

/** Success alert after sending / scheduling; resolves true when "Go to Broadcasting" was clicked. */
export async function showSendStarted({ scheduledAt, rescheduled } = {}) {
  const res = await Swal.fire({
    icon: 'success',
    title: scheduledAt ? (rescheduled ? 'Broadcast Rescheduled' : 'Broadcast Scheduled') : 'Broadcast Started',
    html: scheduledAt
      ? `It will be sent on <strong>${esc(new Date(scheduledAt).toLocaleString())}</strong>.`
      : 'Sending has started. You can follow its progress on the Broadcasting page.',
    confirmButtonText: 'Go to Broadcasting',
    confirmButtonColor: cssVar('--primary', '#2563eb'),
  });
  return res.isConfirmed;
}

export function showBroadcastError(err, fallback = 'Something went wrong') {
  const data = err?.response?.data;
  const list = Array.isArray(data?.errors) && data.errors.length > 1
    ? `<ul style="text-align:left;margin:8px 0 0;padding-left:18px">${data.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
    : '';
  return Swal.fire({
    icon: 'error',
    title: 'Not ready yet',
    html: `${esc(data?.message || err?.message || fallback)}${list}`,
    confirmButtonColor: cssVar('--primary', '#2563eb'),
  });
}
