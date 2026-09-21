import { Toaster, toast, resolveValue } from 'react-hot-toast';
import { X } from 'lucide-react';
import './AppToaster.css';

const Icon = ({ type }) => {
  if (type === 'loading') return <span className="app-toast__spinner" />;
  const glyph = {
    success: <path d="M7.5 12.5l3 3 6-6.5" />,
    error: <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />,
    blank: <path d="M12 11v5M12 7.8v.4" />,
  }[type] || <path d="M12 11v5M12 7.8v.4" />;
  return (
    <svg className="app-toast__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {glyph}
      </g>
    </svg>
  );
};

/**
 * App-wide toast host. Pastel filled card, status icon on the left,
 * message in the middle, close (X) button on the right.
 */
export default function AppToaster() {
  return (
    <Toaster position="top-right" reverseOrder={false} gutter={10}>
      {(t) => {
        const type = t.type === 'custom' ? 'blank' : t.type;
        return (
          <div
            className={`app-toast app-toast--${type} ${t.visible ? 'is-in' : 'is-out'}`}
            role={type === 'error' ? 'alert' : 'status'}
            {...t.ariaProps}
          >
            {t.icon ? (
              <span className="app-toast__icon app-toast__emoji">{t.icon}</span>
            ) : (
              <Icon type={type} />
            )}
            <div className="app-toast__msg">{resolveValue(t.message, t)}</div>
            <button
              type="button"
              className="app-toast__close"
              aria-label="Dismiss"
              onClick={() => toast.dismiss(t.id)}
            >
              <X size={18} />
            </button>
          </div>
        );
      }}
    </Toaster>
  );
}
