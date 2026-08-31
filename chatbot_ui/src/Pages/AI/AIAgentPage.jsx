import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { aiAPI } from '../../services/api';
import {
  Sparkles,
  BookOpen,
  Sliders,
  Send,
  Plus,
  Trash2,
  Globe,
  FileText,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Bot,
  User,
  Zap,
  ArrowRight,
  Shield,
  Layers,
  X,
  Check,
  Cpu,
  Info,
  CornerDownLeft,
} from 'lucide-react';

export default function AIAgentPage() {
  const [activeTab, setActiveTab] = useState('PLAYGROUND'); // 'PLAYGROUND' | 'KNOWLEDGE' | 'SETTINGS'
  const [agent, setAgent] = useState(null);
  const [stats, setStats] = useState({ totalSources: 0, totalChunks: 0, totalQueries: 0 });
  const [knowledgeSources, setKnowledgeSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [toast, setToast] = useState(null);

  // Playground Chat State
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hello! I am your AI Business Assistant trained on your Knowledge Base. Ask me any question about your products, pricing, or policies to test my responses!",
      sources: [],
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [lastRetrievedSources, setLastRetrievedSources] = useState([]);
  const chatBottomRef = useRef(null);

  // Modals for Adding Knowledge
  const [modalType, setModalType] = useState(null); // 'TEXT' | 'FAQ' | 'URL'
  const [textForm, setTextForm] = useState({ title: '', content: '' });
  const [faqForm, setFaqForm] = useState({ question: '', answer: '' });
  const [urlForm, setUrlForm] = useState({ url: '', title: '' });
  const [addingKnowledge, setAddingKnowledge] = useState(false);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    systemPrompt: '',
    provider: 'OPENAI',
    modelName: 'gpt-4o-mini',
    apiKey: '',
    temperature: 0.7,
    isActive: true,
    fallbackEnabled: true,
    humanHandoverKeywords: '',
    handoverMessage: '',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadAIData();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadAIData = async () => {
    setLoading(true);
    try {
      const [agentRes, knowRes] = await Promise.all([
        aiAPI.getAgent(),
        aiAPI.getKnowledge(),
      ]);

      const ag = agentRes.data?.agent;
      setAgent(ag);
      setStats(agentRes.data?.stats || { totalSources: 0, totalChunks: 0, totalQueries: 0 });
      setKnowledgeSources(knowRes.data?.sources || []);

      if (ag) {
        setSettingsForm({
          name: ag.name || 'Nexa AI Assistant',
          systemPrompt: ag.system_prompt || '',
          provider: ag.provider || 'OPENAI',
          modelName: ag.model_name || 'gpt-4o-mini',
          apiKey: ag.api_key || '',
          temperature: Number(ag.temperature) || 0.7,
          isActive: Boolean(ag.is_active),
          fallbackEnabled: Boolean(ag.fallback_enabled),
          humanHandoverKeywords: ag.human_handover_keywords || 'human, agent, representative',
          handoverMessage: ag.handover_message || 'I will connect you with a live human representative right away.',
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load AI settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || generating) return;

    const userText = chatInput.trim();
    setChatInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setGenerating(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.text }));
      const res = await aiAPI.testChat({ query: userText, conversationHistory: history });

      const reply = res.data?.reply || "I didn't quite catch that. Could you clarify?";
      const sources = res.data?.sourcesUsed || [];

      setMessages((prev) => [...prev, { role: 'assistant', text: reply, sources, isHandover: res.data?.isHandover }]);
      setLastRetrievedSources(sources);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Error: Failed to generate AI response. Please check server logs.' },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await aiAPI.updateAgent(settingsForm);
      showToast('AI Agent configuration updated successfully!');
      loadAIData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddTextKnowledge = async (e) => {
    e.preventDefault();
    setAddingKnowledge(true);
    try {
      await aiAPI.addTextKnowledge(textForm);
      showToast(`Document "${textForm.title}" indexed!`);
      setModalType(null);
      setTextForm({ title: '', content: '' });
      loadAIData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to index text', 'error');
    } finally {
      setAddingKnowledge(false);
    }
  };

  const handleAddFaqKnowledge = async (e) => {
    e.preventDefault();
    setAddingKnowledge(true);
    try {
      await aiAPI.addFaqKnowledge(faqForm);
      showToast('FAQ pair indexed!');
      setModalType(null);
      setFaqForm({ question: '', answer: '' });
      loadAIData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to index FAQ', 'error');
    } finally {
      setAddingKnowledge(false);
    }
  };

  const handleAddUrlKnowledge = async (e) => {
    e.preventDefault();
    setAddingKnowledge(true);
    try {
      const res = await aiAPI.addUrlKnowledge(urlForm);
      showToast(res.data?.message || 'Website indexed!');
      setModalType(null);
      setUrlForm({ url: '', title: '' });
      loadAIData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to scrape URL', 'error');
    } finally {
      setAddingKnowledge(false);
    }
  };

  const handleDeleteKnowledge = async (id) => {
    if (!window.confirm('Are you sure you want to delete this knowledge source?')) return;
    try {
      await aiAPI.deleteKnowledge(id);
      showToast('Knowledge source deleted');
      loadAIData();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete source', 'error');
    }
  };

  return (
    <AppLayout>
      <div className="ai-agent-page" style={{ width: '100%', padding: '14px 18px' }}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              zIndex: 99999,
              padding: '12px 20px',
              borderRadius: 10,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.84rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Page Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
                <Sparkles size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Autonomous AI Agent & Knowledge Base Studio
              </h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0 0' }}>
              Train an intelligent AI support agent on your website, PDFs, and FAQs with automatic smart fallback in chat.
            </p>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.76rem' }}>
              <BookOpen size={14} color="#2563eb" />
              <span style={{ color: '#64748b' }}>Sources:</span>
              <strong style={{ color: '#0f172a' }}>{stats.totalSources}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.76rem' }}>
              <Layers size={14} color="#8b5cf6" />
              <span style={{ color: '#64748b' }}>Vector Chunks:</span>
              <strong style={{ color: '#0f172a' }}>{stats.totalChunks}</strong>
            </div>

            <button
              type="button"
              onClick={loadAIData}
              disabled={loading}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 18 }}>
          {[
            { id: 'PLAYGROUND', label: '🧪 AI Playground & Live Simulator', icon: Sparkles },
            { id: 'KNOWLEDGE', label: `📚 Knowledge Base Sources (${knowledgeSources.length})`, icon: BookOpen },
            { id: 'SETTINGS', label: '⚙️ AI Persona & Model Settings', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: active ? 800 : 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#2563eb' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1: INTERACTIVE AI PLAYGROUND & CONTEXT RETRIEVAL INSPECTOR
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'PLAYGROUND' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
            {/* Left Column: Live Chat Playground */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 230px)', minHeight: 520, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
              {/* Chat Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
                      {settingsForm.name || 'AI Assistant'}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>
                      ● Online • Model: {settingsForm.modelName}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMessages([{ role: 'assistant', text: "Chat reset! How can I help you?", sources: [] }])}
                  style={{ padding: '4px 10px', borderRadius: 6, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.72rem', color: '#64748b', cursor: 'pointer' }}
                >
                  Clear Chat
                </button>
              </div>

              {/* Message List */}
              <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, background: '#fafbfe' }}>
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        alignSelf: isUser ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          background: isUser ? '#2563eb' : '#ffffff',
                          color: isUser ? '#ffffff' : '#0f172a',
                          border: isUser ? 'none' : '1px solid #e2e8f0',
                          fontSize: '0.82rem',
                          lineHeight: 1.45,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {msg.text}
                      </div>

                      {/* Attached Knowledge Sources Pills */}
                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {msg.sources.map((s, sIdx) => (
                            <span
                              key={sIdx}
                              style={{
                                fontSize: '0.66rem',
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #dbeafe',
                              }}
                            >
                              📖 {s.title}
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.isHandover && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                          🚨 Human Handover Triggered
                        </span>
                      )}
                    </div>
                  );
                })}
                {generating && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.76rem', padding: '6px 10px', background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', width: 'fit-content' }}>
                    <Sparkles size={13} className="animate-spin" color="#2563eb" /> AI is reasoning & retrieving knowledge context...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendTestMessage} style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, background: '#ffffff' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  placeholder="Ask a customer question (e.g. 'What is your refund policy?')..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={generating}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || generating}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    cursor: !chatInput.trim() || generating ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                  }}
                >
                  <Send size={13} /> Send
                </button>
              </form>
            </div>

            {/* Right Column: Live Context & Vector Inspector */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, height: 'calc(100vh - 230px)', minHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={16} color="#8b5cf6" /> Live RAG Context Inspector
                </h4>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '3px 0 0 0' }}>
                  Semantic vector chunks retrieved from your Knowledge Base for the latest query.
                </p>
              </div>

              {lastRetrievedSources.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
                  <BookOpen size={32} style={{ marginBottom: 8, opacity: 0.6 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b' }}>No Context Retrieved Yet</span>
                  <p style={{ fontSize: '0.72rem', maxWidth: 240, margin: '4px 0 0 0' }}>
                    Type a question in the chat playground to see the exact knowledge chunks the AI retrieves to answer.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lastRetrievedSources.map((src, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid #dbeafe',
                        background: '#eff6ff30',
                        fontSize: '0.74rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ color: '#1e40af' }}>Source #{idx + 1}: {src.title}</strong>
                        <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#2563eb', color: '#ffffff' }}>
                          Score: {src.score}
                        </span>
                      </div>
                      <p style={{ color: '#334155', margin: 0, lineHeight: 1.35, fontStyle: 'italic' }}>
                        "{src.snippet}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2: KNOWLEDGE BASE SOURCES MANAGER
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'KNOWLEDGE' && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            {/* Header & Add Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Knowledge Base Content ({knowledgeSources.length} sources)
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Index documents, website URLs, and FAQs. Content is automatically split into semantic chunks for real-time RAG answers.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setModalType('URL')}
                  style={{ padding: '7px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Globe size={14} /> + Scrape Website URL
                </button>

                <button
                  type="button"
                  onClick={() => setModalType('FAQ')}
                  style={{ padding: '7px 12px', borderRadius: 8, background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <HelpCircle size={14} /> + Add FAQ Pair
                </button>

                <button
                  type="button"
                  onClick={() => setModalType('TEXT')}
                  style={{ padding: '7px 14px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}
                >
                  <Plus size={14} /> + Add Text Document
                </button>
              </div>
            </div>

            {/* Knowledge Sources Table */}
            {knowledgeSources.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                <BookOpen size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                <h4 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
                  No Knowledge Sources Added
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: 380, margin: '0 auto 16px' }}>
                  Add your company website URL, FAQ pairs, or text documents to train your autonomous AI agent.
                </p>
                <button
                  type="button"
                  onClick={() => setModalType('TEXT')}
                  className="btn btn-primary btn-sm"
                >
                  Add First Knowledge Source
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Type</th>
                      <th style={{ padding: '10px 12px' }}>Title / Source</th>
                      <th style={{ padding: '10px 12px' }}>Indexed Chunks</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Created</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knowledgeSources.map((src) => (
                      <tr key={src.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: src.source_type === 'URL' ? '#eff6ff' : (src.source_type === 'FAQ' ? '#faf5ff' : '#f1f5f9'), color: src.source_type === 'URL' ? '#2563eb' : (src.source_type === 'FAQ' ? '#9333ea' : '#475569') }}>
                            {src.source_type}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>
                          <div>{src.title}</div>
                          {src.source_url && (
                            <a href={src.source_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#2563eb', textDecoration: 'none' }}>
                              {src.source_url}
                            </a>
                          )}
                        </td>
                        <td style={{ padding: '12px', color: '#64748b' }}>
                          <strong style={{ color: '#0f172a' }}>{src.total_chunks}</strong> chunks
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#10b98120', color: '#059669' }}>
                            {src.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: '#94a3b8' }}>
                          {new Date(src.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteKnowledge(src.id)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '0.72rem' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3: AI PERSONA & MODEL SETTINGS
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'SETTINGS' && (
          <form onSubmit={handleSaveSettings} style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, maxWidth: 840, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={16} color="#2563eb" /> AI Agent Persona & Fallback Configuration
              </h3>
              <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Control the LLM provider, personality, system instructions, and human handover rules.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  AI Assistant Name
                </label>
                <input
                  type="text"
                  required
                  className="form-input w-full"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  LLM Model
                </label>
                <select
                  className="form-input w-full"
                  value={settingsForm.modelName}
                  onChange={(e) => setSettingsForm({ ...settingsForm, modelName: e.target.value })}
                >
                  <option value="gpt-4o-mini">OpenAI GPT-4o-mini (Fast & Cost Effective)</option>
                  <option value="gpt-4o">OpenAI GPT-4o (High Intelligence)</option>
                  <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Ultra Fast)</option>
                  <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                System Prompt (Personality & Instructions)
              </label>
              <textarea
                rows={5}
                required
                className="form-input w-full"
                value={settingsForm.systemPrompt}
                onChange={(e) => setSettingsForm({ ...settingsForm, systemPrompt: e.target.value })}
                style={{ fontSize: '0.8rem', lineHeight: 1.45 }}
              />
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Define how the agent should behave, tone of voice, and guidelines when talking to your customers.
              </span>
            </div>

            {/* Human Handover Configuration */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={15} color="#dc2626" /> Human Handover Rules
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>
                  Handover Trigger Keywords (comma separated)
                </label>
                <input
                  type="text"
                  className="form-input w-full"
                  placeholder="human, agent, representative, live support"
                  value={settingsForm.humanHandoverKeywords}
                  onChange={(e) => setSettingsForm({ ...settingsForm, humanHandoverKeywords: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>
                  Handover Confirmation Message to Customer
                </label>
                <input
                  type="text"
                  className="form-input w-full"
                  value={settingsForm.handoverMessage}
                  onChange={(e) => setSettingsForm({ ...settingsForm, handoverMessage: e.target.value })}
                />
              </div>
            </div>

            {/* Fallback & Active Toggles */}
            <div style={{ display: 'flex', gap: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settingsForm.fallbackEnabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, fallbackEnabled: e.target.checked })}
                />
                Enable Smart Fallback (AI auto-replies when no visual bot flow matches)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settingsForm.isActive}
                  onChange={(e) => setSettingsForm({ ...settingsForm, isActive: e.target.checked })}
                />
                AI Agent Active
              </label>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <button
                type="submit"
                disabled={savingSettings}
                style={{
                  padding: '9px 24px',
                  borderRadius: 8,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: savingSettings ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
              >
                {savingSettings ? 'Saving Settings...' : 'Save AI Configuration'}
              </button>
            </div>
          </form>
        )}

        {/* ─── MODAL 1: ADD TEXT / POLICY DOCUMENT ─── */}
        {modalType === 'TEXT' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 560, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color="#2563eb" />
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Add Text / Policy Document
                  </h3>
                </div>
                <button type="button" onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <form onSubmit={handleAddTextKnowledge} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Document Title *</label>
                  <input type="text" required className="form-input w-full" placeholder="e.g. Return & Refund Policy" value={textForm.title} onChange={(e) => setTextForm({ ...textForm, title: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Content Text *</label>
                  <textarea rows={8} required className="form-input w-full" placeholder="Paste your policy, company background, product specs, or operating hours here..." value={textForm.content} onChange={(e) => setTextForm({ ...textForm, content: e.target.value })} style={{ fontSize: '0.8rem', lineHeight: 1.45 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '8px 14px', borderRadius: 8, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={addingKnowledge} style={{ padding: '8px 20px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', fontSize: '0.8rem', fontWeight: 800, cursor: addingKnowledge ? 'not-allowed' : 'pointer' }}>
                    {addingKnowledge ? 'Indexing Document...' : 'Index Document'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── MODAL 2: ADD FAQ PAIR ─── */}
        {modalType === 'FAQ' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HelpCircle size={16} color="#7c3aed" />
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Add Frequently Asked Question (FAQ)
                  </h3>
                </div>
                <button type="button" onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <form onSubmit={handleAddFaqKnowledge} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Customer Question *</label>
                  <input type="text" required className="form-input w-full" placeholder="e.g. Do you offer international shipping?" value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Accurate Answer *</label>
                  <textarea rows={5} required className="form-input w-full" placeholder="Yes! We ship worldwide with 3-5 business day delivery..." value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} style={{ fontSize: '0.8rem', lineHeight: 1.45 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '8px 14px', borderRadius: 8, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={addingKnowledge} style={{ padding: '8px 20px', borderRadius: 8, background: '#7c3aed', color: '#ffffff', border: 'none', fontSize: '0.8rem', fontWeight: 800, cursor: addingKnowledge ? 'not-allowed' : 'pointer' }}>
                    {addingKnowledge ? 'Indexing FAQ...' : 'Index FAQ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── MODAL 3: SCRAPE & INDEX WEBSITE URL ─── */}
        {modalType === 'URL' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={16} color="#2563eb" />
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Scrape & Index Website URL
                  </h3>
                </div>
                <button type="button" onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <form onSubmit={handleAddUrlKnowledge} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Website Page URL *</label>
                  <input type="url" required className="form-input w-full" placeholder="https://yourcompany.com/about" value={urlForm.url} onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Custom Title (optional)</label>
                  <input type="text" className="form-input w-full" placeholder="e.g. About Our Company" value={urlForm.title} onChange={(e) => setUrlForm({ ...urlForm, title: e.target.value })} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '8px 14px', borderRadius: 8, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={addingKnowledge} style={{ padding: '8px 20px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', fontSize: '0.8rem', fontWeight: 800, cursor: addingKnowledge ? 'not-allowed' : 'pointer' }}>
                    {addingKnowledge ? 'Scraping & Indexing...' : 'Scrape & Index URL'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
