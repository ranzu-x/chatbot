import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../Provider/AuthContext';
import { useLayout } from '../Provider/LayoutContext';
import { useBranding } from '../Provider/BrandingContext';
import { assetUrl } from '../services/api';
import { accountKind } from '../utils/accountLabel';
import {
  Ticket,
  Timer,
  LayoutDashboard,
  MessageSquare,
  MessageCircle,
  Users,
  Bot,
  Radio,
  FileText,
  Send,
  Clock,
  Calendar,
  Settings,
  Building2,
  Plug,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Globe,
  Package,
  Zap,
  ShoppingBag,
  X,
  Video,
  Blocks,
  KeyRound,
  ScrollText,
 CreditCard,
  BookOpen,
  Newspaper,
  PanelsTopLeft,
} from 'lucide-react';

const NAV_CONFIG = {
  ADMIN: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/admin' },
      { label: 'Inbox',             icon: MessageSquare,   path: '/inbox',        moduleKey: 'feature_live_chat' },
      { label: 'Inbox Insights',    icon: Timer,   path: '/inbox/insights',        moduleKey: 'feature_live_chat' },
      { label: 'Subscribers',      icon: Users,           path: '/contacts',     moduleKey: 'feature_subscribers' },
      { label: 'Automation',      icon: Bot,             path: '/bots',         moduleKey: 'feature_bot_manager' },
      { label: 'Post Publishing',  icon: FileText,        path: '/social-posting' },
      { label: 'Comment Automation', icon: MessageCircle, path: '/comment-automation', moduleKey: 'feature_bot_manager' },
      { label: 'Connect Account',  icon: Radio,           path: '/connect-accounts' },
      { label: 'Broadcasts',       icon: Send,            path: '/campaigns',    moduleKey: 'feature_broadcasts' },
      { label: 'In-Chat Orders',   icon: ShoppingBag,     path: '/orders' },
      { label: 'Appointments',     icon: Calendar,        path: '/appointments', moduleKey: 'feature_appointments' },
    ]},
    { section: 'Integration', items: [
      { label: 'App Integrations',    icon: Blocks,    path: '/settings/apps' },
      { label: 'AI Providers',        icon: KeyRound,  path: '/settings/ai-providers', moduleKey: 'feature_ai_agent' },
      { label: 'Webhooks & Zapier',   icon: Globe,     path: '/webhooks' },
      { label: 'Custom Domain',       icon: Globe,     path: '/agency/domain-settings', moduleKey: 'feature_custom_domain' },
    ]},
    { section: 'Team & Access', items: [
      { label: 'Team Members',        icon: Users,     path: '/team' },
      { label: 'User Manager',        icon: Users,     path: '/admin/users' },
      { label: 'Roles & Permissions', icon: KeyRound,  path: '/roles' },
      { label: 'Audit Log',           icon: ScrollText, path: '/admin/audit-log' },
    ]},
    { section: 'Billing & Platform', items: [
      { label: 'Packages & Modules',  icon: Package,   path: '/admin/packages' },
      { label: 'Payment Gateways',    icon: Zap,       path: '/admin/payment-gateways' },
      { label: 'Coupons',             icon: Ticket,    path: '/admin/coupons' },
      { label: 'AI Credits',          icon: Sparkles,  path: '/admin/ai-credits' },
      { label: 'Resellers',           icon: Building2, path: '/admin/agencies' },
      { label: 'Developer Apps',      icon: KeyRound,  path: '/settings/developer-apps' },
      { label: 'Platform Settings',   icon: Settings,  path: '/admin/platform-settings' },
    ]},
    // Public content of the main site — only for staff whose role has the key (flags from /auth/me).
    { section: 'Content', items: [
      { label: 'Blog',                icon: Newspaper, path: '/admin/blog', userFlag: 'canManageBlog' },
      { label: 'Documentation',       icon: BookOpen,  path: '/admin/docs', userFlag: 'canManageDocs' },
    ]},
  ],
  RESELLER: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/agency' },
      { label: 'Inbox',             icon: MessageSquare,   path: '/inbox',        moduleKey: 'feature_live_chat' },
      { label: 'Inbox Insights',    icon: Timer,   path: '/inbox/insights',        moduleKey: 'feature_live_chat' },
      { label: 'Subscribers',      icon: Users,           path: '/contacts',     moduleKey: 'feature_subscribers' },
      { label: 'Automation',      icon: Bot,             path: '/bots',         moduleKey: 'feature_bot_manager' },
      { label: 'Post Publishing',  icon: FileText,        path: '/social-posting' },
      { label: 'Comment Automation', icon: MessageCircle, path: '/comment-automation', moduleKey: 'feature_bot_manager' },
      { label: 'Connect Account',  icon: Radio,           path: '/connect-accounts' },
      { label: 'Broadcasts',       icon: Send,            path: '/campaigns',    moduleKey: 'feature_broadcasts' },
      { label: 'In-Chat Orders',   icon: ShoppingBag,     path: '/orders' },
      { label: 'Appointments',     icon: Calendar,        path: '/appointments', moduleKey: 'feature_appointments' },
    ]},
    { section: 'Integration', items: [
      { label: 'App Integrations',    icon: Blocks,   path: '/settings/apps' },
      // AI runs on the platform's providers; the workspace sees its AI credits (Pages/AiCredits/AiCreditsPage.jsx).
      { label: 'AI Credits',          icon: Sparkles, path: '/ai-credits' },
      { label: 'Webhooks & Zapier',   icon: Globe,    path: '/webhooks' },
      { label: 'Custom Domain',       icon: Globe,    path: '/agency/domain-settings', moduleKey: 'feature_custom_domain', accountTypeIn: ['RESELLER'] },
      // The Reseller's own public landing page + pricing (chatbot_api/routes/resellerSite.js).
      { label: 'Landing Page',        icon: PanelsTopLeft, path: '/agency/landing-page', accountTypeIn: ['RESELLER'] },
    ]},
    { section: 'Users & Billing', items: [
      { label: 'User Manager',        icon: Users,    path: '/reseller/users', accountTypeIn: ['RESELLER'] },
      { label: 'Team Members',        icon: Users,    path: '/agency/team' },
      { label: 'Team Roles & Permissions', icon: KeyRound, path: '/roles' },
      // Resellers only — an End User owner is also role RESELLER in code (chatbot_api/routes/auditLog.js).
      { label: 'Audit Log',                icon: ScrollText, path: '/admin/audit-log', accountTypeIn: ['RESELLER'] },
      { label: 'Packages & Modules',  icon: Package,  path: '/agency/packages', accountTypeIn: ['RESELLER'] },
      { label: 'Customer Payments',   icon: CreditCard, path: '/agency/payments', accountTypeIn: ['RESELLER'] },
      // The Reseller's own Meta / TikTok apps — its customers connect channels through them.
      { label: 'Developer Apps',      icon: KeyRound,  path: '/settings/developer-apps', accountTypeIn: ['RESELLER'] },
    ]},
  ],
  // User (a Reseller's team member) gets every day-to-day operational menu
  // Reseller has — everything about actually running the business (talking
  // to customers, building bot content, publishing/broadcasting, orders,
  // appointments, and connecting channel accounts). Deliberately excluded
  // (owner/reseller-only, matches the backend permission/role gates — see
  // routes/team.js, routes/aiProviders.js, routes/whatsappFlowRefs.js,
  // routes/domains.js, routes/flowWebhooks.js, routes/agencyPackages.js,
  // routes/roles.js): App Integrations/AI Providers/WhatsApp Flows/
  // Webhooks & Zapier/Custom Domain (credential/app-configuration),
  // Packages & Modules (billing/plan creation), Team Roles & Permissions
  // (privilege-escalation risk), and Reseller Customers/Packages (not even
  // in Reseller's own nav).
  USER: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/agency' },
      { label: 'Inbox',             icon: MessageSquare, path: '/inbox',          moduleKey: 'feature_live_chat' },
      { label: 'Inbox Insights',    icon: Timer, path: '/inbox/insights',          moduleKey: 'feature_live_chat' },
      { label: 'Subscribers',      icon: Users,         path: '/contacts',       moduleKey: 'feature_subscribers' },
      { label: 'Automation',      icon: Bot,           path: '/bots',           moduleKey: 'feature_bot_manager' },
      { label: 'Post Publishing',  icon: FileText,      path: '/social-posting' },
      { label: 'Comment Automation', icon: MessageCircle, path: '/comment-automation', moduleKey: 'feature_bot_manager' },
      { label: 'Connect Account',  icon: Radio,         path: '/connect-accounts' },
      { label: 'Broadcasts',       icon: Send,          path: '/campaigns',      moduleKey: 'feature_broadcasts' },
      { label: 'In-Chat Orders',   icon: ShoppingBag,     path: '/orders' },
      { label: 'Appointments',     icon: Calendar,        path: '/appointments',   moduleKey: 'feature_appointments' },
    ]},
    { section: 'Control Panel', items: [
      { label: 'Team Members',     icon: Users,    path: '/team' },
      { label: 'AI Credits',       icon: Sparkles, path: '/ai-credits' },
      // Only with the developer_apps.manage team permission, on the Platform's / a Reseller's team.
      { label: 'Developer Apps',   icon: KeyRound, path: '/settings/developer-apps', userFlag: 'canManageDeveloperApps' },
    ]},
  ],
};


