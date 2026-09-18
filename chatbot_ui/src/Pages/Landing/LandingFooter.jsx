import { Link } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';

// The one footer for every public marketing page — see LandingNavbar.jsx
// for why this was pulled out of each page into a shared component.
export default function LandingFooter() {
  const { user } = useAuth();
  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/agency';

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-top">
          <Link to="/landing" className="lp-footer-logo">
            <div className="lp-logo-icon" style={{ width: 32, height: 32 }}>
              <MessageSquare size={16} />
            </div>
            <span>Nexa AI Chat</span>
          </Link>

          <div className="lp-footer-links">
            <Link to="/landing#features" className="lp-footer-link">Features</Link>
            <Link to="/landing#benefits" className="lp-footer-link">Benefits</Link>
            <Link to="/pricing" className="lp-footer-link">Pricing</Link>
            <Link to="/blog" className="lp-footer-link">Blog</Link>
            <Link to="/privacy-policy" className="lp-footer-link">Privacy Policy</Link>
            <Link to="/terms-of-service" className="lp-footer-link">Terms of Service</Link>
            {user ? (
              <Link to={dashboardPath} className="lp-footer-link">Dashboard</Link>
            ) : (
              <Link to="/login" className="lp-footer-link">Sign In</Link>
            )}
          </div>
        </div>

        <div className="lp-footer-bottom">
          &copy; {new Date().getFullYear()} Nexa AI Chat. All rights reserved. Omnichannel AI Chatbot & Marketing Platform for Modern Businesses.
        </div>
      </div>
    </footer>
  );
}
