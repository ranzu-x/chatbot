import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { AuthProvider } from './Provider/AuthContext';
import { LayoutProvider } from './Provider/LayoutContext';
import { NotificationProvider } from './Provider/NotificationContext';
import ProtectedRoute from './Router/ProtectedRoute';
import PublicRoute from './Router/PublicRoute';
import RootRedirect from './Router/RootRedirect';
import { captureAffiliateRef } from './utils/affiliateTracking';

function AffiliateTracker() {
  const location = useLocation();
  useEffect(() => {
    captureAffiliateRef();
  }, [location.search]);
  return null;
}

// Public landing pages
import PublicLayout   from './Pages/Landing/PublicLayout';
import LandingPage    from './Pages/Landing/LandingPage';
import PrivacyPolicy  from './Pages/Landing/PrivacyPolicy';
import PricingPage from './Pages/Landing/PricingPage';
import GuestCheckoutPage from './Pages/Landing/GuestCheckoutPage';
import CheckoutCompletePage from './Pages/Landing/CheckoutCompletePage';
import TermsOfService from './Pages/Landing/TermsOfService';
import BlogListPage   from './Pages/Landing/BlogListPage';
import BlogDetailPage from './Pages/Landing/BlogDetailPage';
import VerifyEmailPage from './Pages/Auth/VerifyEmailPage';
import ForgotPasswordPage from './Pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from './Pages/Auth/ResetPasswordPage';

// Community Forum — a fully standalone portal (own shell, session and
// design system), mounted as ONE catch-all route below exactly like the
// Support Desk. Nothing in ./Forum touches the dashboard.
import ForumApp from './Forum/ForumApp';

// Core pages
import Login            from './Pages/LogIn/Login';
import Register         from './Pages/Register/Register';
import AdminDashboard   from './Pages/Dashboard/AdminDashboard';
import AgencyDashboard  from './Pages/Dashboard/AgencyDashboard';
// Super Admin section — ADMIN-only, and the second-biggest slice of the
// bundle after Flow Builder (AgenciesPage/UsersPage/PackagesPage alone are
// ~3000 lines combined). Lazy-loaded below so a RESELLER/USER login — the
// overwhelming majority of sessions — never downloads any of it.
const AgenciesPage         = lazy(() => import('./Pages/SuperAdmin/AgenciesPage'));
const UsersPage            = lazy(() => import('./Pages/SuperAdmin/UsersPage'));
const UserEditPage         = lazy(() => import('./Pages/SuperAdmin/UserEditPage'));
const AdminTeamPage        = lazy(() => import('./Pages/SuperAdmin/AdminTeamPage'));
const PlatformSettingsPage = lazy(() => import('./Pages/SuperAdmin/PlatformSettingsPage'));
const AuditLogPage         = lazy(() => import('./Pages/SuperAdmin/AuditLogPage'));
const BlogManagerPage      = lazy(() => import('./Pages/SuperAdmin/BlogManagerPage'));
const BlogEditorPage       = lazy(() => import('./Pages/SuperAdmin/BlogEditorPage'));
const PackagesPage         = lazy(() => import('./Pages/SuperAdmin/PackagesPage'));
const PaymentGatewaysPage  = lazy(() => import('./Pages/SuperAdmin/PaymentGatewaysPage'));
const AffiliatesPage       = lazy(() => import('./Pages/SuperAdmin/AffiliatesPage'));
const AffiliateDashboardPage = lazy(() => import('./Pages/Affiliate/AffiliateDashboardPage'));
import TeamMembersPage  from './Pages/Team/TeamMembersPage';
import RolesPage        from './Pages/Roles/RolesPage';
import ResellerCustomersPage from './Pages/Agency/ResellerCustomersPage';
import AgencyPackagesPage    from './Pages/Agency/AgencyPackagesPage';
import IntegrationsPage from './Pages/Agency/IntegrationsPage';
import DomainSettingsPage from './Pages/Agency/DomainSettingsPage';
import ApiKeysPage from './Pages/Agency/ApiKeysPage';
import MyAccountPage    from './Pages/Account/MyAccountPage';
import BillingSuccessPage from './Pages/Billing/BillingSuccessPage';
import WebhooksManagerPage from './Pages/Integrations/WebhooksManagerPage';
import OrdersPage       from './Pages/Payments/OrdersPage';
import InChatPaymentCheckoutPage from './Pages/Payments/InChatPaymentCheckoutPage';
import SupportDeskApp from './SupportDesk/SupportDeskApp';
import AppearancePage from './Pages/Settings/AppearancePage';
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
import AIProvidersPage       from './Pages/Settings/AIProvidersPage';
import CannedResponsesPage   from './Pages/Settings/CannedResponsesPage';
import BusinessHoursPage     from './Pages/Settings/BusinessHoursPage';

