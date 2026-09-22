import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import pool from "./db.js";

// ─── Route Imports ─────────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.js";
import { authLimiter, apiLimiter } from "./middleware/rateLimiter.js";
import { tenantContext } from "./middleware/tenant.js";
import { startFollowUpScheduler } from "./utils/followUpScheduler.js";
import adminRoutes from "./routes/admin.js";
import agencyRoutes from "./routes/agency.js";
import conversationRoutes from "./routes/conversations.js";
import integrationRoutes from "./routes/integrations.js";
import channelRoutes from "./routes/channels.js";
import botRoutes from "./routes/bots.js";
import metaAppRoutes from "./routes/metaapp.js";
import metaAppPoolRoutes from "./routes/metaapppool.js";
import tiktokAppRoutes from "./routes/tiktokapp.js";
import webhookRoutes from "./routes/webhook.js";
import whatsappFlowEndpointRoutes from "./routes/whatsappFlowEndpoint.js";
import flowRoutes from "./routes/flows.js";
import webchatRoutes from "./routes/webchat.js";
import contactRoutes from "./routes/contacts.js";
import contactListRoutes from "./routes/contactLists.js";
import uploadRoutes from "./routes/upload.js";
import templateRoutes from "./routes/templates.js";
import cannedResponseRoutes from "./routes/cannedResponses.js";
import broadcastRoutes from "./routes/broadcasts.js";
import whatsappCallRoutes from "./routes/whatsappCalls.js";
import supportDeskRoutes from "./routes/supportDesk.js";
import sequenceRoutes from "./routes/sequences.js";
import domainRoutes from "./routes/domains.js";
import commentRoutes from "./routes/comments.js";
import packageRoutes from "./routes/packages.js";
import billingRoutes from "./routes/billing.js";
import flowWebhookRoutes from "./routes/flowWebhooks.js";
import chatPaymentRoutes from "./routes/chatPayments.js";
import notificationRoutes from "./routes/notifications.js";
import socialPostRoutes from "./routes/socialPosts.js";
import teamRoutes from "./routes/team.js";
import appointmentRoutes from "./routes/appointments.js";
import appointmentServicesRoutes from "./routes/appointmentServices.js";
import slotRoutes from "./routes/slots.js";
import labelsRoutes from "./routes/labels.js";
import mediaRoutes from "./routes/media.js";
import agencyPaymentGatewayRoutes from "./routes/agencyPaymentGateways.js";
import platformPaymentGatewayRoutes from "./routes/platformPaymentGateways.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import publicApiRoutes from "./routes/publicApi.js";
import commerceRoutes from "./routes/commerce.js";
import httpApiCampaignRoutes from "./routes/httpApiCampaigns.js";
import aiProviderRoutes from "./routes/aiProviders.js";
import aiAgentRoutes from "./routes/aiAgents.js";
import aiReplySettingsRoutes from "./routes/aiReplySettings.js";
import businessHoursRoutes from "./routes/businessHours.js";
import aiKnowledgeRoutes from "./routes/aiKnowledge.js";
import customFieldRoutes from "./routes/customFields.js";
import userInputFlowRoutes from "./routes/userInputFlows.js";
import googleSheetsRoutes from "./routes/googleSheets.js";
import followupRoutes from "./routes/followups.js";
import whatsappFlowRefRoutes from "./routes/whatsappFlowRefs.js";
import aiRewriteRoutes from "./routes/aiRewrite.js";
import roleRoutes from "./routes/roles.js";
import auditLogRoutes from "./routes/auditLog.js";
import resellerCustomerRoutes from "./routes/resellerCustomers.js";
import agencyPackageRoutes from "./routes/agencyPackages.js";
import platformSettingsRoutes from "./routes/platformSettings.js";
import blogRoutes from "./routes/blog.js";
import { initBlogTable } from "./routes/blog.js";

