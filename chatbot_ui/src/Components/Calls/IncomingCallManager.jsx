import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import io from 'socket.io-client';
import { Phone, PhoneOff, Mic, MicOff, MessageSquare, Circle } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContext';
import { socketAuth, getSocketUrl } from '../../utils/socketAuth';
import { whatsappCallAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { ICE_SERVERS, waitForIceGatheringComplete } from '../../hooks/useWhatsAppCall';
import { startCallRecording } from '../../utils/callRecorder';

/**
 * Customers calling the business on WhatsApp (Meta Calling API,
 * user-initiated calls). Mounted once above the routes (App.jsx) so a call
 * keeps going while the agent moves between pages.
 *
 * Every signed-in agent of the workspace hears the ring
 * (`whatsapp_incoming_call`); the first to answer claims the call
 * (POST /calls/:id/accept) and the others' pop-ups close
 * (`whatsapp_call_claimed`). Meta waits about 30–60 seconds before it ends an
 * unanswered call (`whatsapp_call_terminated` → a missed call).
 *
 * Recording (a per-number option in Bot Manager → WhatsApp Calling) happens
 * here: both sides' audio is mixed and recorded in the browser, then uploaded
 * when the call ends — Meta has no recording API.
 */

const HIDDEN_PREFIXES = ['/forum', '/support', '/login', '/register', '/book', '/payments/pay', '/checkout', '/pricing', '/landing', '/blog'];

function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A soft two-tone ring made with WebAudio (no sound file to ship).
function startRingtone() {
  let ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return () => {}; }
  let stopped = false;
  const ring = () => {
    if (stopped) return;
    [0, 0.45].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = offset ? 480 : 440;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.42);
    });
  };
  ring();
  const timer = setInterval(ring, 2500);
  return () => { stopped = true; clearInterval(timer); ctx.close().catch(() => {}); };
}

