import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../Provider/AuthContext';
import { useLayout } from '../Provider/LayoutContext';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Bot,
  Radio,
  FileText,
  Send,
  Clock,
  Settings,
  Building2,
  UserCheck,
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
} from 'lucide-react';

const NAV_CONFIG = {
  ADMIN: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/admin' },
      { label: 'Live Chat',        icon: MessageSquare,   path: '/inbox',              moduleKey: 'feature_live_chat' },
      { label: 'Subscribers',      icon: Users,           path: '/contacts',           moduleKey: 'feature_subscribers' },
      { label: 'Bot Manager',      icon: Bot,             path: '/bots',               moduleKey: 'feature_bot_manager' },
      { label: 'Connect Account',  icon: Radio,           path: '/connect-accounts' },
      { label: 'Broadcasts',       icon: Send,            path: '/campaigns',          moduleKey: 'feature_broadcasts' },
      { label: 'AI Agent & KB',    icon: Sparkles,        path: '/ai-agent',          moduleKey: 'feature_ai_agent' },
      { label: 'In-Chat Orders',   icon: ShoppingBag,     path: '/orders' },
    ]},
    { section: 'Control Panel', items: [
      { label: 'App Integrations', icon: Blocks,          path: '/settings/apps' },
      { label: 'Packages & Modules', icon: Package,       path: '/admin/packages' },
      { label: 'Webhooks & Zapier',  icon: Globe,         path: '/webhooks' },
      { label: 'Custom Domain',    icon: Globe,           path: '/agency/domain-settings', moduleKey: 'feature_custom_domain' },
      { label: 'Agencies',         icon: Building2,       path: '/admin/agencies' },
      { label: 'User Manager',     icon: Users,           path: '/admin/users' },
      { label: 'Agents',           icon: UserCheck,       path: '/admin/agents' },
    ]},
  ],
  AGENCY: [
    { section: 'Main', items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/agency' },
      { label: 'Live Chat',        icon: MessageSquare,   path: '/inbox',              moduleKey: 'feature_live_chat' },
      { label: 'Subscribers',      icon: Users,           path: '/contacts',           moduleKey: 'feature_subscribers' },
      { label: 'Bot Manager',      icon: Bot,             path: '/bots',               moduleKey: 'feature_bot_manager' },
      { label: 'Connect Account',  icon: Radio,           path: '/connect-accounts' },
      { label: 'Broadcasts',       icon: Send,            path: '/campaigns',          moduleKey: 'feature_broadcasts' },
      { label: 'AI Agent & KB',    icon: Sparkles,        path: '/ai-agent',          moduleKey: 'feature_ai_agent' },
      { label: 'In-Chat Orders',   icon: ShoppingBag,     path: '/orders' },
    ]},
    { section: 'Control Panel', items: [
      { label: 'App Integrations', icon: Blocks,          path: '/settings/apps' },
      { label: 'My Plan & Usage',  icon: Zap,             path: '/agency/plan' },
      { label: 'Webhooks & Zapier', icon: Globe,          path: '/webhooks' },
      { label: 'Custom Domain',    icon: Globe,           path: '/agency/domain-settings', moduleKey: 'feature_custom_domain' },
      { label: 'User Manager',     icon: Users,           path: '/admin/users' },
      { label: 'Agents',           icon: UserCheck,       path: '/agency/agents' },
    ]},
  ],
  AGENT: [
    { section: 'Main', items: [
      { label: 'Live Chat',   icon: MessageSquare, path: '/inbox',      moduleKey: 'feature_live_chat' },
      { label: 'Subscribers', icon: Users,         path: '/contacts',   moduleKey: 'feature_subscribers' },
    ]},
  ],
};

const ROLE_SUBTITLES = { ADMIN: 'Super Admin', AGENCY: 'Agency Portal', AGENT: 'Agent Portal' };

export default function Sidebar() {
  const { user, hasModule } = useAuth();
  const { collapsed, toggleSidebar, popupNavOpen, closePopupNav, isInbox } = useLayout();
  const location  = useLocation();

  const role        = user?.role || 'AGENT';
  const rawSections = NAV_CONFIG[role] || [];
  const subtitle    = ROLE_SUBTITLES[role] || '';

  const sections = useMemo(() => {
    return rawSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => !item.moduleKey || hasModule(item.moduleKey)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [rawSections, hasModule]);

  const isActive = (path) => {
    if (path === '/admin' || path === '/agency') return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  // ── 1. Pop Bar Overlay Drawer (When in Live Chat or when pop bar triggered) ──
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
            background: '#ffffff',
            zIndex: 99999,
            boxShadow: '6px 0 28px rgba(0, 0, 0, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInLeft 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            borderRight: '1px solid #e2e8f0',
          }}
        >
          {/* Drawer Header with Close Button */}
          <div
            style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                }}
              >
                <Sparkles size={17} />
              </div>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                  Nexa Chatbot
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                  {subtitle}
                </div>
              </div>
            </div>

            <button
              onClick={closePopupNav}
              title="Close Menu"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer Navigation Links */}
          <nav style={{ padding: '14px 10px', flex: 1, overflowY: 'auto' }}>
            {sections.map((section) => (
              <div key={section.section} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.8px', color: '#94a3b8', padding: '6px 8px 4px', textTransform: 'uppercase' }}>
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
                        fontWeight: active ? 600 : 500,
                        color: active ? '#2563eb' : '#475569',
                        background: active ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                        transition: 'all 0.12s ease',
                        marginBottom: 2,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = '#f1f5f9';
                          e.currentTarget.style.color = '#0f172a';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#475569';
                        }
                      }}
                    >
                      <Icon size={17} color={active ? '#2563eb' : '#64748b'} style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Drawer Footer */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#fafbfe', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
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
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
      }}
    >
      {/* Brand Logo Header */}
      <div
        className="sidebar-logo"
        style={{
          padding: collapsed ? '16px 12px' : '18px 16px',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            to="/"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              flexShrink: 0,
              textDecoration: 'none',
            }}
            title="Nexa Chatbot"
          >
            <Sparkles size={18} />
          </Link>

          {!collapsed && (
            <div>
              <div className="sidebar-logo-text" style={{ fontSize: '0.98rem', fontWeight: 800, letterSpacing: '-0.3px', color: '#0f172a', whiteSpace: 'nowrap' }}>
                Nexa Chatbot
              </div>
              <div className="sidebar-logo-sub" style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={toggleSidebar}
            title="Collapse Sidebar"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#64748b',
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
              sIdx > 0 && <div style={{ height: 1, background: '#f1f5f9', margin: '6px 4px' }} />
            ) : (
              <div className="sidebar-section-label" style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.8px', color: '#94a3b8', padding: '6px 8px 4px' }}>
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
                    fontWeight: active ? 600 : 500,
                    color: active ? '#2563eb' : '#475569',
                    background: active ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    transition: 'all 0.12s ease',
                    marginBottom: 2,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0f172a';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  <Icon
                    size={17}
                    color={active ? '#2563eb' : '#64748b'}
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
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        {!collapsed ? (
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
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
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            color: '#64748b',
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
