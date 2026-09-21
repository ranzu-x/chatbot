import Swal from 'sweetalert2';
import toast from 'react-hot-toast';


export const showAlert = {
  success: (title, text = '') => {
    return Swal.fire({
      icon: 'success',
      title: title || 'Success!',
      text: typeof text === 'string' ? text : JSON.stringify(text),
      confirmButtonColor: '#25d366',
      confirmButtonText: 'OK',
    });
  },

  error: (title, text = '') => {
    return Swal.fire({
      icon: 'error',
      title: title || 'Error',
      text: typeof text === 'string' ? text : (text?.message || JSON.stringify(text)),
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'OK',
    });
  },

  warning: (title, text = '') => {
    return Swal.fire({
      icon: 'warning',
      title: title || 'Warning',
      text: typeof text === 'string' ? text : JSON.stringify(text),
      confirmButtonColor: '#f59e0b',
      confirmButtonText: 'OK',
    });
  },

  info: (title, text = '') => {
    return Swal.fire({
      icon: 'info',
      title: title || 'Information',
      text: typeof text === 'string' ? text : JSON.stringify(text),
      confirmButtonColor: '#6366f1',
      confirmButtonText: 'OK',
    });
  },

  confirm: async (optionsOrTitle, text, confirmButtonText = 'Yes, continue') => {
    let title = optionsOrTitle;
    let desc = text;
    let btnText = confirmButtonText;

    if (typeof optionsOrTitle === 'object' && optionsOrTitle !== null) {
      title = optionsOrTitle.title || 'Are you sure?';
      desc = optionsOrTitle.text || 'This action cannot be undone.';
      btnText = optionsOrTitle.confirmButtonText || 'Yes, continue';
    }

    const res = await Swal.fire({
      title: title || 'Are you sure?',
      text: desc || 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: btnText,
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });
    return res.isConfirmed;
  },

  limit: (title, text = '', options = {}) => {
    return showLimitModal({ title, message: text, ...options });
  },
};

/**
 * Interactive SweetAlert modal for plan quota / limit reached boundaries.
 * Provides clear information and direct action (e.g. Upgrade Plan) rather than an auto-dismissing toast.
 */
export const showLimitModal = ({
  title = 'Account Limit Reached',
  message,
  currentUsage,
  maxLimit,
  userRole,
  onUpgrade,
} = {}) => {
  const isReseller = userRole === 'RESELLER';
  const displayMsg =
    message ||
    (maxLimit !== undefined && maxLimit !== null
      ? `You have reached the maximum of ${maxLimit} connected account(s) allowed by your current plan${
          currentUsage !== undefined ? ` (currently using ${currentUsage})` : ''
        }. Please upgrade your package to connect more accounts.`
      : 'You have reached the connected account limit for your current package. Please upgrade your plan to connect additional accounts.');

  return Swal.fire({
    title: `<span style="font-weight:800; font-size:1.25rem; color:#0f172a;">${title}</span>`,
    html: `
      <div style="font-size:0.92rem; color:#475569; line-height:1.55; margin-top:8px;">
        ${displayMsg}
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: isReseller ? 'Upgrade Plan' : 'View Plans',
    cancelButtonText: 'Dismiss',
    reverseButtons: true,
  }).then((result) => {
    if (result.isConfirmed) {
      if (typeof onUpgrade === 'function') {
        onUpgrade();
      } else if (typeof window !== 'undefined') {
        window.location.href = isReseller ? '/account?tab=billing' : '/account';
      }
    }
    return result;
  });
};

/**
 * Inspects an API error: if it represents a capacity limit error (403 LIMIT_EXCEEDED),
 * shows the SweetAlert limit modal and returns true. Otherwise returns false.
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

export const notify = {
  success: (msg) =>
    toast.success(msg, {
      duration: 4000,
    }),

  error: (msg) =>
    toast.error(msg, {
      duration: 5000,
    }),

  info: (msg) =>
    toast(msg, {
      duration: 4000,
    }),

  loading: (msg) => toast.loading(msg),

  dismiss: (id) => toast.dismiss(id),
};

export default { showAlert, notify, showLimitModal, handleLimitError };
