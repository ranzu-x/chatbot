import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  MessageSquare, Mail, LifeBuoy, ArrowUp,
  Twitter, Facebook, Linkedin, Instagram, Youtube,
} from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';
import PlatformIcon from '../../Components/Common/PlatformIcon';

// Real channels the platform connects to (see routes/channels.js /
// routes/integrations.js) — kept in sync with LandingPage.jsx's own list.
const CHANNELS = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'TIKTOK', 'WEBCHAT'];
const CHANNEL_LABELS = {
  WHATSAPP: 'WhatsApp', FACEBOOK: 'Messenger', INSTAGRAM: 'Instagram',
  TELEGRAM: 'Telegram', TIKTOK: 'TikTok', WEBCHAT: 'Webchat',
};

// Placeholder profile URLs — swap these for the real handles once they
// exist; left as "#" deliberately rather than guessed/fake URLs.
const SOCIAL_LINKS = [
  { icon: Twitter, label: 'Twitter / X', href: '#' },
  { icon: Facebook, label: 'Facebook', href: '#' },
  { icon: Linkedin, label: 'LinkedIn', href: '#' },
  { icon: Instagram, label: 'Instagram', href: '#' },
  { icon: Youtube, label: 'YouTube', href: '#' },
];

const PRODUCT_LINKS = [
  { to: '/landing#features', label: 'Features' },
  { to: '/landing#benefits', label: 'Benefits' },
  { to: '/landing#how-it-works', label: 'How It Works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/landing#faq', label: 'FAQ' },
];

const LEGAL_LINKS = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms-of-service', label: 'Terms of Service' },
];

const BADGES = [
  '6 Messaging Channels',
  'Built for Agencies & Resellers',
  'Multi-Tenant SaaS Platform',
];

// The one footer for every public marketing page — see LandingNavbar.jsx
// for why this was pulled out of each page into a shared component.
export default function LandingFooter() {
  const { user } = useAuth();
  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/agency';
  const year = new Date().getFullYear();

  // Back-to-top: only shown once the page has actually scrolled, so it
  // never crowds the hero on first load.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="lp-footer">
      {/* Decorative glow — purely visual, sits behind the content */}
      <div className="lp-footer-glow lp-footer-glow-1" aria-hidden="true" />
      <div className="lp-footer-glow lp-footer-glow-2" aria-hidden="true" />

      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-grid">
          {/* ── Brand column ── */}
          <div className="lp-footer-brand">
            <Link to="/landing" className="lp-footer-logo">
              <div className="lp-logo-icon" style={{ width: 34, height: 34 }}>
                <MessageSquare size={17} />
              </div>
              <span>Nexa AI Chat</span>
            </Link>

            <p className="lp-footer-tagline">
              The omnichannel AI chatbot platform for WhatsApp, Messenger, Instagram,
              Telegram, TikTok &amp; the web — automate conversations, capture leads,
              and scale support without scaling headcount.
            </p>

            <div className="lp-footer-channels" title="Supported channels">
              {CHANNELS.map((c) => (
                <span key={c} className="lp-footer-channel-tile" title={CHANNEL_LABELS[c]}>
                  <PlatformIcon platform={c} size={18} />
                </span>
              ))}
            </div>

            <div className="lp-footer-social">
              {SOCIAL_LINKS.map((social) => {
                const SocialIcon = social.icon;
                return (
                  <a key={social.label} href={social.href} className="lp-footer-social-btn" aria-label={social.label} title={social.label}>
                    <SocialIcon size={16} />
                  </a>
                );
              })}
            </div>
          </div>

          {/* ── Product ── */}
          <div className="lp-footer-col">
            <h4>Product</h4>
            {PRODUCT_LINKS.map((l) => (
              <Link key={l.label} to={l.to} className="lp-footer-link">{l.label}</Link>
            ))}
          </div>

          {/* ── Resources ── */}
          <div className="lp-footer-col">
            <h4>Resources</h4>
            <Link to="/blog" className="lp-footer-link">Blog</Link>
            <Link to="/forum" className="lp-footer-link">Forum</Link>
            {user ? (
              <Link to={dashboardPath} className="lp-footer-link">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="lp-footer-link">Sign In</Link>
                <Link to="/register" className="lp-footer-link">Get Started Free</Link>
              </>
            )}
          </div>

          {/* ── Company & Legal ── */}
          <div className="lp-footer-col">
            <h4>Company</h4>
            <a href="mailto:support@nexaaichat.com" className="lp-footer-link">
              <Mail size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
              support@nexaaichat.com
            </a>
            <Link to="/support" className="lp-footer-link">
              <LifeBuoy size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
              Support Center
            </Link>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.label} to={l.to} className="lp-footer-link">{l.label}</Link>
            ))}
          </div>
        </div>

        <div className="lp-footer-divider" />

        <div className="lp-footer-bottom">
          <span className="lp-footer-copyright">
            &copy; {year} Nexa AI Chat. All rights reserved.
          </span>
          <div className="lp-footer-badges">
            {BADGES.map((b) => (
              <span key={b} className="lp-footer-badge">{b}</span>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`lp-footer-totop ${showTop ? 'visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Back to top"
        title="Back to top"
      >
        <ArrowUp size={18} />
      </button>
    </footer>
  );
}
