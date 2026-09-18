import { Outlet } from 'react-router';
import './landing.css';
import './blog.css';
import ChatWidgetEmbed from '../../Components/Common/ChatWidgetEmbed';
import LandingNavbar from './LandingNavbar';
import LandingFooter from './LandingFooter';

// Shared shell for every public marketing page (Landing, Pricing, Blog,
// Privacy Policy, Terms of Service). React Router keeps this element
// mounted across navigations between its child routes, so the navbar,
// footer and chat widget never remount — only <Outlet /> swaps.
export default function PublicLayout() {
  return (
    <div className="lp-wrapper">
      <ChatWidgetEmbed />
      <LandingNavbar />
      <Outlet />
      <LandingFooter />
    </div>
  );
}
