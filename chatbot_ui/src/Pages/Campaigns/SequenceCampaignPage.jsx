import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { sequenceAPI } from '../../services/api';

export default function SequenceCampaignPage() {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Modals & Details
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState(null);
  const [seqItems, setSeqItems] = useState([]);
  const [seqSubscribers, setSeqSubscribers] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState('ALL');

  // New Sequence Form
  const [form, setForm] = useState({
    name: '',
    platform: 'WHATSAPP',
    steps: [
      { delayMinutes: 0, messageBody: 'Welcome! Thank you for connecting with us.' },
      { delayMinutes: 1440, messageBody: 'Hi {{name}}, just checking in to see if you have any questions!' }
    ],
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sequenceAPI.getAll();
      setSequences(res.data.sequences || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load sequences', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSequences();
  }, [loadSequences]);

  // View Details
  const handleViewDetails = async (seq) => {
    setSelectedSequence(seq);
    setDetailsLoading(true);
    try {
      const res = await sequenceAPI.getOne(seq.id);
      setSeqItems(res.data.items || []);
      setSeqSubscribers(res.data.subscribers || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load sequence details', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Add Step
  const handleAddStep = () => {
    setForm(prev => ({
      ...prev,
      steps: [...prev.steps, { delayMinutes: 1440, messageBody: '' }]
    }));
  };

  // Remove Step
  const handleRemoveStep = (index) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }));
  };

  // Create Sequence
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.steps.length === 0) return showToast('Please add at least 1 sequence step', 'error');
    setSaving(true);
    try {
      await sequenceAPI.create(form);
      showToast('Drip sequence created successfully!');
      setShowCreateModal(false);
      setForm({
        name: '',
        platform: 'WHATSAPP',
        steps: [
          { delayMinutes: 0, messageBody: 'Welcome! Thank you for connecting with us.' },
          { delayMinutes: 1440, messageBody: 'Hi {{name}}, just checking in to see if you have any questions!' }
        ],
      });
      loadSequences();
    } catch (err) {
      showToast(err.response?.data?.message || 'Creation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Enroll Contacts
  const handleEnroll = async () => {
    if (!selectedSequence) return;
    setSaving(true);
    try {
      const res = await sequenceAPI.subscribe(selectedSequence.id, {
        targetPlatform: enrollTarget === 'ALL' ? null : enrollTarget,
      });
      showToast(res.data.message || 'Contacts enrolled!');
      setShowEnrollModal(false);
      handleViewDetails(selectedSequence);
      loadSequences();
    } catch (err) {
      showToast('Enrollment failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete Sequence
  const handleDelete = async (seq) => {
    if (!window.confirm(`Delete drip sequence "${seq.name}"?`)) return;
    try {
      await sequenceAPI.delete(seq.id);
      showToast('Sequence deleted');
      if (selectedSequence?.id === seq.id) setSelectedSequence(null);
      loadSequences();
    } catch (err) {
      showToast('Delete failed', 'error');
    }
  };

  return (
    <AppLayout>
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>Drip Sequences ⏳</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Automate multi-step follow-up message drips for leads and new subscribers
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + Create Drip Sequence
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

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedSequence ? '1fr 420px' : '1fr', gap: 24 }}>
        {/* Sequences Cards */}
        <div>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Loading drip sequences…</p>
            </div>
          ) : sequences.length === 0 ? (
            <div className="card" style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>⏳</div>
              <h3 style={{ fontWeight: 600, marginBottom: 4 }}>No drip sequences created</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                Set up automated drip sequences to nurture leads over hours and days.
              </p>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                + Create Drip Sequence
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {sequences.map((seq) => (
                <div
                  key={seq.id}
                  className="card"
                  style={{
                    padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    border: selectedSequence?.id === seq.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: 'var(--bg-card)', borderRadius: 12
                  }}
                >
                  <div>
                    <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                      <span className="badge badge-primary">{seq.platform}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {seq.step_count || 0} Steps • {seq.subscriber_count || 0} Enrolled
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12 }}>{seq.name}</h3>
                  </div>

                  <div className="flex gap-2" style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm btn-primary flex-1" onClick={() => handleViewDetails(seq)}>
                      👁️ Details
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(seq)}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details & Subscribers Drawer */}
        {selectedSequence && (
          <div className="card" style={{ padding: 20, height: 'fit-content', position: 'sticky', top: 20 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedSequence.name}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Channel: {selectedSequence.platform}</span>
              </div>
              <button className="btn btn-xs btn-secondary" onClick={() => setSelectedSequence(null)}>✕ Close</button>
            </div>

            <div className="flex gap-2" style={{ marginBottom: 16 }}>
              <button className="btn btn-sm btn-success w-full" onClick={() => setShowEnrollModal(true)}>
                👥 Enroll Contacts
              </button>
            </div>

            {detailsLoading ? (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading steps…</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Timeline Steps */}
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>Sequence Timeline</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {seqItems.map((step) => {
                      const mins = step.delay_minutes;
                      const delayText = mins === 0 ? 'Instant' : mins >= 1440 ? `After ${Math.round(mins / 1440)} day(s)` : `After ${Math.round(mins / 60)} hour(s)`;

                      return (
                        <div key={step.id} style={{ padding: 10, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                          <div className="flex justify-between items-center" style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>
                            <span>Step {step.step_number}</span>
                            <span>⏱️ {delayText}</span>
                          </div>
                          <div style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>"{step.message_body}"</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Enrolled Subscribers List */}
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
                    Enrolled Contacts ({seqSubscribers.length})
                  </h4>
                  {seqSubscribers.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                      No contacts currently enrolled in this drip.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {seqSubscribers.map(sub => (
                        <div key={sub.id} className="flex justify-between items-center" style={{ padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.8rem' }}>
                          <span>{sub.contact_name || sub.phone || 'Contact'}</span>
                          <span style={{ color: sub.status === 'ACTIVE' ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                            Step {sub.current_step} ({sub.status})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Sequence Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 560, maxWidth: '92vw', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>Create Drip Sequence</h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Sequence Name</label>
                <input
                  className="form-input w-full"
                  required
                  placeholder="e.g. Lead Onboarding Drip 🌟"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Platform</label>
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
                <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 700 }}>Sequence Steps ({form.steps.length})</label>
                  <button type="button" className="btn btn-xs btn-secondary" onClick={handleAddStep}>+ Add Step</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {form.steps.map((step, idx) => (
                    <div key={idx} className="card" style={{ padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary)' }}>Step #{idx + 1}</span>
                        {form.steps.length > 1 && (
                          <button type="button" className="btn btn-xs btn-danger" onClick={() => handleRemoveStep(idx)}>✕ Remove</button>
                        )}
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Delay Time</label>
                        <select
                          className="form-input w-full"
                          value={step.delayMinutes}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            const updated = [...form.steps];
                            updated[idx].delayMinutes = val;
                            setForm({ ...form, steps: updated });
                          }}
                        >
                          <option value={0}>Instant (Send Immediately)</option>
                          <option value={60}>After 1 Hour</option>
                          <option value={360}>After 6 Hours</option>
                          <option value={1440}>After 24 Hours (1 Day)</option>
                          <option value={2880}>After 48 Hours (2 Days)</option>
                          <option value={4320}>After 3 Days</option>
                          <option value={10080}>After 7 Days</option>
                        </select>
                      </div>

                      <div>
                        <textarea
                          className="form-input w-full"
                          required
                          rows={2}
                          placeholder={`Message text for Step ${idx + 1}...`}
                          value={step.messageBody}
                          onChange={e => {
                            const updated = [...form.steps];
                            updated[idx].messageBody = e.target.value;
                            setForm({ ...form, steps: updated });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Drip Sequence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && selectedSequence && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 440, maxWidth: '92vw', padding: 24 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 12 }}>
              Enroll Contacts in "{selectedSequence.name}"
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              Select target audience segment to enroll into this automated drip sequence.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Audience Segment</label>
              <select
                className="form-input w-full"
                value={enrollTarget}
                onChange={e => setEnrollTarget(e.target.value)}
              >
                <option value="ALL">All Contacts</option>
                <option value="WHATSAPP">WhatsApp Contacts Only</option>
                <option value="FACEBOOK">Facebook Contacts Only</option>
                <option value="TELEGRAM">Telegram Contacts Only</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEnrollModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleEnroll} disabled={saving}>
                {saving ? 'Enrolling…' : '🚀 Start Drip Enrollment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
