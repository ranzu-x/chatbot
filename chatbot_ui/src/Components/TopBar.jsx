import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../Provider/AuthContext';
import { useLayout } from '../Provider/LayoutContext';
import { useNotification } from '../Provider/NotificationContext';
import { Menu, PanelLeft, PanelLeftClose, Sun, Moon, Plug, LogOut, Bell, UserCircle, Palette, LifeBuoy, ShieldCheck, Building2 } from 'lucide-react';

// Internal role identifiers (ADMIN/RESELLER/USER) now match the human-facing
// label, consistent with Sidebar.jsx's ROLE_SUBTITLES.
const ROLE_LABELS = { ADMIN: 'Super Admin', RESELLER: 'Reseller', USER: 'User' };
const ROLE_ICONS = { ADMIN: ShieldCheck, RESELLER: Building2, USER: UserCircle };

export default function TopBar() {
  const { user, logout } = useAuth();
  const { collapsed, toggleSidebar, isInbox, openPopupNav } = useLayout();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const menuRef = useRef(null);

  useEffect(() => {
    // Apply theme
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    // Close dropdown on click outside
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const getInitials = (name = '') => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const getApiLink = () => {
    if (user?.role === 'ADMIN') return '/admin/integrations';
    if (user?.role === 'RESELLER') return '/agency/integrations';
    return null;
  };

  const apiLink = getApiLink();
  const RoleIcon = ROLE_ICONS[user?.role] || UserCircle;

  const handleMenuClick = () => {
    if (isInbox) {
      openPopupNav();
    } else {
      toggleSidebar();
    }
  };

  const { openSettingsModal } = useNotification();

  return (
    <header className="top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div className="top-bar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleMenuClick}
          title={isInbox ? 'Open Navigation Menu (Pop Bar)' : (collapsed ? 'Expand Menu' : 'Collapse Menu (Icons Only)')}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <Menu size={17} />
        </button>
      </div>

      <div className="top-bar-right" ref={menuRef} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
        {/* Notification Preferences Trigger */}
        <button
          type="button"
          onClick={openSettingsModal}
          title="Notification Preferences & Sound Settings"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
        >
          <Bell size={16} />
        </button>

        <div 
          className="top-bar-user-trigger"
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}
        >
          <div className="avatar avatar-sm avatar-glow">{getInitials(user?.name)}</div>
          <span className="user-trigger-name" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.name || 'My Account'}</span>
          <span className={`trigger-arrow ${menuOpen ? 'open' : ''}`} style={{ fontSize: '0.7rem' }}>▼</span>
        </div>

        {menuOpen && (
          <div className="top-bar-dropdown">
            <div className="dropdown-header">
              <div className="avatar avatar-lg">{getInitials(user?.name)}</div>
              <div className="dropdown-header-text">
                <div className="dropdown-user-name" title={user?.name}>{user?.name || 'Account'}</div>
                <div className="dropdown-user-email" title={user?.email}>{user?.email || ''}</div>
                <span className="role-badge">
                  <RoleIcon size={10} />
                  {ROLE_LABELS[user?.role] || 'User'}
                </span>
              </div>
            </div>

            <div className="dropdown-section">
              <Link
                to="/my-account"
                className="dropdown-item"
                onClick={() => setMenuOpen(false)}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <UserCircle size={15} style={{ marginRight: 8 }} />
                <div className="dropdown-text">
                  <div className="dropdown-label">My Account</div>
                  <div className="dropdown-desc">{user?.role === 'RESELLER' ? 'Profile & billing' : 'Profile settings'}</div>
                </div>
              </Link>

              {apiLink && (
                <Link 
                  to={apiLink}
                  className="dropdown-item" 
                  onClick={() => setMenuOpen(false)}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <Plug size={15} style={{ marginRight: 8 }} />
                  <div className="dropdown-text">
                    <div className="dropdown-label">API & Integrations</div>
                    <div className="dropdown-desc">Manage API connections</div>
                  </div>
                </Link>
              )}

              {/* The Support Desk is a deliberately separate portal (own
                  login, own session token — see SupportDeskApp) rather than
                  a page inside this dashboard, so it opens in a new tab
                  instead of navigating away from wherever the user is. */}
              <a
                href="/support"
                target="_blank"
                rel="noopener noreferrer"
                className="dropdown-item"
                onClick={() => setMenuOpen(false)}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <LifeBuoy size={15} style={{ marginRight: 8 }} />
                <div className="dropdown-text">
                  <div className="dropdown-label">Support</div>
                  {/* The Platform account (Super Admin) answers tickets, it
                      never files them — see routes/supportDesk.js's
                      canRequest (false only for account_type='PLATFORM'). */}
                  <div className="dropdown-desc">{user?.accountType === 'PLATFORM' ? 'Manage support tickets' : 'Get help or open a ticket'}</div>
                </div>
              </a>

              <Link
                to="/settings/appearance"
                className="dropdown-item"
                onClick={() => setMenuOpen(false)}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Palette size={15} style={{ marginRight: 8 }} />
                <div className="dropdown-text">
                  <div className="dropdown-label">Appearance</div>
                  <div className="dropdown-desc">Font, accent colour &amp; density</div>
                </div>
              </Link>

              <div className="dropdown-item" onClick={toggleTheme}>
                {theme === 'light' ? <Moon size={15} style={{ marginRight: 8 }} /> : <Sun size={15} style={{ marginRight: 8 }} />}
                <div className="dropdown-text">
                  <div className="dropdown-label">{theme === 'light' ? 'Dark Theme' : 'Light Theme'}</div>
                  <div className="dropdown-desc">Switch interface display</div>
                </div>
              </div>
            </div>

            <div className="dropdown-section dropdown-footer">
              <button className="btn btn-danger btn-sm w-full" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <LogOut size={13} /> Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
