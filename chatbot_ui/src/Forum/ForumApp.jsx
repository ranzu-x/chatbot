import { Routes, Route, Navigate } from "react-router";
import { LockKeyhole } from "lucide-react";
import { ForumUIProvider } from "./context/ForumUIContext";
import { ForumAuthProvider, useForumAuth } from "./context/ForumAuthContext";
import { isBlockedAccount, isStaff } from "./constants";
import ForumShell from "./components/ForumShell";
import ForumHomePage from "./pages/ForumHomePage";
import ThreadDetailPage from "./pages/ThreadDetailPage";
import NewThreadPage from "./pages/NewThreadPage";
import MyThreadsPage from "./pages/MyThreadsPage";
import ModerationPage from "./pages/ModerationPage";
import ForumLoginPage from "./pages/ForumLoginPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";

/**
 * Everything under /forum/* — a fully self-contained portal, isolated from
 * the dashboard exactly like the Support Desk is (see
 * SupportDesk/SupportDeskApp.jsx). Mounted as one catch-all route in
 * App.jsx; nothing in this folder imports AppLayout, Sidebar, TopBar,
 * ProtectedRoute, the dashboard's AuthContext/api client, or index.css
 * variables. Own session, own API client, own design system (forum.css).
 *
 * Publicly readable: being signed out is a normal state here.
 */
export default function ForumApp() {
  return (
    <ForumUIProvider>
      <ForumAuthProvider>
        <Routes>
          <Route path="login" element={<ForumLoginPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="*" element={<ForumMain />} />
        </Routes>
      </ForumAuthProvider>
    </ForumUIProvider>
  );
}

function ForumMain() {
  const { user, loading, logout } = useForumAuth();

  if (loading) return <div className="fm-fullpage"><div className="fm-spinner" /></div>;

  // A Reseller's own customers get nothing from the forum at all.
  if (isBlockedAccount(user)) {
    return (
      <div className="fm-fullpage" style={{ padding: 20 }}>
        <div className="fm-card fm-center">
          <span className="fm-bigicon" style={{ background: "var(--fm-accent-soft)", color: "var(--fm-accent)" }}><LockKeyhole size={26} /></span>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800 }}>The forum isn't available for your account</h2>
          <p style={{ color: "var(--fm-text-2)", margin: "8px 0 20px" }}>
            The community forum is for End User and Reseller accounts. Please contact your provider for help.
          </p>
          <button type="button" className="fm-btn fm-btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <ForumShell>
      <Routes>
        {/* `key` remounts the page when switching sections so filters/paging reset cleanly */}
        <Route index element={<ForumHomePage key="community" section="community" />} />
        <Route path="announcements" element={<ForumHomePage key="announcements" section="announcements" />} />
        <Route path="thread/:id" element={<ThreadDetailPage />} />
        <Route path="new" element={<NewThreadPage />} />
        <Route path="my-threads" element={<MyThreadsPage />} />
        <Route path="moderation" element={isStaff(user) ? <ModerationPage /> : <Navigate to="/forum" replace />} />
        <Route path="*" element={<Navigate to="/forum" replace />} />
      </Routes>
    </ForumShell>
  );
}
