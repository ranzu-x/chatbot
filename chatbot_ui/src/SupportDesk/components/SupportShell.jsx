import { Link, useLocation } from "react-router";
import { LifeBuoy, Inbox, LayoutGrid, MessageSquareText, Plus, LogOut, Menu, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";

export default function SupportShell({ bootstrap, children }) {
  const { user, logout } = useSupportAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="sd-root">
      <div className="sd-shell">
        <aside className={`sd-nav ${navOpen ? "open" : ""}`}>
          <div className="sd-nav-brand">
            <LifeBuoy size={20} /> Support Desk
          </div>

          {bootstrap?.canRequest !== false && (
            <>
              <Link to="/support/tickets" className={`sd-nav-item ${isActive("/support/tickets") && !isActive("/support/queue") ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                <Inbox size={16} /> My Tickets
              </Link>
              <Link to="/support/new" className={`sd-nav-item ${isActive("/support/new") ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                <Plus size={16} /> New Ticket
              </Link>
            </>
          )}

          {(bootstrap?.canView || bootstrap?.canManage) && (
            <>
              <div className="sd-nav-section-label">Helpdesk Staff</div>
              <Link to="/support/queue" className={`sd-nav-item ${isActive("/support/queue") ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                <LayoutGrid size={16} /> Support Queue
              </Link>
              {bootstrap?.canManage && (
                <>
                  <Link to="/support/departments" className={`sd-nav-item ${isActive("/support/departments") ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                    <LayoutGrid size={16} /> Departments
                  </Link>
                  <Link to="/support/canned-responses" className={`sd-nav-item ${isActive("/support/canned-responses") ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                    <MessageSquareText size={16} /> Canned Responses
                  </Link>
                  <Link to="/support/reports" className={`sd-nav-item ${isActive("/support/reports") ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                    <TrendingUp size={16} /> CSAT Reports
                  </Link>
                </>
              )}
            </>
          )}

          <div className="sd-nav-footer">
            <div style={{ padding: "6px 10px 10px", fontSize: "0.78rem", color: "var(--sd-text-muted)" }}>
              {user?.name}
              <div style={{ fontSize: "0.7rem", color: "var(--sd-text-faint)" }}>{user?.email}</div>
            </div>
            <button type="button" className="sd-nav-item" onClick={logout}>
              <LogOut size={16} /> Log Out
            </button>
          </div>
        </aside>

        <div className="sd-main">
          <div className="sd-topbar">
            <button type="button" className="sd-btn sd-btn-secondary sd-btn-sm" style={{ display: "none" }} onClick={() => setNavOpen((o) => !o)}>
              <Menu size={14} />
            </button>
            <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>Support Desk</span>
            <span />
          </div>
          <div className="sd-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
