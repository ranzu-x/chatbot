import { useState } from 'react';
import { Link } from 'react-router';
import { MessageSquare, ArrowRight, Menu, X, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';

// The one nav bar for every public marketing page (Landing, Pricing, Blog,
// Privacy Policy, Terms of Service) — previously each page hand-rolled its
// own copy with drifting links, so navigating between them looked like the
// whole page (including the menu) reloaded. Rendered once by PublicLayout.
export default function LandingNavbar() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/agency';

  const links = [
    { to: '/landing#features', label: 'Features' },
    { to: '/landing#benefits', label: 'Benefits' },
    { to: '/landing#how-it-works', label: 'How It Works' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/blog', label: 'Blog' },
    { to: '/forum', label: 'Forum' },
    { to: '/privacy-policy', label: 'Privacy Policy' },
    { to: '/terms-of-service', label: 'Terms' },
  ];

  return (
    <nav className="lp-navbar">
      <div className="lp-container">
        <div className="lp-nav-inner">
          <Link to="/landing" className="lp-logo">
            <div className="lp-logo-icon">
              <MessageSquare size={20} />
            </div>
            <span>Nexa AI Chat</span>
          </Link>

          <div className="lp-nav-links">
            {links.map((l) => (
              <Link key={l.label} to={l.to} className="lp-nav-link">{l.label}</Link>
            ))}
          </div>

          <div className="lp-nav-actions">
            {user ? (
              <Link to={dashboardPath} className="lp-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-btn-login">Sign In</Link>
                <Link to="/register" className="lp-btn-primary">
                  Get Started Free <ArrowRight size={16} />
                </Link>
              </>
            )}
          </div>

          <button
            className="lp-mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="lp-mobile-menu">
          {links.map((l) => (
            <Link key={l.label} to={l.to} className="lp-nav-link" onClick={() => setMenuOpen(false)}>{l.label}</Link>
          ))}
          {user ? (
            <div style={{ marginTop: '8px' }}>
              <Link to={dashboardPath} className="lp-btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={() => setMenuOpen(false)}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <Link to="/login" className="lp-btn-login" style={{ flex: 1, textAlign: 'center' }} onClick={() => setMenuOpen(false)}>Sign In</Link>
              <Link to="/register" className="lp-btn-primary" style={{ flex: 1, textAlign: 'center' }} onClick={() => setMenuOpen(false)}>Get Started</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
