// ─── Socket.io Singleton ─────────────────────────────────────────────────────
// Usage: import { getIO, emitToAgency } from '../utils/socket.js';

import { Server } from 'socket.io';

let io = null;

export function initSocket(server, corsOrigin) {
  io = new Server(server, {
    // `origin: true` reflects whatever Origin the client sent, rather than
    // pinning to corsOrigin (FRONTEND_URL) — this socket also serves the
    // public Webchat widget (utils/socket.js's webchat_join handler / public/
    // widget.js), which is embedded on arbitrary third-party sites and would
    // otherwise be rejected by Socket.io's own CORS check in production. Safe
    // to widen: nothing here is origin-gated — a connection only ever sees
    // data for rooms it explicitly joins (agency:<id> requires a valid JWT
    // via the REST API first; conv:<id>/webchat:<sessionId> require knowing
    // the actual conversation/session id, which is itself scoped server-side
    // by widget_key + agency_id in routes/webchat.js).
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Track socket → agency mapping
  io.on('connection', (socket) => {
    const { agencyId, userId, role } = socket.handshake.auth;

    if (agencyId) {
      socket.join(`agency:${agencyId}`);
      console.log(`🔌 Socket connected: user=${userId} agency=${agencyId} role=${role}`);
    }

    // Webchat sessions join their conversation room
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conv:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // Support Desk ticket detail viewers (both the requester and helpdesk
    // staff join the same room while a ticket's thread is open on screen)
    socket.on('join_ticket', (ticketId) => {
      socket.join(`ticket:${ticketId}`);
    });

    socket.on('leave_ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // Webchat widget connections
    socket.on('webchat_join', ({ widgetId, sessionId, conversationId }) => {
      socket.join(`conv:${conversationId}`);
      socket.join(`webchat:${sessionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: user=${userId}`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}

/** Emit an event to all connected users in an agency */
export function emitToAgency(agencyId, event, data) {
  if (io) io.to(`agency:${agencyId}`).emit(event, data);
}

/** Emit an event to a specific conversation room */
export function emitToConversation(conversationId, event, data) {
  if (io) io.to(`conv:${conversationId}`).emit(event, data);
}

/** Emit an event to a specific Support Desk ticket's viewers */
export function emitToTicket(ticketId, event, data) {
  if (io) io.to(`ticket:${ticketId}`).emit(event, data);
}
