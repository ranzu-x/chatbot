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
};


export const notify = {
  success: (msg) =>
    toast.success(msg, {
      duration: 4000,
      style: { background: '#0f172a', color: '#ffffff', fontSize: '0.85rem', borderRadius: '10px' },
    }),

  error: (msg) =>
    toast.error(msg, {
      duration: 5000,
      style: { background: '#0f172a', color: '#ffffff', fontSize: '0.85rem', borderRadius: '10px' },
    }),

  info: (msg) =>
    toast(msg, {
      duration: 4000,
      icon: 'K︎',
      style: { background: '#0f172a', color: '#ffffff', fontSize: '0.85rem', borderRadius: '10px' },
    }),

  loading: (msg) =>
    toast.loading(msg, {
      style: { background: '#0f172a', color: '#ffffff', fontSize: '0.85rem', borderRadius: '10px' },
    }),

  dismiss: (id) => toast.dismiss(id),
};

export default { showAlert, notify };
