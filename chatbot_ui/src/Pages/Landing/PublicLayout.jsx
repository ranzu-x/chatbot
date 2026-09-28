import { Outlet } from 'react-router';
import './landing.css';
import './blog.css';
import ChatWidgetEmbed from '../../Components/Common/ChatWidgetEmbed';
import LandingNavbar from './LandingNavbar';
import LandingFooter from './LandingFooter';
import { ResellerFooter } from './ResellerLanding';
import usePublicSite from '../../hooks/usePublicSite';

// Shared shell for every public marketing page (Landing, Pricing, Blog,
// Privacy Policy, Terms of Service). React Router keeps this element
// mounted across navigations between its child routes, so the navbar,
// footer and chat widget never remount — only <Outlet /> swaps.
// On a Reseller's address: the Reseller's footer, and not the platform's own
// chat widget.
export default function PublicLayout() {
  const publicSite = usePublicSite();
  const isReseller = publicSite.kind === 'RESELLER';
  return (
    <div className="lp-wrapper">
      {!publicSite.loading && !isReseller && <ChatWidgetEmbed />}
      <LandingNavbar />
      <Outlet />
      {!publicSite.loading && (isReseller ? <ResellerFooter publicSite={publicSite} /> : <LandingFooter />)}
    </div>
  );
}
