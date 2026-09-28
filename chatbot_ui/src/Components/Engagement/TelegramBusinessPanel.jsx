import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { botProfileAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Bot Manager → Telegram Business (chatbot_api/utils/telegramBusiness.js).
 * A Telegram Premium user connects this bot to their own account; the bot then
 * answers their customers' private chats on their behalf. Connecting happens
 * in the Telegram app — this page explains how and lists the connections.
 */
export default function TelegramBusinessPanel({ account }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    botProfileAPI.getTelegramBusiness(account.id)
      .then((res) => setData(res.data))
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load the connections'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [account.id]);

  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 };
  const botName = data?.botUsername ? `@${data.botUsername}` : 'this bot';

  return (
    <div className="bm-content-card">
      <div className="bm-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h3 className="bm-card-title">Telegram Business</h3>
          <p className="bm-card-sub">Let {botName} answer the customers who write to a person's own Telegram account — the replies appear as sent by that account, and the chats show up in your Inbox like any other.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      <div style={box}>
        <strong style={{ fontSize: '0.9rem' }}>How to connect</strong>
        <ol style={{ fontSize: '0.84rem', lineHeight: 1.7, margin: '8px 0 0', paddingLeft: 20 }}>
          <li>In @BotFather open {botName} → Bot Settings → <b>Business Mode</b> and turn it on (once per bot).</li>
          <li>The business owner (needs Telegram Premium) opens Telegram → Settings → <b>Telegram Business</b> → <b>Chatbots</b>.</li>
          <li>They enter {botName}, choose which chats it may answer, and allow it to <b>reply to messages</b>.</li>
          <li>The connection appears below within a few seconds. Messages the owner types themselves are never answered by the bot.</li>
        </ol>
      </div>

      <div style={box}>
        <strong style={{ fontSize: '0.9rem' }}>Connected accounts</strong>
        {!data ? (
          <div style={{ padding: 20, textAlign: 'center' }}><Loader2 size={18} className="animate-spin" /></div>
        ) : data.connections.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>No business account has connected {botName} yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: 8 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px 4px' }}>Account</th>
                <th style={{ padding: '6px 4px' }}>Status</th>
                <th style={{ padding: '6px 4px' }}>Can reply</th>
                <th style={{ padding: '6px 4px' }}>Connected</th>
              </tr>
            </thead>
            <tbody>
              {data.connections.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 600 }}>{c.tg_user_name}</td>
                  <td style={{ padding: '8px 4px' }}>{c.is_enabled ? 'Connected' : 'Disconnected'}</td>
                  <td style={{ padding: '8px 4px' }}>
                    {c.can_reply
                      ? <span style={{ color: '#16a34a', display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={14} /> Yes</span>
                      : <span style={{ color: '#dc2626', display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Ask the owner to allow 'Reply to messages' in Telegram Business → Chatbots"><XCircle size={14} /> No — read only</span>}
                  </td>
                  <td style={{ padding: '8px 4px', color: 'var(--text-muted)' }}>{c.connected_at ? new Date(c.connected_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
