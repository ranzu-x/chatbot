import { useState, useEffect, useCallback, useRef } from 'react';
import { aiAgentAPI, aiProviderAPI, labelAPI, flowAPI, sequenceAPI, googleSheetsAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  ArrowLeft, MessageSquare, Compass, BookOpen, Zap, Send, RotateCcw,
  Loader2, Trash2, Star, X, Plus, Quote, FileText, Link2, Upload,
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Tag, GitBranch, Repeat, UserCheck,
  Image as ImageIcon, Sheet,
} from 'lucide-react';
import Swal from 'sweetalert2';

const AVATAR_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#c2410c', '#be185d', '#16a34a'];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const SECTIONS = [
  { id: 'instructions', label: 'Instructions', desc: 'System prompt & behavior', Icon: MessageSquare, ready: true },
  { id: 'routing', label: 'Routing Rules', desc: 'When this Agent should answer', Icon: Compass, ready: true },
  { id: 'knowledge', label: 'Knowledge Base', desc: "Docs, sheets & links it reads", Icon: BookOpen, ready: true },
  { id: 'actions', label: 'Actions', desc: "What it's allowed to do", Icon: Zap, ready: true },
];

export default function AIAgentEditor({ agentId, onBack, onDeleted }) {
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('instructions');
  const [providers, setProviders] = useState([]);

  // Local editable form state, seeded once the agent loads.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([aiAgentAPI.getOne(agentId), aiProviderAPI.getAll()])
      .then(([agentRes, provRes]) => {
        const a = agentRes.data?.agent;
        setAgent(a);
        setName(a?.name || '');
        setDescription(a?.description || '');
        setSystemPrompt(a?.system_prompt || '');
        setIsActive(!!a?.is_active);
        setIsDefault(!!a?.is_default);
        setPreferredProvider(a?.preferred_provider || '');
        setProviders((provRes.data?.providers || []).filter((p) => p.connected && p.enabled));
      })
      .catch(() => notify.error('Failed to load Agent'))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const dirty = agent && (
    name !== agent.name ||
    (description || '') !== (agent.description || '') ||
    systemPrompt !== (agent.system_prompt || '') ||
    isActive !== !!agent.is_active ||
    isDefault !== !!agent.is_default ||
    (preferredProvider || '') !== (agent.preferred_provider || '')
  );

  const handleSave = async () => {
    if (!name.trim()) { notify.error('Agent name is required'); return; }
    setSaving(true);
    try {
      const res = await aiAgentAPI.update(agentId, {
        name: name.trim(),
        description,
        systemPrompt,
        isActive,
        isDefault,
        preferredProvider: preferredProvider || null,
      });
      setAgent(res.data?.agent);
      notify.success('Saved');
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await Swal.fire({
      title: `Delete "${agent?.name}"?`,
      text: 'This cannot be undone.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete',
    });
    if (!ok.isConfirmed) return;
    try {
      await aiAgentAPI.delete(agentId);
      notify.success('Agent deleted');
      onDeleted?.();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  if (loading || !agent) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading Agent...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
      {/* Top bar */}
      <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={iconBtnStyle} title="Back to Agents"><ArrowLeft size={15} /></button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: colorFor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12.5 }}>
            {initials(name)}
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Channel-independent · used on {agent.channels?.length || 0} bot(s)</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge ${isActive ? 'badge-success' : 'badge-muted'}`}>{isActive ? 'Active' : 'Draft'}</span>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save changes'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 520 }}>
        {/* Section rail */}
        <div style={{ width: 224, flexShrink: 0, borderRight: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SECTIONS.map((s) => (
            <div
              key={s.id}
              onClick={() => s.ready ? setSection(s.id) : notify.info('Coming in a future update')}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 10px', borderRadius: 10,
                cursor: s.ready ? 'pointer' : 'not-allowed', opacity: s.ready ? 1 : 0.45,
                background: section === s.id ? 'rgba(37,99,235,0.07)' : 'transparent',
                color: section === s.id ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              <s.Icon size={15} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.label}{!s.ready && <span style={{ fontSize: 9, fontWeight: 800, marginLeft: 6, color: 'var(--text-muted)' }}>SOON</span>}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.35 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', minWidth: 0 }}>
        {section === 'routing' ? (
          <RoutingRulesSection agentId={agentId} />
        ) : section === 'knowledge' ? (
          <KnowledgeBaseSection agentId={agentId} />
        ) : section === 'actions' ? (
          <ActionsSection agentId={agentId} />
        ) : (
        <>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Instructions</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 18, maxWidth: 520 }}>
            What this Agent is called, what it does, and exactly how it should behave.
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Agent Name</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Agent" />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Description (internal — not shown to customers)</label>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Answers pricing, packages, and subscription questions" />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">System Prompt</label>
            <textarea
              className="form-input"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              placeholder="You are a helpful, professional assistant for..."
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tell it what to do, how to sound, and what not to do. This is sent before every conversation.</span>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Preferred AI Provider (optional)</label>
            <select className="form-input" value={preferredProvider} onChange={(e) => setPreferredProvider(e.target.value)}>
              <option value="">Auto — best connected provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {providers.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--warning)' }}>No AI provider connected yet — add one in Settings → AI Providers before this Agent can reply.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              <Star size={12} color="var(--warning)" /> Default Agent for this agency
            </label>
            <span
              onClick={handleDelete}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--danger)', cursor: 'pointer' }}
            >
              <Trash2 size={13} /> Delete Agent
            </span>
          </div>
        </>
        )}
        </div>

        {/* Test chat panel */}
        <TestChatPanel agentId={agentId} providersAvailable={providers.length > 0} />
      </div>
    </div>
  );
}

const iconBtnStyle = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: '#fff',
  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

/**
 * Keywords (instant, free, checked first) + example phrases (compared by
 * meaning only when no keyword matches — see utils/aiRouting.js on the
 * backend) + priority (which Agent wins when more than one would match).
 */
function RoutingRulesSection({ agentId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [phrases, setPhrases] = useState([]);
  const [phraseInput, setPhraseInput] = useState('');
  const [priority, setPriority] = useState(0);
  const [hasEmbeddings, setHasEmbeddings] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLoading(true);
    aiAgentAPI.getRouting(agentId)
      .then((res) => {
        const r = res.data?.routing || {};
        setKeywords(r.keywords || []);
        setPhrases(r.examplePhrases || []);
        setPriority(r.priority || 0);
        setHasEmbeddings(!!r.hasEmbeddings);
        setDirty(false);
      })
      .catch(() => notify.error('Failed to load routing rules'))
      .finally(() => setLoading(false));
  }, [agentId]);

  const addKeyword = () => {
    const v = keywordInput.trim().toLowerCase();
    if (!v || keywords.includes(v)) return;
    setKeywords((prev) => [...prev, v]);
    setKeywordInput('');
    setDirty(true);
  };
  const removeKeyword = (v) => { setKeywords((prev) => prev.filter((k) => k !== v)); setDirty(true); };

  const addPhrase = () => {
    const v = phraseInput.trim();
    if (!v || phrases.includes(v)) return;
    setPhrases((prev) => [...prev, v]);
    setPhraseInput('');
    setDirty(true);
  };
  const removePhrase = (v) => { setPhrases((prev) => prev.filter((p) => p !== v)); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await aiAgentAPI.saveRouting(agentId, { keywords, examplePhrases: phrases, priority });
      notify.success(res.data?.message || 'Routing rules saved');
      setHasEmbeddings(phrases.length === 0 ? false : hasEmbeddings || true);
      setDirty(false);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to save routing rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Loading routing rules...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Routing Rules</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 18, maxWidth: 480 }}>
            Fast keyword matches run first at no cost. If nothing matches, example phrases are compared by meaning to route rephrased questions correctly.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save routing'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
          Keywords &amp; phrases
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>A message containing any of these routes here instantly.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, border: '1px solid var(--border)', borderRadius: 10, padding: 10, minHeight: 46, alignItems: 'center' }}>
          {keywords.map((k) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eef2ff', color: 'var(--primary)', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999 }}>
              {k}
              <X size={11} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => removeKeyword(k)} />
            </span>
          ))}
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder={keywords.length ? 'Add another...' : 'e.g. price, pricing, cost'}
            style={{ border: 'none', outline: 'none', fontSize: 12.5, flex: 1, minWidth: 120 }}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
          Example phrases (semantic match)
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>
          Real ways a customer might ask, even without the exact keywords above — used only when keywords don't match.
          {!hasEmbeddings && phrases.length > 0 && (
            <span style={{ color: 'var(--warning)', display: 'block', marginTop: 4 }}>
              Connect an embeddings-capable AI provider (OpenAI or Gemini) in Settings → AI Providers to activate semantic matching for these.
            </span>
          )}
        </div>
        {phrases.map((p) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <Quote size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{p}</span>
            <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => removePhrase(p)} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: phrases.length ? 10 : 0 }}>
          <input
            className="form-input"
            value={phraseInput}
            onChange={(e) => setPhraseInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase(); } }}
            placeholder="e.g. What would I have to pay for this?"
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={addPhrase} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>Priority</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10 }}>If two Agents both match a message, the higher-priority one wins.</div>
        <input
          type="range" min={0} max={100} value={priority}
          onChange={(e) => { setPriority(Number(e.target.value)); setDirty(true); }}
          style={{ width: '100%' }}
        />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{priority}</div>
      </div>
    </div>
  );
}

function TestChatPanel({ agentId, providersAvailable }) {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    try {
      const res = await aiAgentAPI.testChat(agentId, { message: text, history });
      setMessages((m) => [...m, { role: 'assistant', content: res.data?.reply || '', meta: `${res.data?.providerUsed} · ${res.data?.latencyMs}ms` }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: err?.response?.data?.message || 'The AI provider call failed.', error: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}>
          <MessageSquare size={14} /> Test this Agent
        </span>
        <span onClick={() => setMessages([])} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RotateCcw size={11} /> Reset
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 300 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
            {providersAvailable ? 'Send a message to try this Agent for real.' : 'Connect an AI provider first to test this Agent.'}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div style={{
              maxWidth: '88%', marginLeft: m.role === 'user' ? 'auto' : 0,
              padding: '9px 12px', borderRadius: 13, fontSize: 12.5, lineHeight: 1.5,
              background: m.role === 'user' ? 'var(--primary)' : (m.error ? '#fef2f2' : '#fff'),
              color: m.role === 'user' ? '#fff' : (m.error ? 'var(--danger)' : 'var(--text-primary)'),
              border: m.role === 'user' ? 'none' : `1px solid ${m.error ? '#fecaca' : 'var(--border)'}`,
              borderTopRightRadius: m.role === 'user' ? 4 : 13,
              borderTopLeftRadius: m.role === 'user' ? 13 : 4,
            }}>
              {m.content}
            </div>
            {m.meta && <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 3 }}>{m.meta}</div>}
          </div>
        ))}
        {sending && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Thinking…</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Try a message..."
          disabled={!providersAvailable}
        />
        <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={!input.trim() || sending || !providersAvailable} style={{ flexShrink: 0 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

const ACTION_TYPE_META = {
  add_label: { label: 'Add a Label', Icon: Tag, needs: 'label', color: '#a21caf' },
  remove_label: { label: 'Remove a Label', Icon: Tag, needs: 'label', color: '#a21caf' },
  start_flow: { label: 'Start a Flow', Icon: GitBranch, needs: 'flow', color: '#2563eb' },
  start_sequence: { label: 'Start a Sequence', Icon: Repeat, needs: 'sequence', color: '#0891b2' },
  stop_sequence: { label: 'Stop a Sequence', Icon: Repeat, needs: 'sequence', color: '#0891b2' },
  assign_human: { label: 'Assign to a Human', Icon: UserCheck, needs: null, color: '#c2410c' },
};

/**
 * An Agent's action allow-list — each entry is a fully-configured action
 * (e.g. "add the VIP label") the model can choose to fire, never one where
 * the model picks the target itself (see utils/aiActions.js on the backend).
 */
function ActionsSection({ agentId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState([]);
  const [labels, setLabels] = useState([]);
  const [flows, setFlows] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [pickType, setPickType] = useState('');
  const [pickTarget, setPickTarget] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([aiAgentAPI.getActions(agentId), labelAPI.getAll(), flowAPI.getAll(), sequenceAPI.getAll()])
      .then(([actionsRes, labelsRes, flowsRes, sequencesRes]) => {
        setActions(actionsRes.data?.actions || []);
        setLabels(labelsRes.data?.labels || []);
        setFlows(flowsRes.data?.flows || []);
        setSequences(sequencesRes.data?.sequences || []);
        setDirty(false);
      })
      .catch(() => notify.error('Failed to load actions'))
      .finally(() => setLoading(false));
  }, [agentId]);

  const targetsFor = (needs) => (needs === 'label' ? labels : needs === 'flow' ? flows : needs === 'sequence' ? sequences : []);
  const targetName = (needs, id) => targetsFor(needs).find((t) => t.id === id)?.name || '?';

  const addAction = () => {
    if (!pickType) return;
    const needs = ACTION_TYPE_META[pickType].needs;
    if (needs && !pickTarget) return;
    const config = needs === 'label' ? { labelId: Number(pickTarget) } : needs === 'flow' ? { flowId: Number(pickTarget) } : needs === 'sequence' ? { sequenceId: Number(pickTarget) } : {};
    setActions((prev) => [...prev, { id: `new_${Date.now()}`, actionType: pickType, config, enabled: true }]);
    setPickType(''); setPickTarget(''); setDirty(true);
  };

  const toggleAction = (id) => { setActions((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))); setDirty(true); };
  const removeAction = (id) => { setActions((prev) => prev.filter((a) => a.id !== id)); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await aiAgentAPI.saveActions(agentId, { actions: actions.map((a) => ({ actionType: a.actionType, config: a.config, enabled: a.enabled })) });
      notify.success('Actions saved');
      setDirty(false);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to save actions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Loading actions...</div>;

  const needsForPick = pickType ? ACTION_TYPE_META[pickType].needs : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Actions</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 18, maxWidth: 480 }}>
            An explicit allow-list — the Agent can only ever do exactly what's configured here, never anything it invents on its own.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save actions'}
        </button>
      </div>

      {actions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 16 }}>
          No actions allowed yet — this Agent can only reply with text.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {actions.map((a) => {
            const meta = ACTION_TYPE_META[a.actionType] || {};
            const targetLabel = meta.needs ? targetName(meta.needs, a.config?.[`${meta.needs}Id`]) : null;
            return (
              <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', opacity: a.enabled ? 1 : 0.55 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${meta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {meta.Icon && <meta.Icon size={14} color={meta.color} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{meta.label}</div>
                  {targetLabel && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{targetLabel}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => toggleAction(a.id)}
                  style={{ width: 32, height: 19, borderRadius: 999, border: 'none', cursor: 'pointer', background: a.enabled ? 'var(--primary)' : '#cbd5e1', position: 'relative', padding: 0, flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: 2, left: a.enabled ? 15 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left .15s' }} />
                </button>
                <button type="button" title="Remove" onClick={() => removeAction(a.id)} style={{ ...iconBtnStyle, color: 'var(--danger)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>Add an action</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-input" value={pickType} onChange={(e) => { setPickType(e.target.value); setPickTarget(''); }}>
            <option value="">Choose an action type...</option>
            {Object.entries(ACTION_TYPE_META).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
          </select>
          {needsForPick && (
            <select className="form-input" value={pickTarget} onChange={(e) => setPickTarget(e.target.value)}>
              <option value="">Select {needsForPick}...</option>
              {targetsFor(needsForPick).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addAction} disabled={!pickType || (needsForPick && !pickTarget)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

const SOURCE_TYPE_META = {
  text: { label: 'Text', Icon: FileText, color: '#2563eb' },
  url: { label: 'URL', Icon: Link2, color: '#0891b2' },
  file: { label: 'File', Icon: Upload, color: '#7c3aed' },
  google_sheet: { label: 'Google Sheet', Icon: Sheet, color: '#16a34a' },
  image: { label: 'Image', Icon: ImageIcon, color: '#c2410c' },
};

function statusBadge(source) {
  if (source.status === 'indexed') return { Icon: CheckCircle2, color: 'var(--success)', label: `Indexed · ${source.chunk_count} chunk${source.chunk_count === 1 ? '' : 's'}` };
  if (source.status === 'error') return { Icon: AlertTriangle, color: 'var(--warning)', label: source.error_message || 'Needs attention' };
  return { Icon: Clock, color: 'var(--text-muted)', label: 'Pending' };
}

/**
 * Text / URL / File sources — chunked + embedded on the backend
 * (utils/aiKnowledge.js) the moment they're added. Google Sheet and Image
 * sources are recognized but not implemented yet (see routes/aiKnowledge.js) —
 * shown as coming soon rather than offered and silently failing.
 */
function KnowledgeBaseSection({ agentId }) {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState([]);
  const [addMode, setAddMode] = useState(null); // 'text' | 'url' | 'file' | null
  const [submitting, setSubmitting] = useState(false);
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Google Sheet picker state — mirrors UserInputFlowStartProperties' own
  // spreadsheet/tab picker pattern.
  const [sheetStatus, setSheetStatus] = useState(null);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [selectedTab, setSelectedTab] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    aiAgentAPI.getKnowledge(agentId)
      .then((res) => setSources(res.data?.sources || []))
      .catch(() => notify.error('Failed to load knowledge sources'))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const handleAddText = async () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    setSubmitting(true);
    try {
      await aiAgentAPI.addTextKnowledge(agentId, { title: textTitle.trim(), content: textContent.trim() });
      notify.success('Added');
      setTextTitle(''); setTextContent(''); setAddMode(null);
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlValue.trim()) return;
    setSubmitting(true);
    try {
      await aiAgentAPI.addUrlKnowledge(agentId, { url: urlValue.trim() });
      notify.success('Added');
      setUrlValue(''); setAddMode(null);
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to fetch/index that URL');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await aiAgentAPI.addFileKnowledge(agentId, formData);
      notify.success('Added');
      setAddMode(null);
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to process that file');
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await aiAgentAPI.addImageKnowledge(agentId, formData);
      notify.success('Added');
      setAddMode(null);
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to describe that image');
    } finally {
      setSubmitting(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const openSheetPicker = () => {
    setAddMode('google_sheet');
    if (sheetStatus) return; // already loaded
    googleSheetsAPI.getStatus().then((r) => setSheetStatus(r.data)).catch(() => setSheetStatus({ connected: false }));
  };

  useEffect(() => {
    if (!sheetStatus?.connected) return;
    googleSheetsAPI.listSpreadsheets().then((r) => setSpreadsheets(r.data?.spreadsheets || [])).catch(() => setSpreadsheets([]));
  }, [sheetStatus?.connected]);

  useEffect(() => {
    if (!selectedSheetId || !sheetStatus?.connected) { setTabs([]); return; }
    googleSheetsAPI.listTabs(selectedSheetId).then((r) => setTabs(r.data?.tabs || [])).catch(() => setTabs([]));
  }, [selectedSheetId, sheetStatus?.connected]);

  const handleAddSheet = async () => {
    if (!selectedSheetId || !selectedTab) return;
    setSubmitting(true);
    try {
      const sheetTitle = spreadsheets.find((s) => s.id === selectedSheetId)?.name;
      await aiAgentAPI.addGoogleSheetKnowledge(agentId, { spreadsheetId: selectedSheetId, sheetName: selectedTab, title: sheetTitle ? `${sheetTitle} — ${selectedTab}` : selectedTab });
      notify.success('Added');
      setSelectedSheetId(''); setSelectedTab(''); setAddMode(null);
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to read that sheet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReindex = async (sourceId) => {
    try {
      await aiAgentAPI.reindexKnowledge(agentId, sourceId);
      notify.success('Re-indexed');
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Re-index failed');
    }
  };

  const handleDelete = async (source) => {
    if (!window.confirm(`Remove "${source.title}"?`)) return;
    try {
      await aiAgentAPI.deleteKnowledge(agentId, source.id);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } catch {
      notify.error('Failed to remove');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Knowledge Base</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 18, maxWidth: 480 }}>
            What this Agent can reference when answering — only the most relevant pieces are pulled in per reply, not the whole document.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" className={`btn btn-sm ${addMode === 'text' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAddMode(addMode === 'text' ? null : 'text')}>
          <FileText size={13} /> Add Text
        </button>
        <button type="button" className={`btn btn-sm ${addMode === 'url' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAddMode(addMode === 'url' ? null : 'url')}>
          <Link2 size={13} /> Add URL
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
          <Upload size={13} /> Upload File
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()} disabled={submitting}>
          <ImageIcon size={13} /> Upload Image
        </button>
        <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif" style={{ display: 'none' }} onChange={handleImageChange} />
        <button type="button" className={`btn btn-sm ${addMode === 'google_sheet' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => (addMode === 'google_sheet' ? setAddMode(null) : openSheetPicker())}>
          <Sheet size={13} /> Add Google Sheet
        </button>
      </div>

      {addMode === 'text' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Title</label>
            <input className="form-input" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="e.g. Return Policy" />
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Content</label>
            <textarea className="form-input" rows={6} value={textContent} onChange={(e) => setTextContent(e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} placeholder="Paste the text this Agent should know..." />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddText} disabled={submitting || !textTitle.trim() || !textContent.trim()}>
              {submitting ? <Loader2 size={13} className="animate-spin" /> : 'Add & Index'}
            </button>
          </div>
        </div>
      )}

      {addMode === 'url' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Website or page URL</label>
            <input className="form-input" value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://example.com/faq" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddUrl} disabled={submitting || !urlValue.trim()}>
              {submitting ? <Loader2 size={13} className="animate-spin" /> : 'Fetch & Index'}
            </button>
          </div>
        </div>
      )}

      {addMode === 'google_sheet' && (
        <div className="card" style={{ marginBottom: 16 }}>
          {!sheetStatus ? (
            <span className="fb-hint" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Checking connection...</span>
          ) : !sheetStatus.connected ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              No Google account connected yet.{' '}
              <a href="/settings/google-sheets" style={{ color: 'var(--primary)', fontWeight: 700 }}>Connect one in Settings</a>{' '}
              to index a sheet here.
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label">Spreadsheet</label>
                <select className="form-input" value={selectedSheetId} onChange={(e) => { setSelectedSheetId(e.target.value); setSelectedTab(''); }}>
                  <option value="">Select a spreadsheet...</option>
                  {spreadsheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {selectedSheetId && (
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Tab</label>
                  <select className="form-input" value={selectedTab} onChange={(e) => setSelectedTab(e.target.value)}>
                    <option value="">Select a tab...</option>
                    {tabs.map((t) => <option key={t.id} value={t.title}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode(null)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddSheet} disabled={submitting || !selectedSheetId || !selectedTab}>
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : 'Read & Index'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Loading...</div>
      ) : sources.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)', fontSize: 12.5 }}>
          No knowledge sources yet — add some text, a URL, or upload a PDF/DOCX above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sources.map((s) => {
            const typeMeta = SOURCE_TYPE_META[s.type] || SOURCE_TYPE_META.text;
            const badge = statusBadge(s);
            return (
              <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${typeMeta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <typeMeta.Icon size={14} color={typeMeta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: badge.color, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <badge.Icon size={11} /> {badge.label}
                  </div>
                </div>
                {s.status === 'error' && (
                  <button type="button" title="Re-index" onClick={() => handleReindex(s.id)} style={iconBtnStyle}>
                    <RefreshCw size={13} />
                  </button>
                )}
                <button type="button" title="Remove" onClick={() => handleDelete(s)} style={{ ...iconBtnStyle, color: 'var(--danger)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
