// App-wide alert helpers — thin wrappers over the in-house alert library
// (src/lib/alerts). Kept so the many existing `showAlert.*` / `notify.*`
// callers keep working; new code can import `alert` / `toast` directly.
import { alert, toast } from '../lib/alerts';

const asText = (text) => {
  if (text == null || text === '') return '';
  if (typeof text === 'string') return text;
  if (typeof text?.message === 'string') return text.message;
  try { return JSON.stringify(text); } catch { return String(text); }
};

export const showAlert = {
  success: (title, text = '') => alert.success({ title: title || 'Success!', text: asText(text) }),
  error: (title, text = '') => alert.error({ title: title || 'Error', text: asText(text) }),
  warning: (title, text = '') => alert.warning({ title: title || 'Warning', text: asText(text) }),
  info: (title, text = '') => alert.info({ title: title || 'Information', text: asText(text) }),

  /** Resolves true when confirmed. Red (danger) like before. */
  confirm: (optionsOrTitle, text, confirmButtonText = 'Yes, continue') => {
    if (typeof optionsOrTitle === 'object' && optionsOrTitle !== null) {
      const o = optionsOrTitle;
      return alert.confirm({
        ...o,
        title: o.title || 'Are you sure?',
        text: o.text || 'This action cannot be undone.',
        confirm: o.confirm || o.confirmButtonText || 'Yes, continue',
        cancel: o.cancel || o.cancelButtonText || 'Cancel',
      });
    }
    return alert.confirm({
      title: optionsOrTitle || 'Are you sure?',
      text: text || 'This action cannot be undone.',
      confirm: confirmButtonText,
    });
  },

  limit: (title, text = '', options = {}) => showLimitModal({ title, message: text, ...options }),
};

/**
 * Plan quota / limit reached. Resolves true when the person chose to upgrade
 * (then runs `onUpgrade`, or opens the billing page).
 */
export const showLimitModal = async ({
  title = 'Account Limit Reached',
  message,
  currentUsage,
  maxLimit,
  userRole,
  onUpgrade,
  label,
} = {}) => {
  const isReseller = userRole === 'RESELLER';
  const displayMsg =
    message ||
    (maxLimit !== undefined && maxLimit !== null
      ? `You have reached the maximum of ${maxLimit} connected account(s) allowed by your current plan. Please upgrade your package to connect more accounts.`
      : 'You have reached the connected account limit for your current package. Please upgrade your plan to connect additional accounts.');

  const hasMeter = maxLimit !== undefined && maxLimit !== null && currentUsage !== undefined && currentUsage !== null;
  const ok = await alert.limit({
    title,
    text: displayMsg,
    used: hasMeter ? currentUsage : undefined,
    max: hasMeter ? maxLimit : undefined,
    label: label || 'Usage',
    confirm: isReseller ? 'Upgrade Plan' : 'View Plans',
    cancel: 'Not now',
  });
  if (ok) {
    if (typeof onUpgrade === 'function') onUpgrade();
    else if (typeof window !== 'undefined') window.location.href = isReseller ? '/account?tab=billing' : '/account';
  }
  return ok;
};

/**
 * Inspects an API error: if it represents a capacity limit error (403 LIMIT_EXCEEDED),
 * shows the limit dialog and returns true. Otherwise returns false.
 */
export const handleLimitError = (err, { userRole, onUpgrade } = {}) => {
  const res = err?.response;
  const data = res?.data;
  const isLimit =
    res?.status === 403 &&
    (data?.code === 'LIMIT_EXCEEDED' ||
      data?.code === 'RESELLER_POOL_LIMIT_EXCEEDED' ||
      (data?.message && /limit/i.test(data.message)));

  if (isLimit) {
    showLimitModal({
      title: 'Account Limit Reached',
      message: data.message,
      userRole,
      onUpgrade,
    });
    return true;
  }
  return false;
};

/** Older pages' `showToast(message, 'success'|'error'|'warning'|'info')` → the standard toaster. */
export const toastByType = (msg, type = 'success') => (toast[type] || toast.success)(msg);

export const notify = {
  success: (msg, opts) => toast.success(msg, opts),
  error: (msg, opts) => toast.error(msg, opts),
  warning: (msg, opts) => toast.warning(msg, opts),
  info: (msg, opts) => toast.info(msg, opts),
  loading: (msg, opts) => toast.loading(msg, opts),
  dismiss: (id) => toast.dismiss(id),
};

export { alert, toast };
export default { showAlert, notify, showLimitModal, handleLimitError };
