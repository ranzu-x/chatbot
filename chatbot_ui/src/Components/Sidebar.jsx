import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../Provider/AuthContext';
import { useLayout } from '../Provider/LayoutContext';
import {
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
  Gift,
} from 'lucide-react';

const NAV_CONFIG = {
  ADMIN: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/admin' },
      { label: 'Inbox',             icon: MessageSquare,   path: '/inbox',        moduleKey: 'feature_live_chat' },
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
      { label: 'Affiliates',          icon: Gift,      path: '/admin/affiliates' },
      { label: 'Resellers',           icon: Building2, path: '/admin/agencies' },
      { label: 'Platform Settings',   icon: Settings,  path: '/admin/platform-settings' },
    ]},
  ],
  RESELLER: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/agency' },
      { label: 'Inbox',             icon: MessageSquare,   path: '/inbox',        moduleKey: 'feature_live_chat' },
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
      { label: 'AI Providers',        icon: KeyRound, path: '/settings/ai-providers', moduleKey: 'feature_ai_agent' },
      { label: 'Webhooks & Zapier',   icon: Globe,    path: '/webhooks' },
      { label: 'Custom Domain',       icon: Globe,    path: '/agency/domain-settings', moduleKey: 'feature_custom_domain' },
    ]},
    { section: 'Users & Billing', items: [
      { label: 'User Manager',        icon: Users,    path: '/reseller/users', accountTypeIn: ['RESELLER'] },
      { label: 'Team Members',        icon: Users,    path: '/agency/team' },
      { label: 'Team Roles & Permissions', icon: KeyRound, path: '/roles' },
      { label: 'Audit Log',                icon: ScrollText, path: '/admin/audit-log' },
      { label: 'Packages & Modules',  icon: Package,  path: '/agency/packages' },
      { label: 'Affiliate Program',   icon: Gift,     path: '/affiliate', accountTypeIn: ['RESELLER', 'DIRECT_CUSTOMER'] },
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
      { label: 'Affiliate Program', icon: Gift,    path: '/affiliate', accountTypeIn: ['RESELLER', 'DIRECT_CUSTOMER'] },
    ]},
  ],
};


// Internal role identifiers (ADMIN/RESELLER/USER — DB values, JWT payloads,
// every roleMiddleware() call) now match the human-facing label: a
// "RESELLER"-role account is a Reseller (whether or not it has sub-clients
// of its own — see routes/admin.js's isReseller capability flag), and a
// "USER"-role account is a User (a team member).
const ROLE_SUBTITLES = { ADMIN: 'Super Admin', RESELLER: 'Reseller Portal', USER: 'User Portal' };

export default function Sidebar() {
  const { user, hasModule } = useAuth();
  const { collapsed, toggleSidebar, popupNavOpen, closePopupNav, isInbox } = useLayout();
  const location  = useLocation();

  const role        = user?.role || 'USER';
  const rawSections = NAV_CONFIG[role] || [];
  const subtitle    = ROLE_SUBTITLES[role] || '';

  const accountType = user?.accountType;
  const passesAccountType = (accountTypeIn) => !accountTypeIn || accountTypeIn.includes(accountType);

  const sections = useMemo(() => {
    return rawSections
      .filter((sec) => passesAccountType(sec.accountTypeIn))
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => (!item.moduleKey || hasModule(item.moduleKey)) && passesAccountType(item.accountTypeIn)),
      }))
      .filter((sec) => sec.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSections, hasModule, accountType]);

  const isActive = (path) => {
    if (path === '/admin' || path === '/agency') return location.pathname === path;
    return location.pathname.startsWith(path);
  };

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
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px var(--primary-ring)',
                }}
              >
                <Sparkles size={17} />
              </div>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Nexa Chatbot
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                  {subtitle}
                </div>
              </div>
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
            Nexa Chatbot • Enterprise Suite
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
        transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Brand Logo Header — fixed to 56px to match .top-bar's height so the
          sidebar header and top bar form one continuous, aligned strip. */}
      <div
        className="sidebar-logo"
        style={{
          height: 56,
          padding: collapsed ? '0 12px' : '0 16px',
          justifyContent: collapsed ? 'center' : 'space-between',
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
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 8px var(--primary-ring)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} />
          </div>

          {!collapsed && (
            <div>
              <div className="sidebar-logo-text" style={{ fontSize: '0.98rem', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                Nexa Chatbot
              </div>
              <div className="sidebar-logo-sub" style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            </div>
          )}
        </Link>

        {!collapsed && (
          <button
            onClick={toggleSidebar}
            title="Collapse Sidebar"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="sidebar-nav" style={{ padding: collapsed ? '10px 8px' : '14px 10px', flex: 1, overflowY: 'auto' }}>
        {sections.map((section, sIdx) => (
          <div key={section.section} style={{ marginBottom: collapsed ? 6 : 14 }}>
            {collapsed ? (
              sIdx > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
            ) : (
              <div className="sidebar-section-label" style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', padding: '6px 8px 4px' }}>
                {section.section}
              </div>
            )}

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
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: 10,
                    padding: collapsed ? '9px 0' : '7px 10px',
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
                  <Icon
                    size={17}
                    color={active ? 'var(--text-primary)' : 'var(--text-tertiary)'}
                    style={{ flexShrink: 0 }}
                  />
                  {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
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
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '10px 6px' : '10px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        {!collapsed ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Nexa Chatbot v2.0
          </div>
        ) : null}

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
            transition: 'all 0.12s',
          }}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  );
}
