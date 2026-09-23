import { useNavigate } from 'react-router';
import { Clock, ExternalLink } from 'lucide-react';

/**
 * BusinessHoursSettings legacy wrapper.
 * Business Hours is now a full, professional page at /settings/business-hours.
 */
export default function BusinessHoursSettings({ integrationId }) {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'rgba(37, 99, 235, 0.08)',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px auto',
        }}
      >
        <Clock size={26} />
      </div>
      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
        Business Hours & Availability
      </h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto 18px auto', lineHeight: 1.5 }}>
        Business hours configuration has moved to a dedicated full page with timezone detection, real-time operating status, live simulation, and multi-channel controls.
      </p>
      <button
        type="button"
        onClick={() => navigate('/settings/business-hours', { state: { selectedAccountId: integrationId } })}
        className="btn btn-primary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', fontSize: '0.85rem' }}
      >
        Open Business Hours Page <ExternalLink size={14} />
      </button>
    </div>
  );
}
