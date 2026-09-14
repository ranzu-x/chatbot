import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, X, Loader2, ShieldAlert, Send } from 'lucide-react';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const STATE_LABEL = {
  connecting: 'Calling…',
  ringing: 'Ringing…',
  connected: 'Connected',
  ended: 'Call ended',
  error: 'Call failed',
  'requesting-permission': 'Sending permission request…',
};

/**
 * Floating call panel shown over the Live Inbox while a WhatsApp call is
 * active or being set up — see src/hooks/useWhatsAppCall.js for the actual
 * WebRTC + signaling logic this just renders.
 */
export default function WhatsAppCallPanel({
  contactName,
  callState,
  errorMessage,
  duration,
  muted,
  remoteAudioRef,
  onHangUp,
  onToggleMute,
  onRequestPermission,
  onClose,
  onRetry,
}) {
  const [requestNote, setRequestNote] = useState('');

  useEffect(() => {
    if (callState === 'idle') setRequestNote('');
  }, [callState]);

  if (callState === 'idle') return null;

  const isLive = callState === 'connecting' || callState === 'ringing' || callState === 'connected';

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
        width: 300, background: '#0f172a', borderRadius: 16,
        boxShadow: '0 20px 48px rgba(0,0,0,0.35)', padding: '20px 20px 18px',
        color: '#fff', display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      {callState !== 'need-permission' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(37,211,102,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Phone size={17} color="#25d366" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{contactName || 'Subscriber'}</div>
                <div style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {(callState === 'connecting' || callState === 'ringing') && <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />}
                  {callState === 'connected' ? formatDuration(duration) : STATE_LABEL[callState]}
                </div>
              </div>
            </div>
            {!isLive && (
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}>
                <X size={16} />
              </button>
            )}
          </div>

          {errorMessage && callState !== 'requesting-permission' && (
            <div style={{ fontSize: '0.76rem', color: '#fca5a5', background: 'rgba(220,38,38,0.12)', padding: '7px 10px', borderRadius: 8 }}>
              {errorMessage}
            </div>
          )}

          {isLive && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={onToggleMute}
                title={muted ? 'Unmute' : 'Mute'}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: muted ? '#f59e0b' : 'rgba(255,255,255,0.1)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button
                onClick={onHangUp}
                title="Hang up"
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: '#dc2626', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <PhoneOff size={18} />
              </button>
            </div>
          )}

          {callState === 'error' && (
            <button onClick={onRetry} className="btn btn-secondary btn-sm" style={{ alignSelf: 'center' }}>
              Try Again
            </button>
          )}
        </>
      )}

      {callState === 'need-permission' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(245,158,11,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={17} color="#f59e0b" />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Call permission needed</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
            {contactName || 'This subscriber'} hasn't given permission for calls yet. WhatsApp requires their consent before you can call them — send a request and they'll be prompted in their app.
          </p>
          <textarea
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            placeholder="We'd like to call you to help with your query — is that okay?"
            rows={2}
            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: '0.8rem', padding: 8, resize: 'none' }}
          />
          <button
            onClick={() => onRequestPermission(requestNote.trim() || undefined)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
          >
            <Send size={14} /> Send Permission Request
          </button>
        </>
      )}
    </div>
  );
}
