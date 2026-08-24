import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { campaignAPI, templateAPI } from '../../services/api';

export default function CampaignListPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [waTemplates, setWaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Detail Drawer & Modal
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: '',
    platform: 'WHATSAPP',
    templateId: '',
    messageBody: '',
    targetPlatformFilter: 'ALL',
    sendNow: true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignAPI.getAll();
      setCampaigns(res.data.campaigns || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
    templateAPI.getWATemplates()
      .then(res => setWaTemplates(res.data.templates || []))
      .catch(err => console.error(err));
  }, [loadCampaigns]);

  // View Campaign Logs
  const handleViewLogs = async (camp) => {
    setSelectedCampaign(camp);
    setLogsLoading(true);
    try {
      const res = await campaignAPI.getOne(camp.id);
      setCampaignLogs(res.data.logs || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load recipient logs', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  // Create & Launch Campaign
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await campaignAPI.create(form);
      showToast(res.data.message || 'Campaign launched!');
      setShowCreateModal(false);
      setForm({
        name: '',
        platform: 'WHATSAPP',
        templateId: '',
        messageBody: '',
        targetPlatformFilter: 'ALL',
        sendNow: true,
      });
      loadCampaigns();
    } catch (err) {
      showToast(err.response?.data?.message || 'Creation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete Campaign
  const handleDelete = async (camp) => {
    if (!window.confirm(`Delete campaign "${camp.name}"?`)) return;
    try {
      await campaignAPI.delete(camp.id);
      showToast('Campaign deleted');
      if (selectedCampaign?.id === camp.id) setSelectedCampaign(null);
      loadCampaigns();
    } catch (err) {
      showToast('Delete failed', 'error');
    }
  };

  return (
    <AppLayout>
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>Broadcast Campaigns 📢</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Send bulk outbound broadcasts across WhatsApp, Messenger, Instagram, and Telegram
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + Create Broadcast Campaign
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '12px 20px', borderRadius: 8,
            background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
            color: '#fff', fontWeight: 500, boxShadow: 'var(--shadow-md)'
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedCampaign ? '1fr 380px' : '1fr', gap: 24 }}>
        {/* Campaign Cards List */}
        <div>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Loading campaigns…</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="card" style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📢</div>
              <h3 style={{ fontWeight: 600, marginBottom: 4 }}>No broadcast campaigns yet</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                Create your first bulk campaign to reach your subscribers on WhatsApp & Social Channels.
              </p>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                + Create Broadcast Campaign
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {campaigns.map((camp) => {
                const percent = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0;
                const statusColor = camp.status === 'COMPLETED' ? 'var(--success)' : camp.status === 'PROCESSING' ? 'var(--warning)' : camp.status === 'FAILED' ? 'var(--danger)' : '#64748b';

                return (
                  <div
                    key={camp.id}
                    className="card"
                    style={{
                      padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
                      border: selectedCampaign?.id === camp.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: 'var(--bg-card)', borderRadius: 12
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{camp.name}</span>
                          <span
                            style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700,
                              color: '#fff', background: statusColor
                            }}
                          >
                            {camp.status}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          Channel: <strong>{camp.platform}</strong> • Created: {new Date(camp.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-secondary" onClick={() => handleViewLogs(camp)}>
                          📊 Recipient Logs
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(camp)}>
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-xs" style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>
                        <span>Progress: {camp.sent_count} / {camp.total_contacts} sent</span>
                        <span>{percent}%</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-surface)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${percent}%`, height: '100%', background: statusColor, transition: 'width 0.3s' }} />
                      </div>
                    </div>

                    {camp.message_body && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: 10, borderRadius: 8, fontStyle: 'italic' }}>
                        "{camp.message_body}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recipient Logs Drawer */}
        {selectedCampaign && (
          <div className="card" style={{ padding: 20, height: 'fit-content', position: 'sticky', top: 20 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Recipient Logs #{selectedCampaign.id}</h3>
              <button className="btn btn-xs btn-secondary" onClick={() => setSelectedCampaign(null)}>✕ Close</button>
            </div>

            {logsLoading ? (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading logs…</p>
              </div>
            ) : campaignLogs.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                No recipient logs found.
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campaignLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: 10, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)',
                      fontSize: '0.82rem'
                    }}
                  >
                    <div className="flex justify-between items-center" style={{ fontWeight: 600 }}>
                      <span>{log.contact_name || log.phone || 'Contact'}</span>
                      <span style={{ color: log.status === 'SENT' ? 'var(--success)' : log.status === 'FAILED' ? 'var(--danger)' : 'var(--warning)' }}>
                        {log.status}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
                      {log.platform} {log.sent_at ? `• ${new Date(log.sent_at).toLocaleTimeString()}` : ''}
                    </div>
                    {log.error_message && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>
                        Error: {log.error_message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Broadcast Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 540, maxWidth: '92vw', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>Create & Launch Broadcast Campaign</h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Campaign Name</label>
                <input
                  className="form-input w-full"
                  required
                  placeholder="e.g. Summer Promo Broadcast 🚀"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Platform Channel</label>
                  <select
                    className="form-input w-full"
                    value={form.platform}
                    onChange={e => setForm({ ...form, platform: e.target.value })}
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="FACEBOOK">Facebook Messenger</option>
                    <option value="INSTAGRAM">Instagram DM</option>
                    <option value="TELEGRAM">Telegram</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Target Audience Filter</label>
                  <select
                    className="form-input w-full"
                    value={form.targetPlatformFilter}
                    onChange={e => setForm({ ...form, targetPlatformFilter: e.target.value })}
                  >
                    <option value="ALL">All Contacts</option>
                    <option value="WHATSAPP">WhatsApp Contacts</option>
                    <option value="FACEBOOK">Facebook Contacts</option>
                    <option value="TELEGRAM">Telegram Contacts</option>
                  </select>
                </div>
              </div>

              {form.platform === 'WHATSAPP' && waTemplates.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Use Approved WhatsApp Template (Optional)</label>
                  <select
                    className="form-input w-full"
                    value={form.templateId}
                    onChange={e => {
                      const tplId = e.target.value;
                      const selectedTpl = waTemplates.find(t => t.id === parseInt(tplId));
                      setForm({
                        ...form,
                        templateId: tplId,
                        messageBody: selectedTpl ? selectedTpl.body_text : form.messageBody
                      });
                    }}
                  >
                    <option value="">-- Custom Text Message --</option>
                    {waTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.template_name} ({t.language})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Message Content</label>
                <textarea
                  className="form-input w-full"
                  required
                  rows={4}
                  placeholder="Hello {{name}}, check out our new special offers for this week!"
                  value={form.messageBody}
                  onChange={e => setForm({ ...form, messageBody: e.target.value })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variables available: `{"{{name}}"}` and `{"{{phone}}"}`</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Broadcasting…' : '🚀 Launch Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