// Flow Builder — by far the single biggest file in the app (10k+ lines: the
// canvas, every node type's property panel, Sequence/User-Input-Flow modes).
// Lazy-loaded so it only downloads when someone actually opens a bot/flow.
import FlowListPage     from './Pages/Flows/FlowListPage';
const FlowBuilderPage   = lazy(() => import('./Pages/Flows/FlowBuilderPage'));

// User Input Flows (reusable question sequences) — the builder is FlowBuilderPage
// running in User Input Flow mode, keyed off the /user-input-flows route. The
// list itself now lives inside Bot Manager → Automation (UserInputFlowManagerList),
// not a standalone page — same reasoning /flows below already redirects to /bots.
import GoogleSheetsSettingsPage   from './Pages/Settings/GoogleSheetsSettingsPage';

// Contacts & Campaigns
import ContactsPage          from './Pages/Contacts/ContactsPage';
import CampaignListPage      from './Pages/Campaigns/CampaignListPage';
import SocialPostingPage     from './Pages/Publishing/SocialPostingPage';
import CommentAutomationPage from './Pages/Engagement/CommentAutomationPage';
import AppointmentList       from './Pages/Appointment/AppointmentList';
import SlotManager           from './Pages/Appointment/SlotManager';
import PublicBookingPage     from './Pages/Appointment/PublicBookingPage';

import AppToaster from './Components/Common/AppToaster';

const ADMIN_AGENCY = ['ADMIN', 'RESELLER'];
const ALL_ROLES    = ['ADMIN', 'RESELLER', 'USER'];

