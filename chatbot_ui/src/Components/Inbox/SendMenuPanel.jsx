import { useState, useEffect, useMemo } from 'react';
import { flowAPI, templateAPI, whatsappFlowRefAPI, conversationAPI } from '../../services/api';
import { X, Bot, FileText, Workflow, Search, ChevronLeft, Send } from 'lucide-react';

/**
 * Live Inbox composer → "Send" menu — a right-side panel offering Bot Flow /
 * Message Template / WhatsApp Flow, each searchable, each channel-aware.
 * Bot Flow reuses the existing POST /conversations/:id/trigger-flow (already
 * built, just newly reachable from here). Message Template and WhatsApp Flow
 * both go through the normal POST /conversations/:id/messages send path
 * (extended to accept templateId/variableValues or whatsappFlowRefId).
 */
export default function SendMenuPanel({ open, onClose, conversationId, integrationId, platform, onSent, initialSection = 'menu' }) {
  const [section, setSection] = useState(initialSection); // 'menu' | 'flow' | 'template' | 'whatsappFlow'
  const [search, setSearch] = useState('');
  const [flows, setFlows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [flowRefs, setFlowRefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null); // template needing a variable-fill form
  const [variableValues, setVariableValues] = useState({});

  const isWhatsApp = platform === 'WHATSAPP';

  useEffect(() => {
    if (open && initialSection) {
      setSection(initialSection);
    }
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) { setSection(initialSection || 'menu'); setSearch(''); setPendingTemplate(null); }
  }, [open, initialSection]);

  useEffect(() => {
    if (!open || section === 'menu') return;
    setLoading(true);
    if (section === 'flow') {
      flowAPI.getAll().then((res) => setFlows(res.data?.flows || [])).catch(() => setFlows([])).finally(() => setLoading(false));
    } else if (section === 'template') {
      templateAPI.getWATemplates({ status: 'APPROVED', integrationId }).then((res) => setTemplates(res.data?.templates || [])).catch(() => setTemplates([])).finally(() => setLoading(false));
    } else if (section === 'whatsappFlow') {
      whatsappFlowRefAPI.getAll({ integrationId }).then((res) => setFlowRefs(res.data?.flowRefs || [])).catch(() => setFlowRefs([])).finally(() => setLoading(false));
    }
  }, [open, section, integrationId]);

  const filteredFlows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return flows
      .filter((f) => !f.platform || f.platform === platform || f.platform === 'ALL')
      .filter((f) => !q || f.name?.toLowerCase().includes(q));
  }, [flows, search, platform]);

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    return templates.filter((t) => !q || t.template_name?.toLowerCase().includes(q) || t.body_text?.toLowerCase().includes(q));
  }, [templates, search]);

  const filteredFlowRefs = useMemo(() => {
    const q = search.toLowerCase().trim();
    return flowRefs.filter((f) => !q || f.name?.toLowerCase().includes(q));
  }, [flowRefs, search]);

  const handlePickFlow = async (flow) => {
    if (busy) return;
    setBusy(true);
    try {
      await conversationAPI.triggerFlow(conversationId, flow.id);
      onSent?.({ kind: 'flow', name: flow.name });
      onClose?.();
    } catch (err) {
      console.error('Failed to trigger flow', err);
    } finally {
      setBusy(false);
    }
  };

  const handlePickTemplate = (tpl) => {
    let variables = [];
    try { variables = typeof tpl.variables_json === 'string' ? JSON.parse(tpl.variables_json || '[]') : (tpl.variables_json || []); } catch { variables = []; }
    if (variables.length === 0) {
      sendTemplate(tpl, {});
      return;
    }
    setPendingTemplate({ ...tpl, variables });
    const initial = {};
    for (const v of variables) initial[v.param] = v.sample || '';
    setVariableValues(initial);
  };

  const sendTemplate = async (tpl, values) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await conversationAPI.sendMessage(conversationId, { templateId: tpl.id, variableValues: values });
      onSent?.({ kind: 'template', message: res.data?.message });
      onClose?.();
    } catch (err) {
      console.error('Failed to send template', err);
    } finally {
      setBusy(false);
    }
  };

  const handlePickFlowRef = async (flowRef) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await conversationAPI.sendMessage(conversationId, { whatsappFlowRefId: flowRef.id });
      onSent?.({ kind: 'whatsappFlow', message: res.data?.message });
      onClose?.();
    } catch (err) {
      console.error('Failed to send WhatsApp Flow', err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const panelStyle = {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, maxWidth: '92vw',
    background: '#ffffff', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', zIndex: 40,
  };

  return (
    <div style={panelStyle}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
        {section !== 'menu' && !pendingTemplate && (
          <button onClick={() => setSection('menu')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
            <ChevronLeft size={18} />
          </button>
        )}
        {pendingTemplate && (
          <button onClick={() => setPendingTemplate(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
            <ChevronLeft size={18} />
          </button>
        )}
        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', flex: 1 }}>
          {pendingTemplate ? 'Fill in template' : section === 'menu' ? 'Send' : section === 'flow' ? 'Bot Flow' : section === 'template' ? 'Message Template' : 'WhatsApp Flow'}
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
          <X size={18} />
        </button>
      </div>

      {pendingTemplate ? (
        <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: 10, borderRadius: 8 }}>
            {pendingTemplate.body_text}
          </div>
          {pendingTemplate.variables.map((v, idx) => (
            <div key={v.param || idx}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                Variable {v.param} {v.field && v.field !== 'custom' ? `(${v.field})` : ''}
              </label>
              <input
                className="form-input"
                style={{ width: '100%' }}
                value={variableValues[v.param] ?? ''}
                onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.param]: e.target.value }))}
              />
            </div>
          ))}
          <button
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={() => sendTemplate(pendingTemplate, variableValues)}
            style={{ justifyContent: 'center', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={14} /> {busy ? 'Sending…' : 'Send Template'}
          </button>
        </div>
      ) : section === 'menu' ? (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setSection('flow')} style={menuItemStyle}>
            <Bot size={18} color="#6366f1" /> <span>Bot Flow</span>
          </button>
          {isWhatsApp && (
            <button onClick={() => setSection('template')} style={menuItemStyle}>
              <FileText size={18} color="#10b981" /> <span>Message Template</span>
            </button>
          )}
          {isWhatsApp && (
            <button onClick={() => setSection('whatsappFlow')} style={menuItemStyle}>
              <Workflow size={18} color="#f59e0b" /> <span>WhatsApp Flow</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 9, top: 9 }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
            ) : section === 'flow' ? (
              filteredFlows.length === 0 ? <EmptyState text="No matching bot flows." /> : filteredFlows.map((f) => (
                <ListRow key={f.id} title={f.name} subtitle={f.platform} onClick={() => handlePickFlow(f)} disabled={busy} />
              ))
            ) : section === 'template' ? (
              filteredTemplates.length === 0 ? <EmptyState text="No approved templates for this bot." /> : filteredTemplates.map((t) => (
                <ListRow key={t.id} title={t.template_name} subtitle={t.body_text} onClick={() => handlePickTemplate(t)} disabled={busy} />
              ))
            ) : (
              filteredFlowRefs.length === 0 ? <EmptyState text="No WhatsApp Flows configured yet. Add one under Settings → WhatsApp Flows." /> : filteredFlowRefs.map((f) => (
                <ListRow key={f.id} title={f.name} subtitle={f.flow_id} onClick={() => handlePickFlowRef(f)} disabled={busy} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 700, color: '#0f172a',
};

function ListRow({ title, subtitle, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8,
        border: 'none', background: 'transparent', cursor: disabled ? 'wait' : 'pointer', marginBottom: 2,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
    </button>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: '0.8rem' }}>{text}</div>;
}
