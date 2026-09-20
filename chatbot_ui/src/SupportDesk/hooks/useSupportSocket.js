import { socketAuth } from "../../utils/socketAuth";
import { useEffect, useRef } from "react";
import io from "socket.io-client";
import { useSupportAuth } from "../context/SupportAuthContext";

/**
 * Dedicated Socket.io connection for the Support Desk portal, mirroring
 * hooks/useWhatsAppCall.js's connection setup exactly (same auth payload
 * shape, same socket URL resolution) since it's the established pattern
 * for a feature-scoped socket connection in this app.
 */
export function useSupportSocket(onEvent) {
  const { user } = useSupportAuth();
  const socketRef = useRef(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!user) return undefined;
    let socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      socketUrl = apiUrl.startsWith("http") ? apiUrl.replace("/api/v1", "") : undefined;
    }
    const socket = io(socketUrl, {
      auth: socketAuth(),
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const events = ["support_ticket:new", "support_ticket:updated", "support_ticket:message", "support_ticket:internal_note"];
    events.forEach((evt) => socket.on(evt, (data) => handlerRef.current?.(evt, data)));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const joinTicket = (ticketId) => socketRef.current?.emit("join_ticket", ticketId);
  const leaveTicket = (ticketId) => socketRef.current?.emit("leave_ticket", ticketId);

  return { joinTicket, leaveTicket };
}