// Internal role identifiers (ADMIN/RESELLER/USER — DB values, JWT payloads,
// every roleMiddleware() call) now match the human-facing label: a
// "RESELLER"-role account is a Reseller (whether or not it has sub-clients
// of its own — see routes/admin.js's isReseller capability flag), and a
// "USER"-role account is a User (a team member).
const KIND_SUBTITLES = { SUPER_ADMIN: 'Super Admin', RESELLER: 'Reseller Portal', END_USER: 'Workspace', TEAM_MEMBER: 'Team Member' };

/* Collapse / expand animation — same timing as .sidebar / .main-content in
   index.css (--sidebar-slide). Labels stay mounted and fade while the width
   clips them, so nothing pops in or out; icons never move sideways. */
const SLIDE = 'var(--sidebar-slide)';
const fadeLabel = (collapsed) => ({
  opacity: collapsed ? 0 : 1,
  // Fade out quickly when collapsing; fade in once the bar has mostly opened.
  transition: collapsed ? 'opacity 0.15s ease' : 'opacity 0.3s ease 0.15s',
  whiteSpace: 'nowrap',
  pointerEvents: collapsed ? 'none' : undefined,
});

/** The brand in the sidebar header: the uploaded logo, else icon + name. `compact` = collapsed sidebar. */
function BrandMark({ compact = false, size = 36, subtitle = '' }) {
  const { brandName, logoUrl, logoIconUrl } = useBranding();
  // Only a wide uploaded logo has to be swapped for the square mark; the icon + name version fades its text.
  if (compact && logoUrl) {
    return logoIconUrl
      ? <img src={assetUrl(logoIconUrl)} alt={brandName} style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
      : <DefaultMark size={size} />;
  }
  if (logoUrl) {
    return <img src={assetUrl(logoUrl)} alt={brandName} style={{ maxHeight: size, maxWidth: 170, objectFit: 'contain', display: 'block' }} />;
  }
  return (
    <>
      {logoIconUrl
        ? <img src={assetUrl(logoIconUrl)} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
        : <DefaultMark size={size} />}
      <div style={{ minWidth: 0, ...fadeLabel(compact) }} aria-hidden={compact || undefined}>
        <div className="sidebar-logo-text" style={{ fontSize: '0.98rem', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
          {brandName}
        </div>
        {subtitle && (
          <div className="sidebar-logo-sub" style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{subtitle}</div>
        )}
      </div>
    </>
  );
}

function DefaultMark({ size }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', boxShadow: '0 2px 8px var(--primary-ring)',
    }}>
      <Sparkles size={Math.round(size / 2)} />
    </div>
  );
}

