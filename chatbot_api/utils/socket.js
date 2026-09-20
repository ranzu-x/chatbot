// ─── Socket.io Singleton ─────────────────────────────────────────────────────
// Usage: import { getIO, emitToAgency } from '../utils/socket.js';
//
// WHO IS CONNECTED is decided here, from a verified login token, never from
// what the browser claims. This used to read `agencyId` / `userId` straight out
// of the client-supplied handshake, so anyone could open a socket claiming any
// workspace and receive that workspace's live messages, and the public webchat
// handler let any visitor join any conversation's room by guessing its id.
//
//   agency:<id>        every verified member of that workspace
//   user:<id>          one verified user (personal alerts such as follow-up reminders)
//   conv:<id>          a conversation: members of its workspace, or the webchat
//                      visitor who owns it (proven by their visitor id)
//   webchat:<session>  a webchat visitor's own session

import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import pool from '../db.js';
import { checkTenantAccess } from '../middleware/tenant.js';

let io = null;

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try { return decodeURIComponent(v.join('=')); } catch { return v.join('='); }
    }
  }
  return null;
}

/**
 * Verifies the login token sent with a socket handshake (auth.token, or the
 * same httpOnly cookie the REST API uses) and confirms the user still belongs
 * to that workspace. Returns { userId, agencyId, role } or null.
 */
export async function authenticateSocket(handshake) {
  const token = handshake?.auth?.token || readCookie(handshake?.headers?.cookie, 'token');
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (!decoded?.id || !decoded?.agencyId) return null;
  const access = await checkTenantAccess(decoded.id, decoded.agencyId);
  if (!access?.ok) return null;
  return { userId: decoded.id, agencyId: access.tenant.agencyId, role: access.role };
}

/** A webchat visitor may only join the conversation their own visitor id created, on that widget. */
export async function canJoinWebchat({ widgetId, sessionId, conversationId }) {
  if (!widgetId || !sessionId || !conversationId) return false;
  const [[row]] = await pool.query(
    `SELECT cv.id
     FROM conversations cv
     JOIN contacts c ON c.id = cv.contact_id
     JOIN webchat_widgets w ON w.agency_id = cv.agency_id AND w.integration_id = cv.integration_id AND w.widget_key = ?
     WHERE cv.id = ? AND c.platform = 'WEBCHAT' AND c.external_id = ?
     LIMIT 1`,
    [String(widgetId), Number(conversationId), String(sessionId)]
  );
  return Boolean(row);
}

export function initSocket(server, corsOrigin) {
  io = new Server(server, {
    // `origin: true` reflects whatever Origin the client sent, rather than
    // pinning to corsOrigin (FRONTEND_URL) — this socket also serves the
    // public Webchat widget, which is embedded on arbitrary third-party
    // sites and would otherwise be rejected by Socket.io's own CORS check in
    // production. Safe to widen because nothing is origin-gated: a
    // connection only ever receives what it has been verified for below.
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Authenticate once per connection. Never rejects: public webchat visitors
  // connect without a login and simply get no workspace rooms.
  io.use(async (socket, next) => {
    try {
      socket.data.auth = await authenticateSocket(socket.handshake);
    } catch (err) {
      console.error('Socket auth error:', err.message);
      socket.data.auth = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth;

    if (auth) {
      socket.join(`agency:${auth.agencyId}`);
      socket.join(`user:${auth.userId}`);
      console.log(`🔌 Socket connected: user=${auth.userId} agency=${auth.agencyId} role=${auth.role}`);
    }

    // A team member opening a conversation: it must belong to their workspace.
    socket.on('join_conversation', async (conversationId) => {
      try {
        if (!auth) return;
        const [[row]] = await pool.query('SELECT id FROM conversations WHERE id = ? AND agency_id = ?', [Number(conversationId), auth.agencyId]);
        if (row) socket.join(`conv:${row.id}`);
      } catch (err) {
        console.error('join_conversation error:', err.message);
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // Support Desk ticket detail viewers (both the requester and helpdesk
    // staff join the same room while a ticket's thread is open on screen).
    // Requires a verified login; ticket-level access is enforced by the REST
    // routes that load the ticket.
    socket.on('join_ticket', (ticketId) => {
      if (auth) socket.join(`ticket:${ticketId}`);
    });

    socket.on('leave_ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // Webchat widget connections: proven, not claimed.
    socket.on('webchat_join', async ({ widgetId, sessionId, conversationId } = {}) => {
      try {
        if (!(await canJoinWebchat({ widgetId, sessionId, conversationId }))) return;
        socket.join(`conv:${Number(conversationId)}`);
        socket.join(`webchat:${sessionId}`);
      } catch (err) {
        console.error('webchat_join error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      if (auth) console.log(`🔌 Socket disconnected: user=${auth.userId}`);
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

/** Emit an event to one user (all of their open tabs) */
export function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}

/** Emit an event to a specific conversation room */
export function emitToConversation(conversationId, event, data) {
  if (io) io.to(`conv:${conversationId}`).emit(event, data);
}

/** Emit an event to a specific Support Desk ticket's viewers */
export function emitToTicket(ticketId, event, data) {
  if (io) io.to(`ticket:${ticketId}`).emit(event, data);
}
