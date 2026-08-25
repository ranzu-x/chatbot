import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './Provider/AuthContext';
import ProtectedRoute from './Router/ProtectedRoute';

// Public landing pages
import LandingPage    from './Pages/Landing/LandingPage';
import PrivacyPolicy  from './Pages/Landing/PrivacyPolicy';
import TermsOfService from './Pages/Landing/TermsOfService';

// Core pages
import Login            from './Pages/LogIn/Login';
import AdminDashboard   from './Pages/Dashboard/AdminDashboard';
import AgencyDashboard  from './Pages/Dashboard/AgencyDashboard';
import AgenciesPage     from './Pages/SuperAdmin/AgenciesPage';
import UsersPage        from './Pages/SuperAdmin/UsersPage';
import AgentsPage       from './Pages/Agency/AgentsPage';
import IntegrationsPage from './Pages/Agency/IntegrationsPage';
import InboxPage        from './Pages/Inbox/InboxPage';

// Channel pages
import WhatsAppPage     from './Pages/Channels/WhatsAppPage';
import FacebookPage     from './Pages/Channels/FacebookPage';
import InstagramPage    from './Pages/Channels/InstagramPage';
import TelegramPage     from './Pages/Channels/TelegramPage';
import WebchatPage      from './Pages/Channels/WebchatPage';

// Bot & Settings
import BotManagerPage   from './Pages/Bots/BotManagerPage';
import MetaAppPage      from './Pages/Settings/MetaAppPage';

// Flow Builder
import FlowListPage     from './Pages/Flows/FlowListPage';
import FlowBuilderPage  from './Pages/Flows/FlowBuilderPage';

// Contacts, Templates & Campaigns
import ContactsPage          from './Pages/Contacts/ContactsPage';
import WhatsAppTemplatesPage from './Pages/Templates/WhatsAppTemplatesPage';
import CampaignListPage      from './Pages/Campaigns/CampaignListPage';
import SequenceCampaignPage  from './Pages/Campaigns/SequenceCampaignPage';

const ADMIN_AGENCY = ['ADMIN', 'AGENCY'];
const ALL_ROLES    = ['ADMIN', 'AGENCY', 'AGENT'];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* ── Admin ── */}
          <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/agencies" element={<ProtectedRoute roles={['ADMIN']}><AgenciesPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
          <Route path="/admin/agents" element={<ProtectedRoute roles={['ADMIN']}><AgentsPage /></ProtectedRoute>} />
          <Route path="/admin/integrations" element={<ProtectedRoute roles={['ADMIN']}><IntegrationsPage /></ProtectedRoute>} />

          {/* ── Agency ── */}
          <Route path="/agency" element={<ProtectedRoute roles={['AGENCY']}><AgencyDashboard /></ProtectedRoute>} />
          <Route path="/agency/agents" element={<ProtectedRoute roles={['AGENCY']}><AgentsPage /></ProtectedRoute>} />
          <Route path="/agency/integrations" element={<ProtectedRoute roles={['AGENCY']}><IntegrationsPage /></ProtectedRoute>} />

          {/* ── Channels (Admin + Agency) ── */}
          <Route path="/channels/whatsapp"  element={<ProtectedRoute roles={ADMIN_AGENCY}><WhatsAppPage /></ProtectedRoute>} />
          <Route path="/channels/facebook"  element={<ProtectedRoute roles={ADMIN_AGENCY}><FacebookPage /></ProtectedRoute>} />
          <Route path="/channels/instagram" element={<ProtectedRoute roles={ADMIN_AGENCY}><InstagramPage /></ProtectedRoute>} />
          <Route path="/channels/telegram"  element={<ProtectedRoute roles={ADMIN_AGENCY}><TelegramPage /></ProtectedRoute>} />
          <Route path="/channels/webchat"   element={<ProtectedRoute roles={ADMIN_AGENCY}><WebchatPage /></ProtectedRoute>} />

          {/* ── Bot Manager (Visual Flow Bots) ── */}
          <Route path="/bots" element={<ProtectedRoute roles={ALL_ROLES}><BotManagerPage /></ProtectedRoute>} />
          <Route path="/bots/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
          <Route path="/flows" element={<Navigate to="/bots" replace />} />
          <Route path="/flows/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
          <Route path="/templates/whatsapp" element={<ProtectedRoute roles={ADMIN_AGENCY}><WhatsAppTemplatesPage /></ProtectedRoute>} />
          <Route path="/campaigns" element={<ProtectedRoute roles={ADMIN_AGENCY}><CampaignListPage /></ProtectedRoute>} />
          <Route path="/campaigns/sequence" element={<ProtectedRoute roles={ADMIN_AGENCY}><SequenceCampaignPage /></ProtectedRoute>} />

          {/* ── Settings ── */}
          <Route path="/settings/meta-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><MetaAppPage /></ProtectedRoute>} />

          {/* ── Live Chat Inbox & Contacts ── */}
          <Route path="/inbox" element={<ProtectedRoute roles={ALL_ROLES}><InboxPage /></ProtectedRoute>} />
          <Route path="/contacts" element={<ProtectedRoute roles={ALL_ROLES}><ContactsPage /></ProtectedRoute>} />

          {/* ── Public Pages ── */}
          <Route path="/landing"          element={<LandingPage />} />
          <Route path="/privacy-policy"   element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