export default function App() {
  useEffect(() => {
    captureAffiliateRef();
  }, []);

  return (
    <AuthProvider>
      <AppToaster />
      <BrowserRouter>
        <AffiliateTracker />
        <LayoutProvider>
          <NotificationProvider>
            <Suspense fallback={<div className="loading-overlay"><div className="loading-spinner" /></div>}>
            <Routes>
              {/* ── Public Landing & Auth ── */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
              <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />

              {/* ── Admin ── */}
              <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/packages" element={<ProtectedRoute roles={['ADMIN']}><PackagesPage /></ProtectedRoute>} />
              <Route path="/packages" element={<ProtectedRoute roles={['ADMIN']}><PackagesPage /></ProtectedRoute>} />
              <Route path="/admin/agencies" element={<ProtectedRoute roles={['ADMIN']}><AgenciesPage /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
              {/* Full-page user create / edit (replaced the modal in UsersPage) */}
              <Route path="/admin/users/new" element={<ProtectedRoute roles={['ADMIN']}><UserEditPage /></ProtectedRoute>} />
              <Route path="/admin/users/:id/edit" element={<ProtectedRoute roles={['ADMIN']}><UserEditPage /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute roles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
              <Route path="/admin/agents" element={<ProtectedRoute roles={['ADMIN']}><TeamMembersPage /></ProtectedRoute>} />
              <Route path="/admin/team" element={<ProtectedRoute roles={['ADMIN']}><AdminTeamPage /></ProtectedRoute>} />
              <Route path="/admin/integrations" element={<ProtectedRoute roles={['ADMIN']}><IntegrationsPage /></ProtectedRoute>} />
              {/* Resellers merged into Agencies (see routes/admin.js) — "Reseller" is
                  now just a capability flag on an agency, not a separate page. */}
              <Route path="/admin/resellers" element={<Navigate to="/admin/agencies" replace />} />
              <Route path="/admin/platform-settings" element={<ProtectedRoute roles={['ADMIN']}><PlatformSettingsPage /></ProtectedRoute>} />
              <Route path="/admin/affiliates" element={<ProtectedRoute roles={['ADMIN']}><AffiliatesPage /></ProtectedRoute>} />
              <Route path="/roles" element={<ProtectedRoute roles={ADMIN_AGENCY}><RolesPage /></ProtectedRoute>} />
              <Route path="/admin/audit-log" element={<ProtectedRoute roles={ADMIN_AGENCY}><AuditLogPage /></ProtectedRoute>} />
              <Route path="/reseller/customers" element={<ProtectedRoute roles={['RESELLER']}><ResellerCustomersPage /></ProtectedRoute>} />
              <Route path="/reseller/users" element={<ProtectedRoute roles={['RESELLER']}><UsersPage scope="reseller" /></ProtectedRoute>} />
              {/* "Packages & Modules" for an agency is now package-creation for ITS
                  OWN customers (used to be reseller-only) — /reseller/packages kept
                  as a working alias, /agency/packages is the primary path now. */}
              <Route path="/reseller/packages" element={<ProtectedRoute roles={['RESELLER']}><AgencyPackagesPage /></ProtectedRoute>} />
              <Route path="/agency/packages" element={<ProtectedRoute roles={['RESELLER']}><AgencyPackagesPage /></ProtectedRoute>} />

            {/* ── Agency ── */}
            <Route path="/agency" element={<ProtectedRoute roles={['RESELLER', 'USER']}><AgencyDashboard /></ProtectedRoute>} />
            {/* The agency's OWN assigned plan moved to My Account → Billing. */}
            <Route path="/agency/plan" element={<Navigate to="/my-account?tab=billing" replace />} />
            <Route path="/plan" element={<Navigate to="/my-account?tab=billing" replace />} />
            <Route path="/my-account" element={<ProtectedRoute roles={ALL_ROLES}><MyAccountPage /></ProtectedRoute>} />
            {/* Affiliate Program — DIRECT_CUSTOMER/RESELLER tenants only (self-guards
                on accountType inside; TopBar.jsx only shows the menu link to them). */}
            <Route path="/affiliate" element={<ProtectedRoute roles={ALL_ROLES}><AffiliateDashboardPage /></ProtectedRoute>} />
            <Route path="/billing/success" element={<ProtectedRoute roles={ADMIN_AGENCY}><BillingSuccessPage /></ProtectedRoute>} />
            <Route path="/agency/agents" element={<ProtectedRoute roles={['RESELLER']}><TeamMembersPage /></ProtectedRoute>} />
            <Route path="/agency/team" element={<ProtectedRoute roles={['RESELLER']}><TeamMembersPage /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute roles={ALL_ROLES}><TeamMembersPage /></ProtectedRoute>} />
            <Route path="/team-members" element={<ProtectedRoute roles={ALL_ROLES}><TeamMembersPage /></ProtectedRoute>} />
            <Route path="/agency/domain-settings" element={<ProtectedRoute roles={ADMIN_AGENCY}><DomainSettingsPage /></ProtectedRoute>} />
            <Route path="/domain-settings" element={<ProtectedRoute roles={ADMIN_AGENCY}><DomainSettingsPage /></ProtectedRoute>} />
            <Route path="/agency/api-keys" element={<ProtectedRoute roles={ADMIN_AGENCY}><ApiKeysPage /></ProtectedRoute>} />
            <Route path="/api-keys" element={<ProtectedRoute roles={ADMIN_AGENCY}><ApiKeysPage /></ProtectedRoute>} />
            {/* Store connections live in Bot Manager → Commerce now, not a
                standalone page — same pattern as /user-input-flows, /sequences
                and /settings/whatsapp-flows redirecting to /bots. */}
            <Route path="/agency/commerce" element={<Navigate to="/bots" state={{ activeCategory: 'commerce', activeSubTab: 'storeConnections' }} replace />} />
            <Route path="/commerce" element={<Navigate to="/bots" state={{ activeCategory: 'commerce', activeSubTab: 'storeConnections' }} replace />} />


            {/* ── Connect Account Central Hub (Admin + Reseller + User) ──
                Team members (USER) can connect/manage channel accounts here
                too — see routes/channels.js's stripSecrets() for how raw
                access tokens are kept from reaching a USER-role response. */}
            <Route path="/connect-accounts"   element={<ProtectedRoute roles={ALL_ROLES}><ConnectAccountsPage /></ProtectedRoute>} />
            <Route path="/channels"           element={<ProtectedRoute roles={ALL_ROLES}><ConnectAccountsPage /></ProtectedRoute>} />
            <Route path="/channels/whatsapp"  element={<ProtectedRoute roles={ALL_ROLES}><WhatsAppPage /></ProtectedRoute>} />
            <Route path="/channels/facebook"  element={<ProtectedRoute roles={ALL_ROLES}><FacebookPage /></ProtectedRoute>} />
            <Route path="/channels/instagram" element={<ProtectedRoute roles={ALL_ROLES}><InstagramPage /></ProtectedRoute>} />
            <Route path="/channels/telegram"  element={<ProtectedRoute roles={ALL_ROLES}><TelegramPage /></ProtectedRoute>} />
            <Route path="/channels/tiktok"    element={<ProtectedRoute roles={ALL_ROLES}><TikTokPage /></ProtectedRoute>} />
            <Route path="/channels/webchat"   element={<ProtectedRoute roles={ALL_ROLES}><WebchatPage /></ProtectedRoute>} />

            {/* ── Bot Manager (Visual Flow Bots) ── */}
            <Route path="/bots" element={<ProtectedRoute roles={ALL_ROLES}><BotManagerPage /></ProtectedRoute>} />
            <Route path="/bots/:id" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/bots/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/flows" element={<Navigate to="/bots" replace />} />
            <Route path="/flows/new" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/flows/:id" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/flows/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />

            {/* ── User Input Flows (reusable question sequences) ──
                The builder is the same FlowBuilderPage; it switches into User Input
                Flow mode from this route (restricted palette, no keyword trigger).
                The list lives in Bot Manager → Automation now, not a standalone
                page — same pattern as /flows below redirecting to /bots. */}
            <Route path="/user-input-flows" element={<Navigate to="/bots" replace />} />
            <Route path="/user-input-flows/:id" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/user-input-flows/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/settings/google-sheets" element={<ProtectedRoute roles={ALL_ROLES}><GoogleSheetsSettingsPage /></ProtectedRoute>} />

            {/* ── Sequence Messages ── same builder, Sequence mode (restricted
                palette, a Wait node, enforced single linear chain). The list
                lives in Bot Manager → Automation now, not a standalone page. */}
            <Route path="/sequences" element={<Navigate to="/bots" replace />} />
            <Route path="/sequences/:id" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />
            <Route path="/sequences/:id/edit" element={<ProtectedRoute roles={ALL_ROLES}><FlowBuilderPage /></ProtectedRoute>} />

            {/* Campaigns/Post Publishing/Orders are now part of an Agent's day-to-day
                nav too (see Sidebar.jsx) — opened to ALL_ROLES to match; Webhooks &
                Zapier stays Agency/Admin-only (app-configuration, not day-to-day work). */}
            <Route path="/campaigns" element={<ProtectedRoute roles={ALL_ROLES}><CampaignListPage /></ProtectedRoute>} />
            <Route path="/social-posting" element={<ProtectedRoute roles={ALL_ROLES}><SocialPostingPage /></ProtectedRoute>} />
            <Route path="/publishing" element={<ProtectedRoute roles={ALL_ROLES}><SocialPostingPage /></ProtectedRoute>} />

            {/* ── Comment Automation ── pulled out of Bot Manager → Automation →
                Engagement (see CommentAutomationPage.jsx for why); own account
                rail scoped to Facebook/Instagram only. */}
            <Route path="/comment-automation" element={<ProtectedRoute roles={ALL_ROLES}><CommentAutomationPage /></ProtectedRoute>} />
            <Route path="/webhooks" element={<ProtectedRoute roles={ADMIN_AGENCY}><WebhooksManagerPage /></ProtectedRoute>} />
            <Route path="/integrations/webhooks" element={<ProtectedRoute roles={ADMIN_AGENCY}><WebhooksManagerPage /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute roles={ALL_ROLES}><OrdersPage /></ProtectedRoute>} />
            <Route path="/payments/orders" element={<ProtectedRoute roles={ALL_ROLES}><OrdersPage /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute roles={ALL_ROLES}><AppointmentList /></ProtectedRoute>} />
            <Route path="/appointments/slots" element={<ProtectedRoute roles={ADMIN_AGENCY}><SlotManager /></ProtectedRoute>} />
            <Route path="/appointments/campaigns" element={<ProtectedRoute roles={ADMIN_AGENCY}><SlotManager defaultTab="campaigns" /></ProtectedRoute>} />
            <Route path="/slots" element={<ProtectedRoute roles={ADMIN_AGENCY}><SlotManager /></ProtectedRoute>} />

            {/* ── Settings & App Integrations Hub ── */}
            <Route path="/settings/apps" element={<ProtectedRoute roles={ADMIN_AGENCY}><AppSettingsHubPage /></ProtectedRoute>} />
            <Route path="/settings/app-integrations" element={<ProtectedRoute roles={ADMIN_AGENCY}><AppSettingsHubPage /></ProtectedRoute>} />
            <Route path="/agency/integrations" element={<ProtectedRoute roles={ADMIN_AGENCY}><AppSettingsHubPage /></ProtectedRoute>} />
            <Route path="/settings/whatsapp-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><MetaAppPage forcedPlatformGroup="WHATSAPP" /></ProtectedRoute>} />
            <Route path="/settings/facebook-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><MetaAppPage forcedPlatformGroup="MESSENGER_INSTAGRAM" /></ProtectedRoute>} />
            <Route path="/settings/messenger-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><MetaAppPage forcedPlatformGroup="MESSENGER_INSTAGRAM" /></ProtectedRoute>} />
            <Route path="/settings/meta-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><MetaAppPage /></ProtectedRoute>} />
            <Route path="/settings/tiktok-app" element={<ProtectedRoute roles={ADMIN_AGENCY}><TikTokAppPage /></ProtectedRoute>} />
            <Route path="/settings/ai-providers" element={<ProtectedRoute roles={ADMIN_AGENCY}><AIProvidersPage /></ProtectedRoute>} />
            {/* WhatsApp Flows — list lives in Bot Manager → Data Collection now,
                not a standalone page — same pattern as /user-input-flows and
                /sequences above redirecting to /bots. */}
            <Route path="/settings/whatsapp-flows" element={<Navigate to="/bots" state={{ activeCategory: 'dataCollection', activeSubTab: 'whatsappFlows' }} replace />} />
            <Route path="/settings/appearance" element={<ProtectedRoute roles={ALL_ROLES}><AppearancePage /></ProtectedRoute>} />
            <Route path="/settings/canned-responses" element={<ProtectedRoute roles={ALL_ROLES}><CannedResponsesPage /></ProtectedRoute>} />
            <Route path="/settings/business-hours" element={<ProtectedRoute roles={ALL_ROLES}><BusinessHoursPage /></ProtectedRoute>} />
            <Route path="/bots/business-hours" element={<ProtectedRoute roles={ALL_ROLES}><BusinessHoursPage /></ProtectedRoute>} />

            {/* ── Inbox & Contacts ── */}
            <Route path="/inbox" element={<ProtectedRoute roles={ALL_ROLES}><InboxPage /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute roles={ALL_ROLES}><ContactsPage /></ProtectedRoute>} />

            {/* ── Support Desk — a fully standalone portal, not connected to the
                 dashboard (own login, own layout, own design). Everything
                 under /support/* is self-contained inside SupportDeskApp. ── */}
            <Route path="/support/*" element={<SupportDeskApp />} />

            {/* ── Public Pages — Landing/Pricing/Blog/Privacy/Terms share one
                 persistent navbar+footer via PublicLayout, so navigating
                 between them only swaps the inner content, not the menu. ── */}
            <Route element={<PublicLayout />}>
              <Route path="/landing"          element={<LandingPage />} />
              <Route path="/privacy-policy"   element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/blog"             element={<BlogListPage />} />
              <Route path="/blog/:slug"       element={<BlogDetailPage />} />
              <Route path="/pricing"          element={<PricingPage />} />
            </Route>
            <Route path="/payments/pay/:orderId" element={<InChatPaymentCheckoutPage />} />
            <Route path="/book/:agencyId" element={<PublicBookingPage />} />
            <Route path="/checkout"         element={<GuestCheckoutPage />} />
            <Route path="/checkout/complete" element={<CheckoutCompletePage />} />
            {/* ── Community Forum — a standalone portal, not part of the dashboard
                 (own login, own layout, own design — see Forum/ForumApp.jsx).
                 Publicly readable, so it sits outside ProtectedRoute. ── */}
            <Route path="/forum/*" element={<ForumApp />} />
            {/* Where the account-verification email's link lands. Public: the
                link is often opened on a different device than the signup. */}
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ── Admin Payment Gateways ── */}
            <Route path="/admin/payment-gateways" element={<ProtectedRoute roles={['ADMIN']}><PaymentGatewaysPage /></ProtectedRoute>} />

            {/* ── Admin Blog Management ── */}
            <Route path="/admin/blog"           element={<ProtectedRoute roles={['ADMIN']}><BlogManagerPage /></ProtectedRoute>} />
            <Route path="/admin/blog/new"        element={<ProtectedRoute roles={['ADMIN']}><BlogEditorPage /></ProtectedRoute>} />
            <Route path="/admin/blog/:id/edit"   element={<ProtectedRoute roles={['ADMIN']}><BlogEditorPage /></ProtectedRoute>} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            </Suspense>
          </NotificationProvider>
        </LayoutProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
