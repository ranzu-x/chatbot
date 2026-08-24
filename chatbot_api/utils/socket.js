// ─── Socket.io Singleton ─────────────────────────────────────────────────────
// Usage: import { getIO, emitToAgency } from '../utils/socket.js';

import { Server } from 'socket.io';

let io = null;

export function initSocket(server, corsOrigin) {
  io = new Server(server, {
    cors: { origin: corsOrigin, credentials: true },
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
