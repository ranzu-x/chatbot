import Sidebar from '../Components/Sidebar';
import TopBar from '../Components/TopBar';
import { useLayoutEffect } from 'react';
import { useLayout } from '../Provider/LayoutContext';
import EmailVerifyBanner from '../Components/Auth/EmailVerifyBanner';
import SubscriptionBanner from '../Components/Billing/SubscriptionBanner';
import { applySavedTheme } from '../theme/appearance';

/**
 * `hasSubmenu`: the page has its own left menu (Bot Manager's accounts,
 * Comment Automation's accounts, Roles list, App Settings sections) — the
 * main navigation is icon-only there, and the arrow opens it for that visit.
 */
export default function AppLayout({ children, hasSubmenu = false }) {
  const { collapsed, isInbox, registerSubmenu } = useLayout();
  // Registered before the first paint, so the main nav never flashes open.
  useLayoutEffect(() => (hasSubmenu ? registerSubmenu() : undefined), [hasSubmenu, registerSubmenu]);
  // The saved theme, before the first paint — the Inbox has no TopBar to apply it.
  useLayoutEffect(() => { applySavedTheme(); }, []);

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''} ${isInbox ? 'inbox-mode' : ''}`}>
      <Sidebar />
      <div className="main-content">
        {!isInbox && <TopBar />}
        <SubscriptionBanner />
        {!isInbox && <EmailVerifyBanner />}
        <div className="page-wrapper" style={{ height: isInbox ? '100vh' : 'auto', overflow: isInbox ? 'hidden' : 'visible' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
