import { Link, NavLink } from "react-router";
import { MessagesSquare, Megaphone, ListChecks, ShieldCheck, Sun, Moon, LogOut, LogIn, Plus } from "lucide-react";
import { useForumAuth } from "../context/ForumAuthContext";
import { useForumUI } from "../context/ForumUIContext";
import { isStaff } from "../constants";
import { Avatar } from "./Badges";

/**
 * The forum portal's own chrome: its own top bar, footer and theme toggle.
 * Nothing here comes from the dashboard (no AppLayout/Sidebar/TopBar) —
 * see ForumApp.jsx.
 */
export default function ForumShell({ children }) {
  const { user, logout } = useForumAuth();
  const { theme, toggleTheme } = useForumUI();

  return (
    <div className="fm-page">
      <header className="fm-topbar">
        <div className="fm-container fm-topbar-inner">
          <Link to="/forum" className="fm-brand">
            <span className="fm-brand-mark"><MessagesSquare size={17} /></span>
            Nexa Community
          </Link>

          <nav className="fm-nav">
            <NavLink to="/forum" end><MessagesSquare size={15} /> Community</NavLink>
            <NavLink to="/forum/announcements"><Megaphone size={15} /> Announcements</NavLink>
            {user && <NavLink to="/forum/my-threads"><ListChecks size={15} /> My Threads</NavLink>}
            {isStaff(user) && <NavLink to="/forum/moderation"><ShieldCheck size={15} /> Moderation</NavLink>}
          </nav>

          <span className="fm-spacer" />

          {user && (
            <Link to="/forum/new" className="fm-btn fm-btn-primary fm-btn-sm"><Plus size={14} /> New Thread</Link>
          )}
          <button type="button" className="fm-iconbtn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {user ? (
            <div className="fm-userchip" title={`${user.name} · ${isStaff(user) ? "Staff" : user.email}`}>
              <Avatar name={user.name} size={32} />
              <button type="button" className="fm-iconbtn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={15} /></button>
            </div>
          ) : (
            <Link to="/forum/login" className="fm-btn fm-btn-secondary fm-btn-sm"><LogIn size={14} /> Sign in</Link>
          )}
        </div>
      </header>

      <main>{children}</main>

      <footer className="fm-footer">
        <div className="fm-container">
          <span>&copy; {new Date().getFullYear()} Nexa AI Chat Community</span>
          <span><Link to="/landing">Back to Nexa AI Chat</Link></span>
        </div>
      </footer>
    </div>
  );
}
