import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { botAPI, integrationAPI } from '../../services/api';

const PLATFORM_CONFIG = {
  WHATSAPP:  { icon: '📱', label: 'WhatsApp',  color: '#25d366', badgeClass: 'badge-wa' },
  FACEBOOK:  { icon: '📘', label: 'Facebook',  color: '#1877f2', badgeClass: 'badge-fb' },
  INSTAGRAM: { icon: '📷', label: 'Instagram', color: '#e1306c', badgeClass: 'badge-ig' },
  TELEGRAM:  { icon: '✈️', label: 'Telegram',  color: '#229ed9', badgeClass: 'badge-primary' },
  WEBCHAT:   { icon: '🌐', label: 'Webchat',   color: '#6366f1', badgeClass: 'badge-muted' },
};

export default function BotManagerPage() {
  const [bots, setBots] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rulesBot, setRulesBot] = useState(null);
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', platform: 'WHATSAPP', integrationId: '', welcomeMessage: '', awayMessage: '', collectEmail: false, collectPhone: false });
  const [ruleForm, setRuleForm] = useState({ triggerKeyword: '', replyMessage: '', isExactMatch: false });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [botsRes, intRes] = await Promise.all([botAPI.getAll(), integrationAPI.getAll()]);
      setBots(botsRes.data.bots || []);
      setIntegrations(intRes.data.integrations || []);
    } catch { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await botAPI.create(form);
      showToast('Bot created!');
      setShowCreate(false);
      setForm({ name: '', platform: 'WHATSAPP', integrationId: '', welcomeMessage: '', awayMessage: '', collectEmail: false, collectPhone: false });
      fetchAll();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (id) => {
    try { const res = await botAPI.toggle(id); setBots(bots.map(b => b.id === id ? { ...b, is_active: res.data.isActive } : b)); }
    catch { showToast('Failed', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this bot?')) return;
    try { await botAPI.delete(id); showToast('Bot deleted'); setBots(bots.filter(b => b.id !== id)); }
    catch { showToast('Failed', 'error'); }
  };

  const openRules = async (bot) => {
    setRulesBot(bot);
    try { const res = await botAPI.getRules(bot.id); setRules(res.data.rules || []); }
    catch { showToast('Failed to load rules', 'error'); }
  };

  const handleAddRule = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await botAPI.addRule(rulesBot.id, ruleForm);
      showToast('Rule added!');
      setRuleForm({ triggerKeyword: '', replyMessage: '', isExactMatch: false });
      const res = await botAPI.getRules(rulesBot.id); setRules(res.data.rules || []);
    } catch { showToast('Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await botAPI.deleteRule(rulesBot.id, ruleId);
      setRules(rules.filter(r => r.id !== ruleId));
      showToast('Rule deleted');
    } catch { showToast('Failed', 'error'); }
  };

  const filteredIntegrations = integrations.filter(i => i.platform === form.platform);
  const activeBots = bots.filter(b => b.is_active).length;

  return (
    <AppLayout>
      {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div></div>}

      {/* Create Bot Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">🤖 Create New Bot</div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group"><label className="form-label">Bot Name *</label><input className="form-input" placeholder="e.g. Sales Bot" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group">
                <label className="form-label">Platform *</label>
                <select className="form-input" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value, integrationId: '' }))}>
                  {Object.entries(PLATFORM_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Connect to Channel</label>
                <select className="form-input" value={form.integrationId} onChange={e => setForm(f => ({ ...f, integrationId: e.target.value }))}>
                  <option value="">— Select integration —</option>
                  {filteredIntegrations.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Welcome Message</label><textarea className="form-input" rows={2} placeholder="Hello! How can I help you?" value={form.welcomeMessage} onChange={e => setForm(f => ({ ...f, welcomeMessage: e.target.value }))} style={{ resize: 'vertical' }} /></div>
              <div className="form-group"><label className="form-label">Away Message</label><textarea className="form-input" rows={2} placeholder="We're currently unavailable…" value={form.awayMessage} onChange={e => setForm(f => ({ ...f, awayMessage: e.target.value }))} style={{ resize: 'vertical' }} /></div>
              <div className="flex gap-4">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input type="checkbox" checked={form.collectEmail} onChange={e => setForm(f => ({ ...f, collectEmail: e.target.checked }))} /> Collect Email
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input type="checkbox" checked={form.collectPhone} onChange={e => setForm(f => ({ ...f, collectPhone: e.target.checked }))} /> Collect Phone
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : '✅ Create Bot'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bot Rules Modal */}
      {rulesBot && (
        <div className="modal-overlay" onClick={() => setRulesBot(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚡ Auto-Reply Rules — {rulesBot.name}</div>
            <div style={{ marginBottom: 16 }}>
              {rules.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No rules yet. Add keyword triggers below.</div>
              ) : rules.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>"{r.trigger_keyword}"</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>{r.reply_message}</div>
                    {r.is_exact_match ? <span className="badge badge-primary" style={{ marginTop: 4 }}>Exact Match</span> : null}
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRule(r.id)}>🗑</button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddRule} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>➕ Add Rule</div>
              <div className="form-group"><label className="form-label">Trigger Keyword *</label><input className="form-input" placeholder="e.g. hello, price, support" value={ruleForm.triggerKeyword} onChange={e => setRuleForm(f => ({ ...f, triggerKeyword: e.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Reply Message *</label><textarea className="form-input" rows={2} placeholder="Bot's auto-reply…" value={ruleForm.replyMessage} onChange={e => setRuleForm(f => ({ ...f, replyMessage: e.target.value }))} required style={{ resize: 'vertical' }} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={ruleForm.isExactMatch} onChange={e => setRuleForm(f => ({ ...f, isExactMatch: e.target.checked }))} /> Exact match only
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setRulesBot(null)}>Close</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Rule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1 className="page-title">🤖 Bot Manager</h1><p className="page-subtitle">Create and manage automated chatbots across all channels</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ Create Bot</button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats Row */}
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="stat-card"><div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)' }}>🤖</div><div><div className="stat-value">{bots.length}</div><div className="stat-label">Total Bots</div></div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)' }}>✅</div><div><div className="stat-value">{activeBots}</div><div className="stat-label">Active Bots</div></div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)' }}>📡</div><div><div className="stat-value">{[...new Set(bots.map(b => b.platform))].length}</div><div className="stat-label">Platforms</div></div></div>
        </div>

        {loading ? <div className="loading-overlay"><div className="loading-spinner" /></div>
          : bots.length === 0 ? (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-icon">🤖</div>
              <div className="empty-title">No bots created yet</div>
              <div className="empty-desc">Create your first bot to automate conversations</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>➕ Create Bot</button>
            </div>
          ) : (
            <div className="grid-3">
              {bots.map(bot => {
                const pc = PLATFORM_CONFIG[bot.platform] || PLATFORM_CONFIG.WEBCHAT;
                return (
                  <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-10">
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${pc.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>{pc.icon}</div>
                        <div><div style={{ fontWeight: 700 }}>{bot.name}</div><span className={`badge ${pc.badgeClass}`} style={{ marginTop: 2 }}>{pc.icon} {pc.label}</span></div>
                      </div>
                      {/* Toggle */}
                      <div onClick={() => handleToggle(bot.id)} style={{ cursor: 'pointer' }}>
                        <div className={`toggle-track ${bot.is_active ? 'on' : ''}`}><div className="toggle-thumb" /></div>
                      </div>
                    </div>
                    {bot.welcome_message && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 8, padding: '8px 12px', fontStyle: 'italic' }}>"{bot.welcome_message.slice(0, 80)}{bot.welcome_message.length > 80 ? '…' : ''}"</div>}
                    {bot.integrationName && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📡 {bot.integrationName}</div>}
                    <div className="flex gap-2" style={{ marginTop: 'auto', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openRules(bot)}>⚡ Rules ({bot.totalConversations || 0})</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(bot.id)}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </AppLayout>
  );
}
