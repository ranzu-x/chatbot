import { socketAuth } from '../utils/socketAuth';
import { useState, useRef, useCallback, useEffect } from 'react';
import io from 'socket.io-client';
import { whatsappCallAPI } from '../services/api';
import { useAuth } from '../Provider/AuthContext';

// STUN-only by default — works for most agents on normal home/office
// networks. If a specific network's calls ring but never connect (audio
// never flows), that's the signal a TURN server is needed; add its ICE
// server entry here (and on the RTCPeerConnection config below) — Meta's
// Calling API itself doesn't provide one, per its own docs, so this side of
// the ICE negotiation is on us the same as any other WebRTC app.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// How long to wait for ICE gathering to finish before sending whatever
// candidates we have — Meta's /calls endpoint takes one complete SDP, not
// trickle ICE over a signaling channel, so the offer has to be "done"
// before it's sent. Most networks finish well under this.
const ICE_GATHERING_TIMEOUT_MS = 4000;

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);
    function onChange() {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    }
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

/**
 * Manages one WhatsApp Business Call end-to-end: the real RTCPeerConnection
 * (mic capture, SDP offer, remote audio playback) plus the REST calls and
 * Socket.io events that carry Meta's side of the signaling. See
 * routes/whatsappCalls.js (REST) and routes/webhook.js's WhatsApp Calling
 * section (the async events this listens for).
 *
 * States: 'idle' | 'need-permission' | 'requesting-permission' |
 *         'connecting' | 'ringing' | 'connected' | 'ended' | 'error'
 */
export default function useWhatsAppCall() {
  const { user } = useAuth();
  const [callState, setCallState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  // Captured at placeCall() time so the call panel keeps showing the right
  // name even if the agent switches to a different conversation mid-call —
  // it isn't derived from "whichever conversation is selected right now".
  const [calleeName, setCalleeName] = useState('');
  const [calleeContactId, setCalleeContactId] = useState(null);
  // The open conversation's own WhatsApp integration — a call always goes
  // out on this exact number, never an arbitrary "first WhatsApp account"
  // pick (an agency can have more than one connected).
  const [calleeIntegrationId, setCalleeIntegrationId] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callDbIdRef = useRef(null);
  const durationTimerRef = useRef(null);
  const socketRef = useRef(null);

  // ── Dedicated socket connection for call signaling ──────────────────────
  useEffect(() => {
    if (!user) return;
    let socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      socketUrl = apiUrl.startsWith('http') ? apiUrl.replace('/api/v1', '') : undefined;
    }
    const socket = io(socketUrl, {
      auth: socketAuth(),
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('whatsapp_call_answer', async ({ callDbId, sdpAnswer }) => {
      if (String(callDbId) !== String(callDbIdRef.current) || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
      } catch (err) {
        console.error('[WA Call] setRemoteDescription failed:', err);
        setErrorMessage('Failed to connect the call audio.');
        setCallState('error');
      }
    });

    socket.on('whatsapp_call_status', ({ callDbId, status }) => {
      if (String(callDbId) !== String(callDbIdRef.current)) return;
      if (status === 'RINGING') setCallState('ringing');
      else if (status === 'ACCEPTED') setCallState('connected');
      else if (status === 'REJECTED') {
        setCallState('ended');
        setErrorMessage('Call declined.');
        cleanupPeerConnection();
      }
    });

    socket.on('whatsapp_call_terminated', ({ callDbId, status, duration: finalDuration }) => {
      if (String(callDbId) !== String(callDbIdRef.current)) return;
      setCallState('ended');
      if (status === 'FAILED') setErrorMessage('The call failed to connect.');
      if (typeof finalDuration === 'number') setDuration(finalDuration);
      cleanupPeerConnection();
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.agencyId, user?.id]);

  const cleanupPeerConnection = useCallback(() => {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    cleanupPeerConnection();
    callDbIdRef.current = null;
    setCallState('idle');
    setErrorMessage('');
    setDuration(0);
    setMuted(false);
    setCalleeName('');
    setCalleeContactId(null);
    setCalleeIntegrationId(null);
  }, [cleanupPeerConnection]);

  // ── Call permission ──────────────────────────────────────────────────────
  const checkPermission = useCallback(async (contactId, integrationId) => {
    const res = await whatsappCallAPI.getPermission(contactId, integrationId, true);
    return res.data.permission;
  }, []);

  const requestPermission = useCallback(async (contactId, integrationId, message) => {
    setCallState('requesting-permission');
    try {
      await whatsappCallAPI.requestPermission(contactId, integrationId, message);
      setCallState('idle');
      return true;
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to send permission request.');
      setCallState('error');
      return false;
    }
  }, []);

  // ── Place a call ──────────────────────────────────────────────────────────
  const placeCall = useCallback(async (contactId, conversationId, contactName, integrationId) => {
    setErrorMessage('');
    setCalleeName(contactName || '');
    setCalleeContactId(contactId);
    setCalleeIntegrationId(integrationId || null);

    if (!integrationId) {
      setErrorMessage("Couldn't tell which WhatsApp number this conversation is on.");
      setCallState('error');
      return;
    }
    setCallState('connecting');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMessage('Microphone access is required to place a call.');
      setCallState('error');
      return;
    }
    localStreamRef.current = stream;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const res = await whatsappCallAPI.initiate({
        contactId,
        conversationId,
        integrationId,
        sdpOffer: pc.localDescription.sdp,
      });
      callDbIdRef.current = res.data.callDbId;

      durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      cleanupPeerConnection();
      const msg = err.response?.data?.message || 'Failed to place the call.';
      setErrorMessage(msg);
      setCallState(err.response?.data?.code === 138006 ? 'need-permission' : 'error');
    }
  }, [cleanupPeerConnection]);

  const hangUp = useCallback(async () => {
    const id = callDbIdRef.current;
    cleanupPeerConnection();
    setCallState('ended');
    if (id) {
      try { await whatsappCallAPI.terminate(id); } catch { /* best-effort */ }
    }
  }, [cleanupPeerConnection]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  useEffect(() => () => cleanupPeerConnection(), [cleanupPeerConnection]);

  return {
    callState, errorMessage, duration, muted, calleeName, calleeContactId, calleeIntegrationId,
    remoteAudioRef,
    placeCall, hangUp, toggleMute, reset,
    checkPermission, requestPermission,
  };
}
