import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CheckCircle, ChevronDown, BookOpen, MessageSquare, Bot, Users, Send, Sparkles, BarChart3 } from 'lucide-react';
import { assetUrl } from '../../services/api';

/**
 * A Reseller's own landing page, shown on its white-label address
 * (chatbot_api/routes/resellerSite.js GET /public/site). Everything here comes
 * from the Reseller: brand, texts, FAQ and its OWN plans (agency_packages) —
 * never the platform's pricing. Sign-up / sign-in stay on the same address, so
 * a new account becomes that Reseller's customer (routes/auth.js /register).
 */

// Shown when the Reseller hasn't written its own feature list yet — generic,
// no platform name.
const DEFAULT_FEATURES = [
  { title: 'One inbox for every channel', description: 'WhatsApp, Messenger, Instagram, Telegram and website chat in a single shared inbox for your whole team.', icon: MessageSquare },
  { title: 'Chatbots & automation', description: 'Build keyword bots and multi-step flows visually — answer the common questions around the clock.', icon: Bot },
  { title: 'Broadcasts & sequences', description: 'Send announcements and follow-up sequences to the right subscribers at the right time.', icon: Send },
  { title: 'AI replies', description: 'Let AI answer from your own knowledge, and hand over to a person when it is unsure.', icon: Sparkles },
  { title: 'Team collaboration', description: 'Assign chats, leave internal notes and control what every team member can do.', icon: Users },
  { title: 'Reports', description: 'See response times, conversations and campaign results at a glance.', icon: BarChart3 },
];
const FEATURE_ICONS = [MessageSquare, Bot, Send, Sparkles, Users, BarChart3];

const CYCLE_LABEL = { monthly: '/month', yearly: '/year', lifetime: ' one-time', free: '' };

function formatPrice(price, currency) {
  if (!Number(price)) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: Number(price) % 1 ? 2 : 0 }).format(price);
  } catch {
    return `${price} ${currency || ''}`.trim();
  }
}

// "1 bot account" / "5 bot accounts" — labels are given in the plural.
const SINGULAR = { 'bot accounts': 'bot account', subscribers: 'subscriber', 'team members': 'team member', 'messages / month': 'message / month' };
const limitLine = (value, label) => {
  if (value === null || value === undefined) return `Unlimited ${label}`;
  const n = Number(value);
  return `${n.toLocaleString()} ${n === 1 ? SINGULAR[label] || label : label}`;
};

function docsHref(site) {
  return site.docsUrl || '/docs';
}