import http from "http";
import { initSocket } from "./utils/socket.js";
import { startSequenceScheduler } from "./utils/sequenceRunner.js";
import { startTelegramPoller } from "./utils/telegramPoller.js";
import { initBotErrorLogsTable } from "./utils/botLogger.js";
import { startSocialPostScheduler } from "./utils/socialPostScheduler.js";
import { startFlowDelayScheduler } from "./utils/flowDelayScheduler.js";
import { startBotResumeScheduler } from "./utils/botResumeScheduler.js";
import { startBroadcastScheduler } from "./utils/broadcastScheduler.js";
import { startSupportDeskScheduler } from "./utils/supportDeskScheduler.js";
import { startCommerceSyncScheduler } from "./utils/commerceSyncScheduler.js";
import { startMetaAppHealthScheduler } from "./utils/metaAppHealthScheduler.js";
import { startBotErrorLogRetentionScheduler } from "./utils/botErrorLogRetentionScheduler.js";

dotenv.config();

const app = express();
// Requests arrive via a tunnel/reverse proxy (ngrok, cloudflared, etc. for
// webhook delivery), which sets X-Forwarded-For — without this, express-
// rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request and
// req.ip resolves to the proxy's address instead of the real client's.
app.set("trust proxy", 1);
const port = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.io & Schedulers
initSocket(server, process.env.FRONTEND_URL || "http://localhost:5173");
startSequenceScheduler();
startTelegramPoller();
startSocialPostScheduler();
startFlowDelayScheduler();
startBotResumeScheduler();
startBroadcastScheduler();
startSupportDeskScheduler();
startCommerceSyncScheduler();
startMetaAppHealthScheduler();
startBotErrorLogRetentionScheduler();
startFollowUpScheduler();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());
// The `verify` callback stashes the exact raw request bytes onto req.rawBody
// alongside the normal parsed req.body — needed so routes/webhook.js can
// verify Meta's X-Hub-Signature-256 HMAC (which is computed over the raw
// bytes, not a re-serialization of the parsed object) without switching the
// whole route to express.raw() and rewriting every req.body.* access in it.
// Inert for every other route — it's just an extra Buffer on req.
app.use(express.json({ limit: "5mb", verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
const corsAppDashboard = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    // Dev-tunnel domains (ngrok/localtunnel) — a real convenience for local
    // testing, but previously allowed unconditionally, in production too.
    // Anyone can spin up a free tunnel in seconds, so with credentials:true
    // that meant any such tunnel's origin could make authenticated
    // cross-origin requests against a live production deploy. Now gated by
    // the exact same NODE_ENV check the final fallback below already uses.
    if (process.env.NODE_ENV !== 'production') {
      if (
        origin.endsWith('.loca.lt') ||
        origin.endsWith('.ngrok-free.dev') ||
        origin.endsWith('.ngrok.io') ||
        origin.endsWith('.ngrok-free.app')
      ) {
        return callback(null, true);
      }
      // Outside production, keep dev convenient beyond just those domains too.
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});
// The Webchat widget (public/widget.js) is embedded on arbitrary third-party
// sites an agency's customers choose — it can never be known ahead of time,
// so it can't go through the dashboard's fixed origin allowlist above. Those
// two endpoints are already scoped/secured by widgetKey + agency_id (see
// routes/webchat.js), not by origin trust, so any origin is safe to allow
// here without loosening the dashboard's own CORS policy at all.
const corsWebchatWidget = cors({ origin: true, credentials: false });
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/webchat')) return corsWebchatWidget(req, res, next);
  return corsAppDashboard(req, res, next);
});
app.use(cookieParser());
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static("uploads")
);
app.use(express.static("public"));

// ─── DB Connection Test ────────────────────────────────────────────────────────
// WhatsApp flow fixes active
try {
  const conn = await pool.getConnection();
  console.log("✅ MySQL Connected to:", process.env.DB_NAME);
  conn.release();
  await initBotErrorLogsTable();
  await initBlogTable();
} catch (err) {
  console.error("❌ DB Connection Failed:", err.message);
}

// ─── Public Routes (No Auth Required) ──────────────────────────────────────────
// webhookRoutes deliberately gets NO rate limit — Meta/Telegram traffic
// arrives from shared platform IPs (many unrelated customers' webhooks ride
// the same source IPs), so IP-based limiting there would throttle other
// tenants' real traffic. It's protected by signature verification instead
// (see routes/webhook.js's verifyMetaSignature).
app.use("/api/v1", webhookRoutes);
// Meta's Flow data-exchange traffic shares the same platform-IP-pool
// reasoning as webhookRoutes above — exempted from apiLimiter for the same
// reason, protected by the encryption itself instead.
app.use("/api/v1", whatsappFlowEndpointRoutes);

