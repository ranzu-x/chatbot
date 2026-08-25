import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../Provider/AuthContext';

const NAV_CONFIG = {
  ADMIN: [
    { section: 'Main', items: [
      { label: 'Dashboard',   icon: '📊', path: '/admin' },
      { label: 'Live Chat',   icon: '💬', path: '/inbox' },
      { label: 'Contacts',    icon: '📇', path: '/contacts' },
      { label: 'Bot Manager', icon: '🤖', path: '/bots' },
      { label: 'WA Templates', icon: '📜', path: '/templates/whatsapp' },
      { label: 'Broadcasts',   icon: '📢', path: '/campaigns' },
      { label: 'Drip Sequences', icon: '⏳', path: '/campaigns/sequence' },
    ]},
    { section: 'Channels', items: [
      { label: 'WhatsApp',  icon: '📱', path: '/channels/whatsapp' },
      { label: 'Facebook',  icon: '📘', path: '/channels/facebook' },
      { label: 'Instagram', icon: '📷', path: '/channels/instagram' },
      { label: 'Telegram',  icon: '✈️', path: '/channels/telegram' },
      { label: 'Webchat',   icon: '🌐', path: '/channels/webchat' },
    ]},
    { section: 'Settings', items: [
      { label: 'Meta App Setup', icon: '🔗', path: '/settings/meta-app' },
      { label: 'Agencies',       icon: '🏢', path: '/admin/agencies' },
      { label: 'All Users',      icon: '👤', path: '/admin/users' },
      { label: 'Agents',         icon: '👥', path: '/admin/agents' },
    ]},
  ],
  AGENCY: [
    { section: 'Main', items: [
      { label: 'Dashboard',   icon: '📊', path: '/agency' },
      { label: 'Live Chat',   icon: '💬', path: '/inbox' },
      { label: 'Contacts',    icon: '📇', path: '/contacts' },
      { label: 'Bot Manager', icon: '🤖', path: '/bots' },
      { label: 'WA Templates', icon: '📜', path: '/templates/whatsapp' },
      { label: 'Broadcasts',   icon: '📢', path: '/campaigns' },
      { label: 'Drip Sequences', icon: '⏳', path: '/campaigns/sequence' },
    ]},
    { section: 'Channels', items: [
      { label: 'WhatsApp',  icon: '📱', path: '/channels/whatsapp' },
      { label: 'Facebook',  icon: '📘', path: '/channels/facebook' },
      { label: 'Instagram', icon: '📷', path: '/channels/instagram' },
      { label: 'Telegram',  icon: '✈️', path: '/channels/telegram' },
      { label: 'Webchat',   icon: '🌐', path: '/channels/webchat' },
    ]},
    { section: 'Settings', items: [
      { label: 'Meta App Setup', icon: '🔗', path: '/settings/meta-app' },
      { label: 'Agents',         icon: '👥', path: '/agency/agents' },
      { label: 'Integrations',   icon: '🔌', path: '/agency/integrations' },
    ]},
  ],
  AGENT: [
    { section: 'Main', items: [
      { label: 'Live Chat', icon: '💬', path: '/inbox' },
      { label: 'Contacts',  icon: '📇', path: '/contacts' },
    ]},
  ],
};

const ROLE_SUBTITLES = { ADMIN: 'Super Admin', AGENCY: 'Agency Portal', AGENT: 'Agent Portal' };

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const role     = user?.role || 'AGENT';
  const sections = NAV_CONFIG[role] || [];
  const subtitle = ROLE_SUBTITLES[role] || '';

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const isActive = (path) => {
    if (path === '/admin' || path === '/agency') return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">💬</div>
        <div>
          <div className="sidebar-logo-text">ChatSaaS</div>
          <div className="sidebar-logo-sub">{subtitle}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {sections.map(section => (
          <div key={section.section}>
            <div className="sidebar-section-label">{section.section}</div>
            {section.items.map(item => (
              <div
                key={item.path}
                className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ justifyContent: 'center', padding: '16px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          ChatSaaS v1.2.0 (Beta)
        </div>
      </div>
    </aside>
  );
}
