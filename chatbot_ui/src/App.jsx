import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './Provider/AuthContext';
import { LayoutProvider } from './Provider/LayoutContext';
import { NotificationProvider } from './Provider/NotificationContext';
import ProtectedRoute from './Router/ProtectedRoute';

// Public landing pages
import LandingPage    from './Pages/Landing/LandingPage';
import PrivacyPolicy  from './Pages/Landing/PrivacyPolicy';
import TermsOfService from './Pages/Landing/TermsOfService';

// Core pages
import Login            from './Pages/LogIn/Login';
import Register         from './Pages/Register/Register';
import AdminDashboard   from './Pages/Dashboard/AdminDashboard';
import AgencyDashboard  from './Pages/Dashboard/AgencyDashboard';
import AgenciesPage     from './Pages/SuperAdmin/AgenciesPage';
import UsersPage        from './Pages/SuperAdmin/UsersPage';
import AgentsPage       from './Pages/Agency/AgentsPage';
import IntegrationsPage from './Pages/Agency/IntegrationsPage';
import PackagesPage     from './Pages/SuperAdmin/PackagesPage';
import DomainSettingsPage from './Pages/Agency/DomainSettingsPage';
import MyPlanPage       from './Pages/Agency/MyPlanPage';
import BillingSuccessPage from './Pages/Billing/BillingSuccessPage';
import AIAgentPage      from './Pages/AI/AIAgentPage';
import WebhooksManagerPage from './Pages/Integrations/WebhooksManagerPage';
import OrdersPage       from './Pages/Payments/OrdersPage';
import InChatPaymentCheckoutPage from './Pages/Payments/InChatPaymentCheckoutPage';
import InboxPage        from './Pages/Inbox/InboxPage';

// Channel & Connect Account pages
import ConnectAccountsPage from './Pages/Channels/ConnectAccountsPage';
import WhatsAppPage        from './Pages/Channels/WhatsAppPage';
import FacebookPage        from './Pages/Channels/FacebookPage';
import InstagramPage       from './Pages/Channels/InstagramPage';
import TelegramPage        from './Pages/Channels/TelegramPage';
import TikTokPage          from './Pages/Channels/TikTokPage';
import WebchatPage         from './Pages/Channels/WebchatPage';

// Bot & Settings
import BotManagerPage        from './Pages/Bots/BotManagerPage';
import AppSettingsHubPage    from './Pages/Settings/AppSettingsHubPage';
import MetaAppPage           from './Pages/Settings/MetaAppPage';
import TikTokAppPage         from './Pages/Settings/TikTokAppPage';

// Flow Builder
import FlowListPage     from './Pages/Flows/FlowListPage';
import FlowBuilderPage  from './Pages/Flows/FlowBuilderPage';

// Contacts & Campaigns
import ContactsPage          from './Pages/Contacts/ContactsPage';
import CampaignListPage      from './Pages/Campaigns/CampaignListPage';
import SocialPostingPage     from './Pages/Publishing/SocialPostingPage';

import { Toaster } from 'react-hot-toast';

