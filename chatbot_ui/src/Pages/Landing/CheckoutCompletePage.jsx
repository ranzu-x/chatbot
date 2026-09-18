import { useSearchParams, Link } from 'react-router';
import './landing.css';
import { MessageSquare, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.08)',
    title: 'Payment received!',
    body: "Your workspace is being set up now. We've sent your login details to your email — check your inbox in a minute or two.",
  },
  fail: {
    icon: XCircle,
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.08)',
    title: 'Payment failed',
    body: "Your payment didn't go through, so no account was created. You can try again with the same or a different payment method.",
  },
  cancel: {
    icon: AlertCircle,
    color: '#b45309',
    bg: 'rgba(180,83,9,0.08)',
    title: 'Checkout cancelled',
    body: 'You cancelled checkout before completing payment — no account was created.',
  },
};

export default function CheckoutCompletePage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') || 'success';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.success;
  const Icon = config.icon;

  return (
    <div className="lp-wrapper">
      <nav className="lp-navbar">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link to="/" className="lp-logo">
              <div className="lp-logo-icon"><MessageSquare size={20} /></div>
              <span>Nexa AI Chat</span>
            </Link>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: config.bg, color: config.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Icon size={30} />
        </div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 10px' }}>{config.title}</h1>
        <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.6, margin: '0 0 28px' }}>{config.body}</p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {status === 'success' ? (
            <Link to="/login" className="lp-btn-primary">Go to Login</Link>
          ) : (
            <Link to="/pricing" className="lp-btn-primary">Back to Pricing</Link>
          )}
          <Link to="/" className="lp-btn-secondary">Home</Link>
        </div>
      </div>
    </div>
  );
}
