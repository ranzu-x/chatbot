import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import ChannelBreadcrumb from '../../Components/Common/ChannelBreadcrumb';
import { channelAPI } from '../../services/api';
import { handleLimitError } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import { Send, CheckCircle2, AlertTriangle, ClipboardList, Trash2, Plus, RefreshCw, ArrowLeft } from 'lucide-react';

const EmbeddedWrapper = ({ children }) => <div>{children}</div>;

export default function TelegramPage({ embedded = false }) {
  const { user } = useAuth();
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState('');
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'connect'

  const fetchBots = useCallback(async () => {
    setLoading(true);
    try { const res = await channelAPI.getTelegram(); setBots(res.data.bots || []); }
    catch { showToast('Failed to load', 'error'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBots(); }, [fetchBots]);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    try {
      const res = await channelAPI.addTelegram(token);
      showToast(`Bot @${res.data.botUsername} connected! Webhook ${res.data.webhookSet ? 'configured automatically' : 'setup failed'}`);
      setToken('');
      setView('list');
      fetchBots();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Invalid bot token', 'error');
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this Telegram bot?')) return;
    try { await channelAPI.deleteTelegram(id); showToast('Bot removed'); fetchBots(); }
    catch { showToast('Failed', 'error'); }
  };

  const LayoutWrapper = embedded ? EmbeddedWrapper : AppLayout;

  // ── VIEW: Bot List ──────────────────────────────────────────────────────────
  const ListView = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(34,157,217,0.1)', color: '#229ed9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={20} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Telegram
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
            Connect Telegram bots using a BotFather token — webhook is auto-configured.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchBots} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setView('connect')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', fontSize: '0.84rem', fontWeight: 700, background: '#229ed9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(34,157,217,0.25)' }}
          >
            <Plus size={15} /> Connect Bot
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Connected Bots</h2>
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0' }}>Telegram bots for this workspace</p>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,157,217,0.1)', color: '#229ed9' }}>
            {bots.length} Connected
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Bot Name</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Username</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Webhook</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    Loading bots...
                  </td>
                </tr>
              ) : bots.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                    <Send size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No Telegram Bots Connected</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>Click "Connect Bot" to add your first Telegram bot.</p>
                    <button
                      onClick={() => setView('connect')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, background: '#229ed9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <Plus size={14} /> Connect Now
                    </button>
                  </td>
                </tr>
              ) : (
                bots.map((b) => (
                  <tr
                    key={b.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbfe')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(34,157,217,0.1)', color: '#229ed9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Send size={14} />
                        </span>
                        {b.bot_name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#229ed9' }}>@{b.bot_username}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: b.webhook_set ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: b.webhook_set ? '#16a34a' : '#b45309' }}>
                        {b.webhook_set ? <><CheckCircle2 size={11} /> Set</> : <><AlertTriangle size={11} /> Pending</>}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: b.is_active ? '#16a34a' : '#64748b', background: b.is_active ? 'rgba(34,197,94,0.1)' : '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.is_active ? '#16a34a' : '#94a3b8' }} />
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(b.id)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── VIEW: Connect Bot ───────────────────────────────────────────────────────
  const ConnectView = () => (
    <div style={{ maxWidth: 560 }}>
      <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back to Bots
      </button>

      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(34,157,217,0.1)', color: '#229ed9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Connect Telegram Bot</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748b' }}>Paste your BotFather token — webhook is registered automatically</p>
          </div>
        </div>

        <div style={{ background: 'rgba(34,157,217,0.07)', border: '1px solid rgba(34,157,217,0.2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#229ed9', marginBottom: 10 }}>
            <ClipboardList size={16} /> How to get your Bot Token:
          </div>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.84rem', color: '#475569', margin: 0 }}>
            <li>Open Telegram and search for <strong>@BotFather</strong></li>
            <li>Send the command <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>/newbot</code> and follow the prompts</li>
            <li>Choose a name and username for your bot</li>
            <li>BotFather will give you a token — copy and paste it below</li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              We will automatically register the webhook for you <CheckCircle2 size={14} color="#16a34a" />
            </li>
          </ol>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Bot Token <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              className="form-input w-full"
              placeholder="e.g. 1234567890:AAxxxxxxxxxxxxxx"
              value={token}
              onChange={e => setToken(e.target.value)}
              required
              style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>Provided by @BotFather after creating a bot</p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setView('list')} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary btn-sm"
              style={{ background: '#229ed9', borderColor: '#229ed9', fontWeight: 700, minWidth: 130 }}
            >
              {saving ? 'Connecting...' : (<><Send size={14} /> Connect Bot</>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <LayoutWrapper>
      <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
        {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.msg}</div></div>}
        {!embedded && <ChannelBreadcrumb current="Telegram Bot" />}
        {view === 'list' ? ListView() : ConnectView()}
      </div>
    </LayoutWrapper>
  );
}
