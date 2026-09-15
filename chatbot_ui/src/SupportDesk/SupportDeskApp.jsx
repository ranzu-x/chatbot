import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router";
import { SupportAuthProvider, useSupportAuth } from "./context/SupportAuthContext";
import SupportLoginPage from "./pages/SupportLoginPage";
import TicketListPage from "./pages/TicketListPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import NewTicketPage from "./pages/NewTicketPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import CannedResponsesPage from "./pages/CannedResponsesPage";
import ReportsPage from "./pages/ReportsPage";
import SupportShell from "./components/SupportShell";
import { ticketAPI } from "../services/supportDeskApi";
import "./supportDesk.css";

/**
 * Everything under /support/* — a fully self-contained subtree. Mounted
 * as a single catch-all route in App.jsx; nothing here imports AppLayout,
 * Sidebar, ProtectedRoute or RootRedirect from the main dashboard.
 */
export default function SupportDeskApp() {
  return (
    <SupportAuthProvider>
      <Routes>
        <Route path="login" element={<SupportLoginPage />} />
        <Route path="*" element={<SupportDeskGuarded />} />
      </Routes>
    </SupportAuthProvider>
  );
}

function SupportDeskGuarded() {
  const { user, loading } = useSupportAuth();
  const [bootstrap, setBootstrap] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);

  const loadBootstrap = useCallback(async () => {
    if (!user) return;
    setBootLoading(true);
    try {
      const res = await ticketAPI.bootstrap();
      setBootstrap(res.data);
    } finally {
      setBootLoading(false);
    }
  }, [user]);

  useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

  if (loading) return <div className="sd-root" style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/support/login" replace />;
  if (bootLoading || !bootstrap) return <div className="sd-root" style={{ padding: 40 }}>Loading…</div>;

  return (
    <SupportShell bootstrap={bootstrap}>
      <Routes>
        <Route index element={<Navigate to={bootstrap.canRequest === false ? "queue" : "tickets"} replace />} />
        <Route path="tickets" element={<TicketListPage mode="mine" />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="new" element={<NewTicketPage bootstrap={bootstrap} />} />
        <Route path="queue" element={<TicketListPage mode="queue" />} />
        <Route path="departments" element={bootstrap.canManage ? <DepartmentsPage /> : <Navigate to="/support/tickets" replace />} />
        <Route path="canned-responses" element={bootstrap.canManage ? <CannedResponsesPage /> : <Navigate to="/support/tickets" replace />} />
        <Route path="reports" element={bootstrap.canManage ? <ReportsPage /> : <Navigate to="/support/tickets" replace />} />
        <Route path="*" element={<Navigate to="/support/tickets" replace />} />
      </Routes>
    </SupportShell>
  );
}
