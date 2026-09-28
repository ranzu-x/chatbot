import { useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { whatsappCallAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

const EXPIRY = [
  [60, '1 hour'], [1440, '1 day'], [10080, '7 days'], [43200, '30 days'],
];

/**
 * Send Menu → Call button (WhatsApp): an interactive "Call on WhatsApp"
 * button (Meta's voice_call message). Tapping it calls this number; the tag
 * comes back on the call so the Call Log shows where it came from.
 */
export default function CallButtonSender({ conversationId, onSent, onClose }) {
  const [body, setBody] = useState('You can call us on WhatsApp now — tap the button below.');
  const [displayText, setDisplayText] = useState('Call on WhatsApp');
  const [ttl, setTtl] = useState(10080);
  const [tag, setTag] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await whatsappCallAPI.sendCallButton({ conversationId, body, displayText, ttlMinutes: ttl, payload: tag.trim() || undefined });
      notify.success('Call button sent');
      onSent?.({ kind: 'callButton', message: res.data?.message });
      onClose?.();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not send the call button');
    } finally {
      setSending(false);
    }
  };

  const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', boxSizing: 'border-box' };
  const lbl = { fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <span style={lbl}>Message</span>
        <textarea rows={3} maxLength={1024} style={input} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div>
        <span style={lbl}>Button text (max 20)</span>
        <input maxLength={20} style={input} value={displayText} onChange={(e) => setDisplayText(e.target.value)} />
      </div>
      <div>
        <span style={lbl}>Button works for</span>
        <select style={input} value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
          {EXPIRY.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div>
        <span style={lbl}>Tag (optional — shown in the Call Log)</span>
        <input maxLength={512} style={input} placeholder="e.g. order-support" value={tag} onChange={(e) => setTag(e.target.value)} />
      </div>
      <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>Only inside the 24-hour window, and WhatsApp Calling must be on for this number.</p>
      <button
        type="button"
        onClick={send}
        disabled={sending || !body.trim() || !displayText.trim()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />} Send call button
      </button>
    </div>
  );
}
