import { Link } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export default function ChannelBreadcrumb({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' }}>
      <Link
        to="/connect-accounts"
        className="channel-breadcrumb-back"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          padding: '7px 12px 7px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
      >
        <ArrowLeft size={14} />
        Connect Accounts
      </Link>
      <ChevronRight size={14} color="var(--text-muted)" />
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{current}</span>
      <style>{`
        .channel-breadcrumb-back:hover {
          background: var(--bg-hover) !important;
          color: var(--text-primary) !important;
          border-color: var(--primary) !important;
        }
      `}</style>
    </div>
  );
}