const ADMIN_AGENCY = ['ADMIN', 'AGENCY'];
const ALL_ROLES    = ['ADMIN', 'AGENCY', 'AGENT'];

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" reverseOrder={false} />
      <BrowserRouter>
        <LayoutProvider>
          <NotificationProvider>
            <Routes>
              {/* ── Public Landing & Auth ── */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* ── Admin ── */}
              <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/packages" element={<ProtectedRoute roles={['ADMIN']}><PackagesPage /></ProtectedRoute>} />
              <Route path="/packages" element={<ProtectedRoute roles={['ADMIN']}><PackagesPage /></ProtectedRoute>} />
              <Route path="/admin/agencies" element={<ProtectedRoute roles={['ADMIN']}><AgenciesPage /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute roles={ADMIN_AGENCY}><UsersPage /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute roles={ADMIN_AGENCY}><UsersPage /></ProtectedRoute>} />
              <Route path="/admin/agents" element={<ProtectedRoute roles={['ADMIN']}><AgentsPage /></ProtectedRoute>} />
              <Route path="/admin/integrations" element={<ProtectedRoute roles={['ADMIN']}><IntegrationsPage /></ProtectedRoute>} />

            {/* ── Agency ── */}
            <Route path="/agency" element={<ProtectedRoute roles={['AGENCY']}><AgencyDashboard /></ProtectedRoute>} />
            <Route path="/agency/plan" element={<ProtectedRoute roles={ADMIN_AGENCY}><MyPlanPage /></ProtectedRoute>} />
            <Route path="/plan" element={<ProtectedRoute roles={ADMIN_AGENCY}><MyPlanPage /></ProtectedRoute>} />
            <Route path="/billing/success" element={<ProtectedRoute roles={ADMIN_AGENCY}><BillingSuccessPage /></ProtectedRoute>} />
            <Route path="/agency/agents" element={<ProtectedRoute roles={['AGENCY']}><AgentsPage /></ProtectedRoute>} />
            <Route path="/agency/integrations" element={<ProtectedRoute roles={['AGENCY']}><IntegrationsPage /></ProtectedRoute>} />
            <Route path="/agency/domain-settings" element={<ProtectedRoute roles={ADMIN_AGENCY}><DomainSettingsPage /></ProtectedRoute>} />
            <Route path="/domain-settings" element={<ProtectedRoute roles={ADMIN_AGENCY}><DomainSettingsPage /></ProtectedRoute>} />

            {/* ── Connect Account Central Hub (Admin + Agency) ── */}
            <Route path="/connect-accounts"   element={<ProtectedRoute roles={ADMIN_AGENCY}><ConnectAccountsPage /></ProtectedRoute>} />
            <Route path="/channels"           element={<ProtectedRoute roles={ADMIN_AGENCY}><ConnectAccountsPage /></ProtectedRoute>} />
            <Route path="/channels/whatsapp"  element={<ProtectedRoute roles={ADMIN_AGENCY}><WhatsAppPage /></ProtectedRoute>} />
            <Route path="/channels/facebook"  element={<ProtectedRoute roles={ADMIN_AGENCY}><FacebookPage /></ProtectedRoute>} />
            <Route path="/channels/instagram" element={<ProtectedRoute roles={ADMIN_AGENCY}><InstagramPage /></ProtectedRoute>} />
            <Route path="/channels/telegram"  element={<ProtectedRoute roles={ADMIN_AGENCY}><TelegramPage /></ProtectedRoute>} />
            <Route path="/channels/tiktok"    element={<ProtectedRoute roles={ADMIN_AGENCY}><TikTokPage /></ProtectedRoute>} />
            <Route path="/channels/webchat"   element={<ProtectedRoute roles={ADMIN_AGENCY}><WebchatPage /></ProtectedRoute>} />

            {/* ── Bot Manager (Visual Flow Bots) ── */}
            <Route path="/bots" element={<ProtectedRoute roles={ALL_ROLES}><BotManagerPage /></ProtectedRoute>} />
            <Route path="/bots/:id" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/bots/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/flows" element={<Navigate to="/bots" replace />} />
            <Route path="/flows/new" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/flows/:id" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/flows/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute roles={ADMIN_AGENCY}><CampaignListPage /></ProtectedRoute>} />
            <Route path="/social-posting" element={<ProtectedRoute roles={ADMIN_AGENCY}><SocialPostingPage /></ProtectedRoute>} />
            <Route path="/publishing" element={<ProtectedRoute roles={ADMIN_AGENCY}><SocialPostingPage /></ProtectedRoute>} />
            <Route path="/ai-agent" element={<ProtectedRoute roles={ADMIN_AGENCY}><AIAgentPage /></ProtectedRoute>} />
            <Route path="/ai" element={<ProtectedRoute roles={ADMIN_AGENCY}><AIAgentPage /></ProtectedRoute>} />
            <Route path="/webhooks" element={<ProtectedRoute roles={ADMIN_AGENCY}><WebhooksManagerPage /></ProtectedRoute>} />
            <Route path="/integrations/webhooks" element={<ProtectedRoute roles={ADMIN_AGENCY}><WebhooksManagerPage /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute roles={ADMIN_AGENCY}><OrdersPage /></ProtectedRoute>} />
            <Route path="/payments/orders" element={<ProtectedRoute roles={ADMIN_AGENCY}><OrdersPage /></ProtectedRoute>} />

            {/* ── Settings & App Integrations Hub ── */}
            <Route path="/settings/apps" element={<ProtectedRoute roles={ADMIN_AGENCY}><AppSettingsHubPage /></ProtectedRoute>} />
            <Route path="/settings/app-integrations" element={<ProtectedRoute roles={ADMIN_AGENCY}><AppSettingsHubPage /></ProtectedRoute>} />
            <Route path="/agency/integrations" element={<ProtectedRoute roles={ADMIN_AGENCY}><AppSettingsHubPage /></ProtectedRoute>} />
            <Route path="/settings/meta-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><MetaAppPage /></ProtectedRoute>} />
            <Route path="/settings/tiktok-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><TikTokAppPage /></ProtectedRoute>} />

            {/* ── Live Chat Inbox & Contacts ── */}
            <Route path="/inbox" element={<ProtectedRoute roles={ALL_ROLES}><InboxPage /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute roles={ALL_ROLES}><ContactsPage /></ProtectedRoute>} />

            {/* ── Public Pages ── */}
            <Route path="/landing"          element={<LandingPage />} />
            <Route path="/payments/pay/:orderId" element={<InChatPaymentCheckoutPage />} />
            <Route path="/privacy-policy"   element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </NotificationProvider>
        </LayoutProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
