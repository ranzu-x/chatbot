import { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router';

const LayoutContext = createContext();

export function LayoutProvider({ children }) {
  const location = useLocation();

  // Load initial collapsed state from localStorage or default to false
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved !== null ? saved === 'true' : false;
  });

  // Popup overlay drawer state for navigation
  const [popupNavOpen, setPopupNavOpen] = useState(false);

  const isInbox = location.pathname.startsWith('/inbox');

  // Close popup drawer automatically when navigating to another route
  useEffect(() => {
    setPopupNavOpen(false);
  }, [location.pathname]);

  // Auto-collapse when entering complex workspace pages if not user-locked
  useEffect(() => {
    const isWorkspace =
      location.pathname.startsWith('/bots') ||
      location.pathname.startsWith('/inbox') ||
      location.pathname.startsWith('/flows');

    const userLocked = localStorage.getItem('sidebar_user_locked');
    if (isWorkspace && !userLocked) {
      setCollapsed(true);
    }
  }, [location.pathname]);

  const toggleSidebar = () => {
    if (isInbox) {
      setPopupNavOpen((prev) => !prev);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      localStorage.setItem('sidebar_user_locked', 'true');
      return next;
    });
  };

  const openPopupNav = () => setPopupNavOpen(true);
  const closePopupNav = () => setPopupNavOpen(false);
  const togglePopupNav = () => setPopupNavOpen((prev) => !prev);

  return (
    <LayoutContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleSidebar,
        popupNavOpen,
        setPopupNavOpen,
        openPopupNav,
        closePopupNav,
        togglePopupNav,
        isInbox,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  return (
    ctx || {
      collapsed: false,
      toggleSidebar: () => {},
      popupNavOpen: false,
      openPopupNav: () => {},
      closePopupNav: () => {},
      togglePopupNav: () => {},
      isInbox: false,
    }
  );
}
