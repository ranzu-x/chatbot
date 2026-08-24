import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';

export default function TelegramPage() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchBots(); }, []);

  const fetchBots = async () => {
    setLoading(true);
    try { const res = await channelAPI.getTelegram(); setBots(res.data.bots || []); }
    catch { showToast('Failed to load', 'error'); } finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    try {
      const res = await channelAPI.addTelegram(token);
      showToast(`✅ Bot @${res.data.botUsername} connected! Webhook ${res.data.webhookSet ? 'configured automatically ✅' : 'setup failed ⚠️'}`);
      setToken('');
      fetchBots();
    } catch (err) { showToast(err.response?.data?.message || 'Invalid bot token', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this Telegram bot?')) return;
    try { await channelAPI.deleteTelegram(id); showToast('Bot removed'); fetchBots(); }
    catch { showToast('Failed', 'error'); }
  };

  return (
    <AppLayout>
      {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.msg}</div></div>}
      <div className="page-header">
        <h1 className="page-title">✈️ Telegram</h1>
        <p className="page-subtitle">Connect Telegram bots using BotFather token — webhook is auto-configured</p>
      </div>
      <div className="page-body">
        {/* Steps */}
        <div style={{ background: 'rgba(34,157,217,0.07)', border: '1px solid rgba(34,157,217,0.2)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, color: '#229ed9', marginBottom: 12 }}>📋 How to get your Bot Token:</div>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <li>Open Telegram and search for <strong>@BotFather</strong></li>
            <li>Send the command <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4 }}>/newbot</code> and follow the prompts</li>
            <li>Choose a name and username for your bot</li>
            <li>BotFather will give you a token — copy and paste it below</li>
            <li>We will automatically register the webhook for you ✅</li>
          </ol>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Connected Bots</h2>
            {loading ? <div className="loading-overlay"><div className="loading-spinner" /></div>
              : bots.length === 0 ? (
                <div className="empty-state"><div className="empty-icon">✈️</div><div className="empty-title">No Telegram bots connected</div><div className="empty-desc">Add your bot token using the form</div></div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Bot Name</th><th>Username</th><th>Webhook</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {bots.map(b => (
                        <tr key={b.id}>
                          <td><div className="flex items-center gap-2"><span style={{ color: '#229ed9' }}>✈️</span><span className="font-medium">{b.bot_name}</span></div></td>
                          <td style={{ color: '#229ed9' }}>@{b.bot_username}</td>
                          <td><span className={`badge ${b.webhook_set ? 'badge-success' : 'badge-warning'}`}>{b.webhook_set ? '✅ Set' : '⚠️ Pending'}</span></td>
                          <td><span className={`badge ${b.is_active ? 'badge-success' : 'badge-muted'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}>🗑 Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>➕ Connect Bot</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Bot Token *</label>
                <input className="form-input" placeholder="e.g. 1234567890:AAxxxxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} required />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Provided by @BotFather after creating a bot</span>
              </div>
              <button type="submit" className="btn btn-primary w-full" style={{ background: 'linear-gradient(135deg, #229ed9, #1a7eaa)' }} disabled={saving}>
                {saving ? (<><span className="loading-spinner" style={{ width: 16, height: 16 }} /> Connecting…</>) : '✈️ Connect Bot'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