export default function Sidebar() {
  const { user, hasModule } = useAuth();
  const { collapsed, toggleSidebar, popupNavOpen, closePopupNav, isInbox } = useLayout();
  const location  = useLocation();

  const role        = user?.role || 'USER';
  const rawSections = NAV_CONFIG[role] || [];
  const subtitle    = KIND_SUBTITLES[accountKind(user)] || '';
  const { brandName } = useBranding();

  const accountType = user?.accountType;
  const passesAccountType = (accountTypeIn) => !accountTypeIn || accountTypeIn.includes(accountType);

  const sections = useMemo(() => {
    return rawSections
      .filter((sec) => passesAccountType(sec.accountTypeIn))
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => (!item.moduleKey || hasModule(item.moduleKey)) && passesAccountType(item.accountTypeIn) && (!item.userFlag || user?.[item.userFlag])),
      }))
      .filter((sec) => sec.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSections, hasModule, accountType, user]);

  // An item is active on its own page and the pages under it ("/contacts/…"),
  // but when another menu item matches more specifically ("/inbox/insights"
  // vs "/inbox") only that one is highlighted.
  const activePath = useMemo(() => {
    const here = location.pathname;
    const matches = (path) => {
      if (path === '/admin' || path === '/agency') return here === path;
      return here.startsWith(path);
    };
    const matching = sections.flatMap((sec) => sec.items.map((item) => item.path)).filter(matches);
    return matching.sort((a, b) => b.length - a.length)[0] || null;
  }, [sections, location.pathname]);

  const isActive = (path) => path === activePath;

  // ── 1. Pop Bar Overlay Drawer (When in Inbox or when pop bar triggered) ──
  if (isInbox || popupNavOpen) {
    if (!popupNavOpen) return null; // In live chat, hide standard sidebar completely

    return (
      <>
        {/* Backdrop Overlay */}
        <div
          className="popup-nav-backdrop"
          onClick={closePopupNav}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 99990,
            animation: 'fadeIn 0.15s ease',
          }}
        />

        {/* Slide-out Off-Canvas Pop Bar Drawer */}
        <aside
          className="sidebar popup-nav-drawer"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            width: 270,
            background: 'var(--bg-surface)',
            zIndex: 99999,
            boxShadow: '6px 0 28px rgba(0, 0, 0, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInLeft 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            borderRight: '1px solid var(--border)',
          }}
        >
          {/* Drawer Header with Close Button */}
          <div
            style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-input)',
            }}
          >
            <Link
              to="/landing"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textDecoration: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
              title="Visit Landing Page"
              onClick={closePopupNav}
            >
              <BrandMark size={34} subtitle={subtitle} />
            </Link>

            <button
              onClick={closePopupNav}
              title="Close Menu"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer Navigation Links */}
          <nav style={{ padding: '14px 10px', flex: 1, overflowY: 'auto' }}>
            {sections.map((section) => (
              <div key={section.section} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', padding: '6px 8px 4px', textTransform: 'uppercase' }}>
                  {section.section}
                </div>

                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`nav-item ${active ? 'active' : ''}`}
                      onClick={() => {
                        if (popupNavOpen) closePopupNav();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 7,
                        textDecoration: 'none',
                        fontSize: '0.84rem',
                        fontWeight: active ? 700 : 500,
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        background: active ? 'var(--bg-selected)' : 'transparent',
                        transition: 'all 0.12s ease',
                        marginBottom: 2,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'var(--bg-hover)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                      }}
                    >
                      <Icon size={17} color={active ? 'var(--text-primary)' : 'var(--text-tertiary)'} style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Drawer Footer */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {brandName}
          </div>
        </aside>
      </>
    );
  }

  // ── 2. Standard Static Sidebar (For Dashboard, Bots, Contacts, Settings, etc.) ──
  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      style={{
        width: collapsed ? 68 : 260,
        transition: `width ${SLIDE}`,
        overflowX: 'hidden',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Brand Logo Header — the same --topbar-height as .top-bar so the
          sidebar header and top bar form one continuous, aligned strip. */}
      <div
        className="sidebar-logo"
        style={{
          height: 'var(--topbar-height)',
          padding: '0 16px',
          justifyContent: 'flex-start',
          overflow: 'hidden',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <Link
          to="/landing"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: 'inherit',
            cursor: 'pointer',
          }}
          title="Visit Landing Page"
        >
          <BrandMark compact={collapsed} subtitle={subtitle} />
        </Link>
        {/* No collapse arrow here (removed on request) — the footer button and the
            top bar's menu button collapse / expand the sidebar. */}
      </div>

      {/* Navigation Items */}
      <nav className="sidebar-nav" style={{ padding: '14px 10px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {sections.map((section, sIdx) => (
          <div key={section.section} style={{ marginBottom: collapsed ? 6 : 14, transition: `margin ${SLIDE}` }}>
            {/* Section title folds away into a thin divider when collapsed. */}
            {sIdx > 0 && (
              <div aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: collapsed ? '6px 4px' : '0 4px', opacity: collapsed ? 1 : 0, transition: `opacity 0.3s ease, margin ${SLIDE}` }} />
            )}
            <div
              className="sidebar-section-label"
              aria-hidden={collapsed || undefined}
              style={{
                fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)',
                padding: collapsed ? '0 8px' : '6px 8px 4px',
                maxHeight: collapsed ? 0 : 28,
                overflow: 'hidden',
                ...fadeLabel(collapsed),
                transition: `${fadeLabel(collapsed).transition}, max-height ${SLIDE}, padding ${SLIDE}`,
              }}
            >
              {section.section}
            </div>

            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${active ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 10,
                    // 48px-wide item when collapsed: 15.5px each side centres the 17px icon.
                    padding: collapsed ? '8px 15.5px' : '8px 10px',
                    overflow: 'hidden',
                    borderRadius: 7,
                    textDecoration: 'none',
                    fontSize: '0.84rem',
                    fontWeight: active ? 700 : 500,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: active ? 'var(--bg-selected)' : 'transparent',
                    transition: `background 0.12s ease, color 0.12s ease, padding ${SLIDE}`,
                    marginBottom: 2,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <Icon
                    size={17}
                    color={active ? 'var(--text-primary)' : 'var(--text-tertiary)'}
                    style={{ flexShrink: 0 }}
                  />
                  <span style={fadeLabel(collapsed)} aria-hidden={collapsed || undefined}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer with Toggle Button */}
      <div
        className="sidebar-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          // 68px collapsed: 20px each side centres the 28px button.
          padding: collapsed ? '10px 20px' : '10px 14px',
          transition: `padding ${SLIDE}`,
          overflow: 'hidden',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <div
          aria-hidden={collapsed || undefined}
          style={{
            fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
            maxWidth: collapsed ? 0 : 200,
            ...fadeLabel(collapsed),
            transition: `${fadeLabel(collapsed).transition}, max-width ${SLIDE}`,
          }}
        >
          {brandName}
        </div>

        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand Menu' : 'Collapse Menu'}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          <ChevronLeft size={15} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: `transform ${SLIDE}` }} />
        </button>
      </div>
    </aside>
  );
}
