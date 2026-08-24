import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../Provider/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();
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
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
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

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <span className="platform-tag">⚡ SaaS Portal</span>
      </div>

      <div className="top-bar-right" ref={menuRef}>
        <div 
          className="top-bar-user-trigger"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <div className="avatar avatar-sm avatar-glow">{getInitials(user?.name)}</div>
          <span className="user-trigger-name">{user?.name || 'My Account'}</span>
          <span className={`trigger-arrow ${menuOpen ? 'open' : ''}`}>▼</span>
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
                <div 
                  className="dropdown-item" 
                  onClick={() => { setMenuOpen(false); navigate(apiLink); }}
                >
                  <span className="dropdown-icon">🔌</span>
                  <div className="dropdown-text">
                    <div className="dropdown-label">API & Integrations</div>
                    <div className="dropdown-desc">Manage API connections</div>
                  </div>
                </div>
              )}

              <div className="dropdown-item" onClick={toggleTheme}>
                <span className="dropdown-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
                <div className="dropdown-text">
                  <div className="dropdown-label">{theme === 'light' ? 'Dark Theme' : 'Light Theme'}</div>
                  <div className="dropdown-desc">Switch interface display</div>
                </div>
              </div>
            </div>

            <div className="dropdown-section dropdown-footer">
              <button className="btn btn-danger btn-sm w-full" onClick={handleLogout}>
                🚪 Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