app.use("/api/v1/auth/login", authLimiter);
app.use(["/api/v1/auth/register", "/api/v1/hospital-admin/signup"], authLimiter);
app.use("/api/v1", apiLimiter);
// Server-side workspace check + req.tenant for every authenticated request
// (deactivated workspace, or a token pointing at a workspace the user does not
// belong to, is refused here once instead of in each route). See middleware/tenant.js.
app.use("/api/v1", tenantContext);

app.use("/api/v1", webchatRoutes);
app.use("/api/v1", authRoutes);
app.use("/api/v1", mediaRoutes);

// billingRoutes is mounted here, before every router below with a bare
// (path-unscoped) router.use(authMiddleware, ...) — those intercept EVERY
// /api/v1 request that reaches them regardless of whether they have a
// matching route (documented gotcha, see routes/agencyPaymentGateways.js's
// comment), which was silently 401-ing billing.js's public routes
// (GET /billing/plans, POST /billing/webhook, and the new guest-checkout
// endpoints below) since they were mounted after those routers. billing.js
// protects its own routes individually with inline authMiddleware where
// needed, so nothing loses protection by moving it earlier.
app.use("/api/v1", billingRoutes);
// commerce.js has the exact same shape of public route (Shopify's OAuth
// callback, hit anonymously by Shopify's redirect) — same fix, same reason.
app.use("/api/v1", commerceRoutes);

// ─── Protected Application Routes ─────────────────────────────────────────────
app.use("/api/v1", adminRoutes);
app.use("/api/v1", agencyRoutes);
app.use("/api/v1", conversationRoutes);
app.use("/api/v1", integrationRoutes);
app.use("/api/v1", channelRoutes);
app.use("/api/v1", botRoutes);
app.use("/api/v1", metaAppRoutes);
app.use("/api/v1", metaAppPoolRoutes);
app.use("/api/v1", tiktokAppRoutes);
app.use("/api/v1", flowRoutes);
app.use("/api/v1", contactRoutes);
app.use("/api/v1", contactListRoutes);
app.use("/api/v1", uploadRoutes);
app.use("/api/v1", templateRoutes);
app.use("/api/v1", cannedResponseRoutes);
app.use("/api/v1", broadcastRoutes);
app.use("/api/v1", whatsappCallRoutes);
app.use("/api/v1", supportDeskRoutes);
app.use("/api/v1", sequenceRoutes);
app.use("/api/v1", domainRoutes);
app.use("/api/v1", commentRoutes);
app.use("/api/v1", packageRoutes);
app.use("/api/v1", flowWebhookRoutes);
app.use("/api/v1", chatPaymentRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", socialPostRoutes);
app.use("/api/v1", teamRoutes);
app.use("/api/v1", appointmentRoutes);
app.use("/api/v1", appointmentServicesRoutes);
app.use("/api/v1", slotRoutes);
app.use("/api/v1", labelsRoutes);
app.use("/api/v1", agencyPaymentGatewayRoutes);
app.use("/api/v1", platformPaymentGatewayRoutes);
app.use("/api/v1", apiKeyRoutes);
app.use("/api/v1", publicApiRoutes);
app.use("/api/v1", httpApiCampaignRoutes);
app.use("/api/v1", aiProviderRoutes);
app.use("/api/v1", aiAgentRoutes);
app.use("/api/v1", aiReplySettingsRoutes);
app.use("/api/v1", businessHoursRoutes);
app.use("/api/v1", aiKnowledgeRoutes);
app.use("/api/v1", customFieldRoutes);
app.use("/api/v1", userInputFlowRoutes);
app.use("/api/v1", googleSheetsRoutes);
app.use("/api/v1", followupRoutes);
app.use("/api/v1", whatsappFlowRefRoutes);
app.use("/api/v1", aiRewriteRoutes);
app.use("/api/v1", roleRoutes);
app.use("/api/v1", auditLogRoutes);
app.use("/api/v1", resellerCustomerRoutes);
app.use("/api/v1", agencyPackageRoutes);
app.use("/api/v1", platformSettingsRoutes);
app.use("/api/v1", blogRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(port, () => {
  console.log(`🚀 Chatbot SaaS API running on port ${port}`);
});

