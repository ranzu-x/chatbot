import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router';

const LayoutContext = createContext();

const readPreference = () => {
  try {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  } catch {
    return false;
  }
};

/**
 * Main navigation width.
 *
 * - Normal pages: the person's own choice, remembered (`sidebar_collapsed`).
 * - Pages with their own sub-menu (`<AppLayout hasSubmenu>` → registerSubmenu):
 *   the main nav is icon-only every time the page opens, so the page's own
 *   menu has room; the arrow shows the full menu for that visit only and never
 *   changes the remembered choice for other pages.
 * - The Inbox keeps its pop-out menu (`isInbox`).
 */
export function LayoutProvider({ children }) {
  const location = useLocation();

  const [preferredCollapsed, setPreferredCollapsed] = useState(readPreference);
  const [submenuPages, setSubmenuPages] = useState(0); // pages on screen that declared a sub-menu
  const [submenuExpanded, setSubmenuExpanded] = useState(false);

  // Popup overlay drawer state for navigation
  const [popupNavOpen, setPopupNavOpen] = useState(false);

  const isInbox = location.pathname === '/inbox' || location.pathname === '/inbox/'; // not /inbox/insights
  const hasSubmenu = submenuPages > 0;
  const collapsed = hasSubmenu ? !submenuExpanded : preferredCollapsed;

  // A new page starts collapsed again if it has a sub-menu; close the popup drawer too.
  useEffect(() => {
    setPopupNavOpen(false);
    setSubmenuExpanded(false);
  }, [location.pathname]);

  // The old "never auto-collapse again after one toggle" flag is gone.
  useEffect(() => {
    try { localStorage.removeItem('sidebar_user_locked'); } catch { /* storage unavailable */ }
  }, []);

  const toggleSidebar = () => {
    if (isInbox) {
      setPopupNavOpen((prev) => !prev);
      return;
    }
    if (hasSubmenu) {
      setSubmenuExpanded((prev) => !prev);
      return;
    }
    setPreferredCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const setCollapsed = (value) => {
    if (hasSubmenu) setSubmenuExpanded(!value);
    else setPreferredCollapsed(value);
  };

  const registerSubmenu = useCallback(() => {
    setSubmenuPages((n) => n + 1);
    return () => setSubmenuPages((n) => Math.max(0, n - 1));
  }, []);

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
        hasSubmenu,
        registerSubmenu,
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
      hasSubmenu: false,
      registerSubmenu: () => () => {},
    }
  );
}

