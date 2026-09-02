import React, { useState, useEffect, useCallback } from 'react';
import { channelAPI } from '../../services/api';
import {
  Zap,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  Send,
  Eye,
  MessageSquare,
  Facebook,
  Shield,
  Layers,
  Sparkles,
  Info,
  X,
} from 'lucide-react';

export default function FacebookUtilityTemplateManager({ selectedAccount, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Send Modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [recipientPsid, setRecipientPsid] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Fetch templates for selected Facebook integration
  const fetchTemplates = useCallback(async () => {
    if (!selectedAccount?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await channelAPI.getFBUtilityTemplates(selectedAccount.id);
      if (res.data.graphError) {
        setError(res.data.graphError);
        setTemplates([]);
      } else {
        setTemplates(res.data.templates || []);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to load utility templates';
      setError(msg);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !searchTerm ||
      t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.components?.some((c) => c.text?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Handle Send Utility
  const handleSend = async (e) => {
    e.preventDefault();
    if (!recipientPsid) {
      showToast?.('Recipient Facebook PSID is required', 'error');
      return;
    }
    if (!selectedTemplate) {
      showToast?.('Please select a template', 'error');
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const res = await channelAPI.sendFBUtilityMessage(selectedAccount.id, {
        recipientId: recipientPsid.trim(),
        templateName: selectedTemplate.name,
        components: selectedTemplate.components || [],
      });
      setSendResult({ success: true, messageId: res.data.messageId });
      showToast?.('Utility message delivered successfully!');
      setRecipientPsid('');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to send utility message';
      setSendResult({ success: false, error: msg });
      showToast?.(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  const openSendModal = (tmpl) => {
    setSelectedTemplate(tmpl);
    setRecipientPsid('');
    setSendResult(null);
    setSendModalOpen(true);
  };

  return (
    <div style={{ padding: '4px 0' }}>
      {/* ── Top Header Banner ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e4e4f0',
          padding: '20px 24px',
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(24, 119, 242, 0.1)',
              color: '#1877f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1a1a2e', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              Facebook Utility Messaging
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(99, 102, 241, 0.1)',
                  color: '#6366f1',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                }}
              >
                pages_utility_messaging
              </span>
            </h2>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#5c5c80' }}>
              Send pre-approved transactional updates (orders, receipts, reminders) to Facebook users outside the 24-hour window.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a
            href="https://business.facebook.com"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #e4e4f0',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> Meta Business Suite
          </a>

          <button
            onClick={fetchTemplates}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #1877f2',
              background: 'rgba(24, 119, 242, 0.05)',
              color: '#1877f2',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Templates
          </button>
        </div>
      </div>

      {/* ── Guidance Alert ── */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 12,
          background: 'rgba(99,102,241,0.04)',
          border: '1px solid rgba(99,102,241,0.18)',
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <Info size={18} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
          <strong>How it works:</strong> Facebook Utility templates are created & approved inside <strong>Meta Business Suite</strong> under <em>Message Templates</em> (Category: <code>UTILITY</code>). Once approved, they sync here automatically using the <code>pages_utility_messaging</code> permission and can be dispatched directly to your subscribers' Facebook PSIDs.
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e4e4f0',
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 360 }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search utility templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: '0.82rem',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved Only</option>
            <option value="PENDING">Pending Only</option>
            <option value="REJECTED">Rejected Only</option>
          </select>
        </div>
      </div>

      {/* ── Templates List Content ── */}
      {loading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid #e4e4f0' }}>
          <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#1877f2' }} />
          <div style={{ fontSize: '0.86rem', color: '#64748b' }}>Querying Meta Graph API for Utility Templates...</div>
        </div>
      ) : error ? (
        <div style={{ padding: 24, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', textAlign: 'center' }}>
          <AlertCircle size={32} color="#dc2626" style={{ margin: '0 auto 10px auto' }} />
          <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#991b1b', margin: '0 0 6px 0' }}>
            Graph API Template Sync Notice
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#dc2626', maxWidth: 540, margin: '0 auto 14px auto' }}>
            {error}
          </p>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Ensure your connected Facebook page has <code>pages_utility_messaging</code> permission approved in Meta App Review, and that your Page Access Token has been granted this scope.
          </div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid #e4e4f0' }}>
          <Zap size={36} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px 0' }}>
            No Utility Templates Found
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 460, margin: '0 auto 18px auto' }}>
            {searchTerm
              ? 'No templates match your search query.'
              : 'Create pre-approved UTILITY message templates inside Meta Business Suite to begin sending updates outside the 24h messaging window.'}
          </p>
          <a
            href="https://business.facebook.com"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 18px',
              borderRadius: 8,
              background: '#1877f2',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.84rem',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> Open Meta Business Suite
          </a>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredTemplates.map((tmpl) => {
            const headerComp = tmpl.components?.find((c) => c.type === 'HEADER');
            const bodyComp = tmpl.components?.find((c) => c.type === 'BODY');
            const buttonsComp = tmpl.components?.find((c) => c.type === 'BUTTONS');
            const isApproved = tmpl.status === 'APPROVED';
            const statusColor = isApproved ? '#10b981' : tmpl.status === 'PENDING' ? '#f59e0b' : '#ef4444';

            return (
              <div
                key={tmpl.name}
                style={{
                  background: '#ffffff',
                  borderRadius: 12,
                  border: '1px solid #e4e4f0',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                <div>
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <h4 style={{ margin: '0 0 2px 0', fontSize: '0.92rem', fontWeight: 800, color: '#1a1a2e' }}>
                        {tmpl.name}
                      </h4>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                        Language: <strong>{tmpl.language || 'en_US'}</strong>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        color: statusColor,
                        background: statusColor + '15',
                        border: `1px solid ${statusColor}30`,
                      }}
                    >
                      {tmpl.status || 'UNKNOWN'}
                    </span>
                  </div>

                  {/* Body Preview */}
                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: 8,
                      border: '1px solid #f1f5f9',
                      padding: '10px 12px',
                      fontSize: '0.8rem',
                      color: '#334155',
                      marginBottom: 14,
                      lineHeight: 1.45,
                      minHeight: 60,
                    }}
                  >
                    {headerComp?.text && (
                      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                        {headerComp.text}
                      </div>
                    )}
                    <div>{bodyComp?.text || 'No body text specified in template definition.'}</div>
                    {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {buttonsComp.buttons.map((btn, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#e2e8f0',
                              color: '#475569',
                              fontWeight: 600,
                            }}
                          >
                            🔗 {btn.text || 'Action Button'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => openSendModal(tmpl)}
                    disabled={!isApproved}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      borderRadius: 8,
                      background: isApproved ? '#1877f2' : '#cbd5e1',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: isApproved ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <Send size={13} />
                    Send Message
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Send Utility Message ── */}
      {sendModalOpen && selectedTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: '94vw',
              background: '#ffffff',
              borderRadius: 14,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Send size={16} color="#1877f2" />
                Send Utility Message
              </h3>
              <button
                onClick={() => setSendModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSend} style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5, color: '#334155' }}>
                  Target Template
                </label>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {selectedTemplate.name}
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginLeft: 8 }}>
                    ({selectedTemplate.language || 'en_US'})
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5, color: '#334155' }}>
                  Recipient Facebook PSID *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 1234567890123456"
                  value={recipientPsid}
                  onChange={(e) => setRecipientPsid(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                    outline: 'none',
                  }}
                />
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                  Enter the recipient's Page-Scoped ID (PSID). Utility messages bypass the 24-hour window.
                </div>
              </div>

              {/* Template Preview */}
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#f1f5f9', fontSize: '0.78rem', color: '#475569' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Payload Preview:</div>
                <div>{selectedTemplate.components?.find((c) => c.type === 'BODY')?.text || selectedTemplate.name}</div>
              </div>

              {/* Send Result Banner */}
              {sendResult && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: sendResult.success ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${sendResult.success ? '#a7f3d0' : '#fecaca'}`,
                    fontSize: '0.8rem',
                    color: sendResult.success ? '#065f46' : '#dc2626',
                    marginBottom: 16,
                  }}
                >
                  {sendResult.success
                    ? `✓ Message dispatched! Message ID: ${sendResult.messageId || 'OK'}`
                    : `✗ Failed: ${sendResult.error}`}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setSendModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#475569',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !recipientPsid}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#1877f2',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: sending || !recipientPsid ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? 'Sending…' : 'Send Utility Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
