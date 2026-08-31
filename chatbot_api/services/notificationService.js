import pool from "../db.js";
import { getIO } from "../utils/socket.js";

// ─── BROADCAST REAL-TIME ALERT TO AGENTS (WEBSOCKET + WEBPUSH) ─────────────
export async function broadcastAgentAlert({
  agencyId,
  title,
  body,
  conversationId = null,
  eventType = "NEW_MESSAGE", // 'NEW_MESSAGE' | 'HANDOVER_REQUEST' | 'ORDER_PAID'
  channel = "WHATSAPP",
}) {
  try {
    const io = getIO();
    if (io) {
      // Emit to agency room
      io.to(`agency_${agencyId}`).emit("agent:alert", {
        title,
        body,
        conversationId,
        eventType,
        channel,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`🔔 [NOTIFICATION] Broadcast alert to Agency #${agencyId}: "${title}"`);
  } catch (err) {
    console.error("Broadcast agent alert error:", err);
  }
}