export default function IncomingCallManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [ringing, setRinging] = useState([]); // incoming calls not yet answered
  const [active, setActive] = useState(null); // { callDbId, contactName, conversationId, recording }
  const [status, setStatus] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const activeRef = useRef(null);
  const stopRingRef = useRef(null);

  const hidden = HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  // ── ringtone while anything rings and no call is active ──
  useEffect(() => {
    if (ringing.length && !active) {
      if (!stopRingRef.current) stopRingRef.current = startRingtone();
    } else if (stopRingRef.current) {
      stopRingRef.current();
      stopRingRef.current = null;
    }
  }, [ringing.length, active]);
  useEffect(() => () => stopRingRef.current?.(), []);

  const finishRecording = useCallback(async (callDbId, durationSeconds) => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    const blob = await rec.stop();
    if (!blob) return;
    try {
      await whatsappCallAPI.uploadRecording(callDbId, blob, durationSeconds);
    } catch (err) {
      notify.error(err.response?.data?.message || 'The call recording could not be saved');
    }
  }, []);

  const cleanup = useCallback(async ({ keepStatus } = {}) => {
    const call = activeRef.current;
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (call) await finishRecording(call.callDbId, call.startedAt ? (Date.now() - call.startedAt) / 1000 : 0);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    activeRef.current = null;
    setActive(null);
    setMuted(false);
    setSeconds(0);
    if (!keepStatus) setStatus('');
  }, [finishRecording]);

  // ── socket ──
  useEffect(() => {
    if (!user) return undefined;
    const socket = io(getSocketUrl(), { auth: socketAuth(), transports: ['websocket', 'polling'] });
    socket.on('whatsapp_incoming_call', (call) => {
      setRinging((list) => (list.some((c) => c.callDbId === call.callDbId) ? list : [...list, { ...call, at: Date.now() }]));
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Incoming WhatsApp call', { body: `${call.contactName || 'A customer'} is calling${call.integrationName ? ` ${call.integrationName}` : ''}` });
        }
      } catch { /* notifications are optional */ }
    });
    socket.on('whatsapp_call_claimed', ({ callDbId, by, byName }) => {
      setRinging((list) => list.filter((c) => c.callDbId !== callDbId));
      if (by !== user.id && byName) notify.info?.(`${byName} answered the call`);
    });
    socket.on('whatsapp_call_terminated', ({ callDbId }) => {
      setRinging((list) => list.filter((c) => c.callDbId !== callDbId));
      if (activeRef.current?.callDbId === callDbId) {
        setStatus('Call ended');
        cleanup({ keepStatus: true });
        setTimeout(() => setStatus(''), 2500);
      }
    });
    return () => socket.disconnect();
  }, [user, cleanup]);

  // Drop ringing entries Meta has certainly given up on (it waits ~60 s).
  useEffect(() => {
    if (!ringing.length) return undefined;
    const t = setInterval(() => setRinging((list) => list.filter((c) => Date.now() - c.at < 75000)), 5000);
    return () => clearInterval(t);
  }, [ringing.length]);

  const answer = async (call) => {
    if (activeRef.current) { notify.error('Finish the current call first'); return; }
    setStatus('Connecting…');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('');
      notify.error('Allow microphone access to answer calls');
      return;
    }
    try {
      const { data } = await whatsappCallAPI.getCall(call.callDbId);
      const offer = data?.call?.sdp_offer;
      if (!offer) throw new Error('The call is no longer available');
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0] || remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
      const answerDesc = await pc.createAnswer();
      await pc.setLocalDescription(answerDesc);
      await waitForIceGatheringComplete(pc);
      const res = await whatsappCallAPI.accept(call.callDbId, pc.localDescription.sdp);

      setRinging((list) => list.filter((c) => c.callDbId !== call.callDbId));
      const current = { ...call, startedAt: Date.now(), recording: false };
      activeRef.current = current;
      setActive(current);
      setStatus('');
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      if (res.data?.recordCalls) {
        const rec = startCallRecording(stream, pc);
        if (rec) {
          recRef.current = rec;
          activeRef.current.recording = true;
          setActive({ ...activeRef.current });
        }
      }
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      pcRef.current = null;
      setStatus('');
      setRinging((list) => list.filter((c) => c.callDbId !== call.callDbId));
      notify.error(err.response?.data?.message || err.message || 'Could not answer the call');
    }
  };

  const decline = async (call) => {
    setRinging((list) => list.filter((c) => c.callDbId !== call.callDbId));
    try { await whatsappCallAPI.reject(call.callDbId); } catch (err) {
      if (err.response?.status !== 409) notify.error(err.response?.data?.message || 'Could not decline the call');
    }
  };

  const hangUp = async () => {
    const call = activeRef.current;
    await cleanup();
    if (call) {
      try { await whatsappCallAPI.terminate(call.callDbId); } catch { /* the webhook closes it too */ }
    }
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const openChat = (conversationId) => navigate(`/inbox?conv=${conversationId}`);

  if (!user || (hidden && !active)) return null;

  const card = {
    background: 'var(--bg-surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 14,
    boxShadow: '0 12px 32px rgba(15,23,42,0.18)', padding: 14, width: 300,
  };
  const round = (bg) => ({
    width: 40, height: 40, borderRadius: '50%', border: 'none', background: bg, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  });

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 100000, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <audio ref={remoteAudioRef} autoPlay />

      {status && !active && <div style={{ ...card, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{status}</div>}

      {active && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>On a WhatsApp call · {fmt(seconds)}</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.contactName || 'Customer'}</div>
              {active.recording && (
                <div style={{ fontSize: '0.7rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Circle size={8} fill="#dc2626" /> Recording
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button type="button" title={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} style={round(muted ? '#f59e0b' : '#64748b')}>
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            {active.conversationId && (
              <button type="button" title="Open chat" onClick={() => openChat(active.conversationId)} style={round('#2563eb')}><MessageSquare size={18} /></button>
            )}
            <button type="button" title="Hang up" onClick={hangUp} style={round('#dc2626')}><PhoneOff size={18} /></button>
          </div>
        </div>
      )}

      {!active && ringing.map((call) => (
        <div key={call.callDbId} style={{ ...card, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={12} /> Incoming WhatsApp call{call.integrationName ? ` · ${call.integrationName}` : ''}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '4px 0 2px' }}>{call.contactName || 'Customer'}</div>
          {call.payload && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>From: {call.payload}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center', background: '#16a34a', borderColor: '#16a34a' }} onClick={() => answer(call)}>
              <Phone size={13} /> Answer
            </button>
            <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => decline(call)}>
              <PhoneOff size={13} /> Decline
            </button>
          </div>
          {call.conversationId && (
            <button type="button" onClick={() => openChat(call.conversationId)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
              Open chat
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
