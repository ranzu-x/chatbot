import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import pool from "./db.js";

// ─── Route Imports ─────────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import agencyRoutes from "./routes/agency.js";
import conversationRoutes from "./routes/conversations.js";
import integrationRoutes from "./routes/integrations.js";
import channelRoutes from "./routes/channels.js";
import botRoutes from "./routes/bots.js";
import metaAppRoutes from "./routes/metaapp.js";
import tiktokAppRoutes from "./routes/tiktokapp.js";
import webhookRoutes from "./routes/webhook.js";
import flowRoutes from "./routes/flows.js";
import webchatRoutes from "./routes/webchat.js";
import contactRoutes from "./routes/contacts.js";
import uploadRoutes from "./routes/upload.js";
import templateRoutes from "./routes/templates.js";
import cannedResponseRoutes from "./routes/cannedResponses.js";
import campaignRoutes from "./routes/campaigns.js";
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
import slotRoutes from "./routes/slots.js";
import labelsRoutes from "./routes/labels.js";
import mediaRoutes from "./routes/media.js";
import agencyPaymentGatewayRoutes from "./routes/agencyPaymentGateways.js";
import aiProviderRoutes from "./routes/aiProviders.js";
import aiAgentRoutes from "./routes/aiAgents.js";
import aiReplySettingsRoutes from "./routes/aiReplySettings.js";
import aiKnowledgeRoutes from "./routes/aiKnowledge.js";
import customFieldRoutes from "./routes/customFields.js";
import userInputFlowRoutes from "./routes/userInputFlows.js";
import googleSheetsRoutes from "./routes/googleSheets.js";
import followupRoutes from "./routes/followups.js";
import whatsappFlowRefRoutes from "./routes/whatsappFlowRefs.js";
import aiRewriteRoutes from "./routes/aiRewrite.js";
import roleRoutes from "./routes/roles.js";
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

dotenv.config();

const app = express();
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

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());
app.use(express.json({ limit: "5mb" }));
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
    // Also allow any *.loca.lt or *.ngrok-free.dev or *.ngrok.io domain
    if (
      allowed.includes(origin) ||
      origin.endsWith('.loca.lt') ||
      origin.endsWith('.ngrok-free.dev') ||
      origin.endsWith('.ngrok.io') ||
      origin.endsWith('.ngrok-free.app')
    ) {
      return callback(null, true);
    }
    // Outside production, keep dev convenient (unregistered local tunnels etc).
    // In production, unknown origins are rejected instead of silently allowed.
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
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
app.use("/api/v1", webhookRoutes);
app.use("/api/v1", webchatRoutes);
app.use("/api/v1", authRoutes);
app.use("/api/v1", mediaRoutes);

// ─── Protected Application Routes ─────────────────────────────────────────────
app.use("/api/v1", adminRoutes);
app.use("/api/v1", agencyRoutes);
app.use("/api/v1", conversationRoutes);
app.use("/api/v1", integrationRoutes);
app.use("/api/v1", channelRoutes);
app.use("/api/v1", botRoutes);
app.use("/api/v1", metaAppRoutes);
app.use("/api/v1", tiktokAppRoutes);
app.use("/api/v1", flowRoutes);
app.use("/api/v1", contactRoutes);
app.use("/api/v1", uploadRoutes);
app.use("/api/v1", templateRoutes);
app.use("/api/v1", cannedResponseRoutes);
app.use("/api/v1", campaignRoutes);
app.use("/api/v1", broadcastRoutes);
app.use("/api/v1", whatsappCallRoutes);
app.use("/api/v1", supportDeskRoutes);
app.use("/api/v1", sequenceRoutes);
app.use("/api/v1", domainRoutes);
app.use("/api/v1", commentRoutes);
app.use("/api/v1", packageRoutes);
app.use("/api/v1", billingRoutes);
app.use("/api/v1", flowWebhookRoutes);
app.use("/api/v1", chatPaymentRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", socialPostRoutes);
app.use("/api/v1", teamRoutes);
app.use("/api/v1", appointmentRoutes);
app.use("/api/v1", slotRoutes);
app.use("/api/v1", labelsRoutes);
app.use("/api/v1", agencyPaymentGatewayRoutes);
app.use("/api/v1", aiProviderRoutes);
app.use("/api/v1", aiAgentRoutes);
app.use("/api/v1", aiReplySettingsRoutes);
app.use("/api/v1", aiKnowledgeRoutes);
app.use("/api/v1", customFieldRoutes);
app.use("/api/v1", userInputFlowRoutes);
app.use("/api/v1", googleSheetsRoutes);
app.use("/api/v1", followupRoutes);
app.use("/api/v1", whatsappFlowRefRoutes);
app.use("/api/v1", aiRewriteRoutes);
app.use("/api/v1", roleRoutes);
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

