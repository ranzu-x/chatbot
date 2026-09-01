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
import sequenceRoutes from "./routes/sequences.js";
import domainRoutes from "./routes/domains.js";
import commentRoutes from "./routes/comments.js";
import packageRoutes from "./routes/packages.js";
import billingRoutes from "./routes/billing.js";
import aiRoutes from "./routes/ai.js";
import flowWebhookRoutes from "./routes/flowWebhooks.js";
import chatPaymentRoutes from "./routes/chatPayments.js";
import notificationRoutes from "./routes/notifications.js";
import socialPostRoutes from "./routes/socialPosts.js";

import http from "http";
import { initSocket } from "./utils/socket.js";
import { startSequenceScheduler } from "./utils/sequenceRunner.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.io & Sequence Scheduler
initSocket(server, process.env.FRONTEND_URL || "http://localhost:5173");
startSequenceScheduler();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
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
    return callback(null, true); // In dev, allow all for now
  },
  credentials: true,
}));
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));

// ─── DB Connection Test ────────────────────────────────────────────────────────
try {
  const conn = await pool.getConnection();
  console.log("✅ MySQL Connected to:", process.env.DB_NAME);
  conn.release();
} catch (err) {
  console.error("❌ DB Connection Failed:", err.message);
}

// ─── Public Routes (No Auth Required) ──────────────────────────────────────────
app.use("/api/v1", webhookRoutes);
app.use("/api/v1", webchatRoutes);
app.use("/api/v1", authRoutes);

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
app.use("/api/v1", sequenceRoutes);
app.use("/api/v1", domainRoutes);
app.use("/api/v1", commentRoutes);
app.use("/api/v1", packageRoutes);
app.use("/api/v1", billingRoutes);
app.use("/api/v1", aiRoutes);
app.use("/api/v1", flowWebhookRoutes);
app.use("/api/v1", chatPaymentRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", socialPostRoutes);

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
