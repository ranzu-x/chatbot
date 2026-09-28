import { useState } from 'react';
import { Link } from 'react-router';
import { MessageSquare, ArrowRight, Menu, X, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';
import { assetUrl } from '../../services/api';
import usePublicSite from '../../hooks/usePublicSite';

// The one nav bar for every public marketing page (Landing, Pricing, Blog,
// Privacy Policy, Terms of Service) — previously each page hand-rolled its
// own copy with drifting links, so navigating between them looked like the
// whole page (including the menu) reloaded. Rendered once by PublicLayout.
// On a Reseller's address it shows the Reseller's brand and links instead
// (no platform blog / forum there — hooks/usePublicSite.js).
export default function LandingNavbar() {
  const { user } = useAuth();
  const publicSite = usePublicSite();
  const [menuOpen, setMenuOpen] = useState(false);
  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/agency';
  const isReseller = publicSite.kind === 'RESELLER';
  const site = publicSite.site || {};
  const brand = publicSite.brand || {};
  const allowRegistration = publicSite.allowRegistration !== false;

  const links = isReseller
    ? [
        { to: '/landing#features', label: 'Features' },
        ...(site.showPricing !== false && publicSite.plans?.length ? [{ to: '/landing#pricing', label: 'Pricing' }] : []),
        ...(site.showDocs !== false ? [{ to: site.docsUrl || '/docs', label: 'Docs', external: Boolean(site.docsUrl) }] : []),
        ...(site.faqs?.length ? [{ to: '/landing#faq', label: 'FAQ' }] : []),
      ]
    : [
        { to: '/landing#features', label: 'Features' },
        { to: '/landing#benefits', label: 'Benefits' },
        { to: '/landing#how-it-works', label: 'How It Works' },
        { to: '/pricing', label: 'Pricing' },
        { to: '/docs', label: 'Docs' },
        { to: '/blog', label: 'Blog' },
        { to: '/forum', label: 'Forum' },
        { to: '/privacy-policy', label: 'Privacy Policy' },
        { to: '/terms-of-service', label: 'Terms' },
      ];

  const renderLink = (l, extra = {}) => (l.external
    ? <a key={l.label} href={l.to} className="lp-nav-link" target="_blank" rel="noopener noreferrer" {...extra}>{l.label}</a>
    : <Link key={l.label} to={l.to} className="lp-nav-link" {...extra}>{l.label}</Link>);

  const logo = isReseller ? (
    <Link to="/landing" className="lp-logo">
      {brand.logoUrl ? (
        <img src={assetUrl(brand.logoUrl)} alt={brand.brandName || ''} style={{ height: 32, maxWidth: 180, objectFit: 'contain' }} />
      ) : (
        <>
          <div className="lp-logo-icon">
            {brand.logoIconUrl ? <img src={assetUrl(brand.logoIconUrl)} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} /> : <MessageSquare size={20} />}
          </div>
          <span>{brand.brandName || brand.name}</span>
        </>
      )}
    </Link>
  ) : (
    <Link to="/landing" className="lp-logo">
      <div className="lp-logo-icon">
        <MessageSquare size={20} />
      </div>
      <span>Nexa AI Chat</span>
    </Link>
  );

  return (
    <nav className="lp-navbar">
      <div className="lp-container">
        <div className="lp-nav-inner">
          {publicSite.loading ? <span className="lp-logo" aria-hidden="true" /> : logo}

          <div className="lp-nav-links">
            {!publicSite.loading && links.map((l) => renderLink(l))}
          </div>

          <div className="lp-nav-actions">
            {user ? (
              <Link to={dashboardPath} className="lp-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-btn-login">Sign In</Link>
                {allowRegistration && (
                  <Link to="/register" className="lp-btn-primary">
                    {isReseller ? (site.ctaLabel || 'Get started') : 'Get Started Free'} <ArrowRight size={16} />
                  </Link>
                )}
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
          {links.map((l) => renderLink(l, { onClick: () => setMenuOpen(false) }))}
          {user ? (
            <div style={{ marginTop: '8px' }}>
              <Link to={dashboardPath} className="lp-btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={() => setMenuOpen(false)}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <Link to="/login" className="lp-btn-login" style={{ flex: 1, textAlign: 'center' }} onClick={() => setMenuOpen(false)}>Sign In</Link>
              {allowRegistration && (
                <Link to="/register" className="lp-btn-primary" style={{ flex: 1, textAlign: 'center' }} onClick={() => setMenuOpen(false)}>Get Started</Link>
              )}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