function Faq({ items }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div className="lp-faq-list">
      {items.map((item, idx) => {
        const open = openIdx === idx;
        return (
          <div key={`${item.q}-${idx}`} className={`lp-faq-item${open ? ' lp-faq-item--open' : ''}`}>
            <button type="button" className="lp-faq-question" onClick={() => setOpenIdx(open ? -1 : idx)} aria-expanded={open}>
              <span>{item.q}</span>
              <ChevronDown size={18} className="lp-faq-chevron" />
            </button>
            {open && <div className="lp-faq-answer">{item.a}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function PlanCards({ plans, allowRegistration }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, alignItems: 'stretch' }}>
      {plans.map((p) => (
        <div
          key={p.id}
          style={{
            background: '#fff', borderRadius: 16, padding: '26px 22px', display: 'flex', flexDirection: 'column',
            border: p.isDefault ? '2px solid var(--lp-primary, #2563eb)' : '1px solid #e2e8f0',
            boxShadow: p.isDefault ? '0 12px 30px rgba(37,99,235,0.12)' : '0 1px 3px rgba(15,23,42,0.04)',
          }}
        >
          {p.isDefault && <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 800, color: '#2563eb', background: '#eff6ff', borderRadius: 999, padding: '3px 10px', marginBottom: 10 }}>Most popular</span>}
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{p.name}</h3>
          {p.description && <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>{p.description}</p>}
          <div style={{ margin: '16px 0 14px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{formatPrice(p.price, p.currency)}</span>
            {Number(p.price) > 0 && <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{CYCLE_LABEL[p.billingCycle] || ''}</span>}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem', color: '#334155', flex: 1 }}>
            {[
              limitLine(p.limits.botAccounts, 'bot accounts'),
              limitLine(p.limits.subscribers, 'subscribers'),
              limitLine(p.limits.teamMembers, 'team members'),
              limitLine(p.limits.monthlyMessages, 'messages / month'),
              ...(Array.isArray(p.features) ? p.features.map(String) : []),
            ].map((line, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <CheckCircle size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} /> {line}
              </li>
            ))}
          </ul>
          <Link to={allowRegistration ? '/register' : '/login'} className={p.isDefault ? 'lp-btn-primary' : 'lp-btn-secondary'} style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
            {allowRegistration ? 'Get started' : 'Sign in'} <ArrowRight size={16} />
          </Link>
        </div>
      ))}
    </div>
  );
}

export default function ResellerLandingPage({ publicSite }) {
  const { brand = {}, site = {}, plans = [], allowRegistration = true } = publicSite;
  const brandName = brand.brandName || brand.name || 'Our platform';
  const features = site.features?.length
    ? site.features.map((f, i) => ({ ...f, icon: FEATURE_ICONS[i % FEATURE_ICONS.length] }))
    : DEFAULT_FEATURES;
  const headline = site.headline || `Grow your business with ${brandName}`;
  const subheadline = site.subheadline || brand.tagline || 'Chatbots, a shared inbox and automation for every messaging channel your customers use.';
  const cta = site.ctaLabel || 'Get started';

  return (
    <>
      <section className="lp-hero">
        <div className="lp-container">
          <h1 className="lp-hero-title">{headline}</h1>
          <p className="lp-hero-desc">{subheadline}</p>
          <div className="lp-hero-buttons">
            {allowRegistration && (
              <Link to="/register" className="lp-btn-primary" style={{ padding: '14px 28px', fontSize: '1.05rem' }}>
                {cta} <ArrowRight size={18} />
              </Link>
            )}
            <Link to="/login" className="lp-btn-secondary" style={{ padding: '14px 28px', fontSize: '1.05rem' }}>Sign in</Link>
          </div>
          {site.heroImage && (
            <div className="lp-hero-visual" style={{ padding: 0, overflow: 'hidden' }}>
              <img src={assetUrl(site.heroImage)} alt="" style={{ width: '100%', display: 'block', borderRadius: 'inherit' }} />
            </div>
          )}
        </div>
      </section>

      <section id="features" className="lp-section" style={{ background: '#f8fafc' }}>
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">Features</span>
            <h2 className="lp-section-title">Everything you need in one place</h2>
          </div>
          <div className="lp-features-grid">
            {features.map((f, idx) => {
              const IconComp = f.icon || MessageSquare;
              return (
                <div key={idx} className="lp-feature-card">
                  <div className="lp-feature-icon-wrap"><IconComp size={24} /></div>
                  <h3 className="lp-feature-card-title">{f.title}</h3>
                  {f.description && <p className="lp-feature-card-desc">{f.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {site.showPricing !== false && plans.length > 0 && (
        <section id="pricing" className="lp-section">
          <div className="lp-container">
            <div className="lp-section-header">
              <span className="lp-section-tag">Pricing</span>
              <h2 className="lp-section-title">Simple plans for every size</h2>
            </div>
            <PlanCards plans={plans} allowRegistration={allowRegistration} />
          </div>
        </section>
      )}

      {site.faqs?.length > 0 && (
        <section id="faq" className="lp-section" style={{ background: '#f8fafc' }}>
          <div className="lp-container" style={{ maxWidth: 820 }}>
            <div className="lp-section-header">
              <span className="lp-section-tag">FAQ</span>
              <h2 className="lp-section-title">Questions & answers</h2>
            </div>
            <Faq items={site.faqs} />
          </div>
        </section>
      )}

      <section className="lp-cta-section">
        <div className="lp-container">
          <div className="lp-cta-box">
            <h2 className="lp-cta-title">Ready to get started with {brandName}?</h2>
            {site.showDocs !== false && (
              <p className="lp-cta-desc">
                New here? The <a href={docsHref(site)} style={{ color: 'inherit', textDecoration: 'underline' }}>documentation</a> walks you through every step.
              </p>
            )}
            <Link to={allowRegistration ? '/register' : '/login'} className="lp-btn-primary" style={{ padding: '14px 32px', fontSize: '1.05rem' }}>
              {allowRegistration ? cta : 'Sign in'} <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function ResellerFooter({ publicSite }) {
  const { brand = {}, site = {} } = publicSite;
  const year = new Date().getFullYear();
  const brandName = brand.brandName || brand.name || '';
  return (
    <footer style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '28px 0' }}>
      <div className="lp-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem', color: '#64748b' }}>
        <div>
          {site.footerText || brand.copyrightText || `© ${year} ${brandName}. All rights reserved.`}
          {brand.supportEmail && <> · <a href={`mailto:${brand.supportEmail}`} style={{ color: 'inherit' }}>{brand.supportEmail}</a></>}
        </div>
        <nav style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <a href="/landing#features" style={{ color: 'inherit' }}>Features</a>
          {site.showPricing !== false && <a href="/landing#pricing" style={{ color: 'inherit' }}>Pricing</a>}
          {site.showDocs !== false && (
            <a href={docsHref(site)} style={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}><BookOpen size={14} /> Docs</a>
          )}
          <Link to="/login" style={{ color: 'inherit' }}>Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
