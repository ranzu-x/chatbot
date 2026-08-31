import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../Provider/AuthContext';
import { useLayout } from '../Provider/LayoutContext';
import { useNotification } from '../Provider/NotificationContext';
import { Menu, PanelLeft, PanelLeftClose, Sun, Moon, Plug, LogOut, Bell } from 'lucide-react';

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
    if (user?.role === 'AGENCY') return '/agency/integrations';
    return null;
  };

  const apiLink = getApiLink();

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

        <span className="platform-tag" style={{ fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(37, 99, 235, 0.08)', color: 'var(--primary)' }}>
          ⚡ Nexa Workspace
        </span>
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
            <div className="dropdown-section dropdown-header">
              <div className="dropdown-user-name">{user?.name || 'Account'}</div>
              <div className="dropdown-user-email">{user?.email || ''}</div>
              <span className="role-badge">{user?.role || 'AGENT'}</span>
            </div>

            <div className="dropdown-section">
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
