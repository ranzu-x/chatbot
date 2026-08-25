import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '../../Components/Sidebar';
import { conversationAPI, uploadAPI, cannedResponseAPI, contactAPI, flowAPI, agencyAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import io from 'socket.io-client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPlatformIcon(platform) {
  const map = { WHATSAPP: '📱', FACEBOOK: '📘', INSTAGRAM: '📸', TELEGRAM: '✈️', WEBCHAT: '🌐' };
  return map[platform] || '💬';
}

function getPlatformClass(platform) {
  const map = { WHATSAPP: 'platform-wa', FACEBOOK: 'platform-fb', INSTAGRAM: 'platform-ig', TELEGRAM: 'platform-tg', WEBCHAT: 'platform-wc' };
  return map[platform] || '';
}

function getPlatformBadgeClass(platform) {
  const map = { WHATSAPP: 'badge-wa', FACEBOOK: 'badge-fb', INSTAGRAM: 'badge-ig', TELEGRAM: 'badge-tg', WEBCHAT: 'badge-wc' };
  return map[platform] || 'badge-muted';
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const STATUS_CHIPS = ['All', 'OPEN', 'PENDING', 'RESOLVED'];
const PLATFORM_CHIPS = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'WEBCHAT'];

export default function InboxPage() {
  const { user } = useAuth();
  
  // Layout toggles
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('inbox_sidebar_visible');
    return saved !== null ? saved === 'true' : true;
  });
  const [showSubscriberPanel, setShowSubscriberPanel] = useState(true);

  // Conversations & Messages
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState('');
  const [search, setSearch] = useState('');

  // Subscriber Details & Controls State
  const [contactTags, setContactTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [contactNotes, setContactNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [botPaused, setBotPaused] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [activeFlow, setActiveFlow] = useState(null);
  const [availableFlows, setAvailableFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [triggeringFlow, setTriggeringFlow] = useState(false);
  const [agentsList, setAgentsList] = useState([]);
  const [assigningAgent, setAssigningAgent] = useState(false);

  // Canned Responses State
  const [cannedResponses, setCannedResponses] = useState([]);
  const [showCannedModal, setShowCannedModal] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedId = selectedConv?._id || selectedConv?.id;
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const toggleSidebar = () => {
    setSidebarVisible((prev) => {
      const next = !prev;
      localStorage.setItem('inbox_sidebar_visible', String(next));
      return next;
    });
  };

  // Load Canned Responses, Flows & Agents
  useEffect(() => {
    cannedResponseAPI.getAll().then((res) => setCannedResponses(res.data.cannedResponses || [])).catch(() => {});
    flowAPI.getAll().then((res) => setAvailableFlows(res.data.flows || [])).catch(() => {});
    if (agencyAPI?.getAgents) {
      agencyAPI.getAgents().then((res) => setAgentsList(res.data.agents || [])).catch(() => {});
    }
  }, []);

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter !== 'All') params.status = statusFilter;
      if (platformFilter) params.platform = platformFilter;
      const res = await conversationAPI.getAll(params);
      setConversations(res.data.conversations || res.data || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setConvLoading(false);
    }
  }, [statusFilter, platformFilter]);

  useEffect(() => {
    setConvLoading(true);
    loadConversations();
  }, [loadConversations]);

  // ── Load messages and subscriber info ───────────────────────────────────────
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    setMsgLoading(true);
    try {
      const res = await conversationAPI.getOne(convId);
      const data = res.data;
      setMessages(data.messages || []);
      const conv = data.conversation || data;
      setSelectedConv(conv);
      setBotPaused(Boolean(conv.bot_paused || conv.botPaused || conv.contactBotPaused));
      setContactTags(conv.contactTags || []);
      setContactNotes(data.notes || []);
      setActiveFlow(data.activeFlow || null);
    } catch (err) {
      console.error('Failed to load conversation details', err);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  // ── Select conversation ─────────────────────────────────────────────────────
  const selectConversation = (conv) => {
    setSelectedConv(conv);
    setMessages([]);
    loadMessages(conv._id || conv.id);
  };

  // ── Web Audio Chime Helper ──────────────────────────────────────────────────
  const playNotificationChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio autoplay policy
    }
  };

  // ── Socket.io Connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const socketUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
      : 'http://localhost:5000';

    const socket = io(import.meta.env.VITE_SOCKET_URL || socketUrl, {
      auth: {
        agencyId: user.agencyId,
        userId: user.id,
        role: user.role,
      },
      transports: ['websocket', 'polling'],
    });

    socket.on('new_message', (data) => {
      if (data.message?.direction?.toUpperCase() === 'INBOUND') {
        playNotificationChime();
      }
      if (data.conversationId === selectedIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => (m._id || m.id) === (data.message._id || data.message.id))) return prev;
          return [...prev, data.message];
        });
      }
      loadConversations();
    });

    socket.on('conversation_updated', (data) => {
      loadConversations();
      if (selectedIdRef.current === data.conversationId) {
        setSelectedConv((prev) => (prev ? { ...prev, ...data } : prev));
        if (data.botPaused !== undefined) setBotPaused(data.botPaused);
      }
    });

    socket.on('new_conversation', () => {
      playNotificationChime();
      loadConversations();
    });

    return () => {
      socket.disconnect();
    };
  }, [user, loadConversations]);

  // ── Auto-scroll to bottom on new messages ──────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const body = messageText.trim();
    if (!body || !selectedConv || sending) return;
    const convId = selectedConv._id || selectedConv.id;
    setSending(true);
    setMessageText('');
    try {
      await conversationAPI.sendMessage(convId, { body });
      await loadMessages(convId);
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || uploading) return;
    const convId = selectedConv._id || selectedConv.id;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await uploadAPI.uploadFile(formData);

      const { url, type, filename } = uploadRes.data;
      let msgType = 'DOCUMENT';
      if (file.type.startsWith('image/')) msgType = 'IMAGE';
      else if (file.type.startsWith('video/')) msgType = 'VIDEO';
      else if (file.type.startsWith('audio/')) msgType = 'AUDIO';

      await conversationAPI.sendMessage(convId, {
        body: filename || file.name,
        type: msgType,
        mediaUrl: url,
      });
      await loadMessages(convId);
    } catch (err) {
      console.error('Failed to upload file', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Toggle Bot Pause / Resume ───────────────────────────────────────────────
  const handleToggleBot = async () => {
    if (!selectedConv || togglingBot) return;
    const convId = selectedConv._id || selectedConv.id;
    setTogglingBot(true);
    try {
      const res = await conversationAPI.toggleBot(convId);
      setBotPaused(res.data.botPaused);
      setSelectedConv((prev) => ({ ...prev, bot_paused: res.data.botPaused ? 1 : 0 }));
    } catch (err) {
      console.error('Failed to toggle bot', err);
    } finally {
      setTogglingBot(false);
    }
  };

  // ── Trigger Flow Manually ───────────────────────────────────────────────────
  const handleTriggerFlow = async () => {
    if (!selectedConv || !selectedFlowId || triggeringFlow) return;
    const convId = selectedConv._id || selectedConv.id;
    setTriggeringFlow(true);
    try {
      await conversationAPI.triggerFlow(convId, selectedFlowId);
      await loadMessages(convId);
      setSelectedFlowId('');
    } catch (err) {
      console.error('Failed to trigger flow', err);
    } finally {
      setTriggeringFlow(false);
    }
  };

  // ── Assign Agent ────────────────────────────────────────────────────────────
  const handleAssignAgent = async (agentProfileId) => {
    if (!selectedConv || assigningAgent) return;
    const convId = selectedConv._id || selectedConv.id;
    setAssigningAgent(true);
    try {
      await conversationAPI.assign(convId, agentProfileId || null);
      await loadMessages(convId);
    } catch (err) {
      console.error('Failed to assign agent', err);
    } finally {
      setAssigningAgent(false);
    }
  };

  // ── Tags Management ─────────────────────────────────────────────────────────
  const handleAddTag = async (e) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (!tag || !selectedConv || addingTag) return;
    const contactId = selectedConv.contact_id || selectedConv.contactId || selectedConv.contact?.id;
    if (!contactId) return;
    setAddingTag(true);
    try {
      const res = await contactAPI.addTag(contactId, tag);
      setContactTags(res.data.tags || []);
      setNewTagInput('');
    } catch (err) {
      console.error('Failed to add tag', err);
    } finally {
      setAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagToRemove) => {
    if (!selectedConv) return;
    const contactId = selectedConv.contact_id || selectedConv.contactId || selectedConv.contact?.id;
    if (!contactId) return;
    try {
      const res = await contactAPI.removeTag(contactId, tagToRemove);
      setContactTags(res.data.tags || []);
    } catch (err) {
      console.error('Failed to remove tag', err);
    }
  };

  // ── Notes Management ────────────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault();
    const note = newNoteText.trim();
    if (!note || !selectedConv || addingNote) return;
    const contactId = selectedConv.contact_id || selectedConv.contactId || selectedConv.contact?.id;
    if (!contactId) return;
    setAddingNote(true);
    try {
      const res = await contactAPI.addNote(contactId, note);
      setContactNotes((prev) => [res.data.note, ...prev]);
      setNewNoteText('');
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!selectedConv) return;
    const contactId = selectedConv.contact_id || selectedConv.contactId || selectedConv.contact?.id;
    if (!contactId) return;
    try {
      await contactAPI.deleteNote(contactId, noteId);
      setContactNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  // ── Resolve conversation ────────────────────────────────────────────────────
  const handleResolve = async () => {
    if (!selectedConv) return;
    const convId = selectedConv._id || selectedConv.id;
    try {
      await conversationAPI.updateStatus(convId, 'RESOLVED');
      setSelectedConv((prev) => ({ ...prev, status: 'RESOLVED' }));
      setConversations((prev) =>
        prev.map((c) => ((c._id === convId || c.id === convId) ? { ...c, status: 'RESOLVED' } : c))
      );
    } catch (err) {
      console.error(err);
    }
  };

  // ── Filtered conversations ──────────────────────────────────────────────────
  const filteredConversations = conversations.filter((c) => {
    const name = c.contact?.name || c.contactName || '';
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const contactName = selectedConv?.contact?.name || selectedConv?.contactName || 'Subscriber';
  const contactPhone = selectedConv?.contactPhone || selectedConv?.phone || '—';
  const contactEmail = selectedConv?.contactEmail || selectedConv?.email || '—';
  const contactPlatform = selectedConv?.platform || selectedConv?.contactPlatform || 'FACEBOOK';
  const contactExternalId = selectedConv?.contactExternalId || selectedConv?.external_id || '—';

  return (
    <div className={`inbox-page-wrapper ${sidebarVisible ? 'with-sidebar' : 'no-sidebar'}`}>
      {/* ── Collapsible Main Navigation Sidebar ── */}
      {sidebarVisible && <Sidebar />}

      <div className="inbox-layout">
        {/* ── 1. Conversation List Column ── */}
        <aside className="conversation-list">
          <div className="conversation-list-header">
            <div className="conversation-list-title">
              <div className="flex items-center gap-2">
                {/* Sidebar Collapse Toggle Button */}
                <button
                  type="button"
                  className="sidebar-collapse-btn"
                  onClick={toggleSidebar}
                  title={sidebarVisible ? 'Hide main navigation menu' : 'Show main navigation menu'}
                  style={!sidebarVisible ? { width: 'auto', padding: '0 10px', gap: 6, fontSize: '0.8rem', fontWeight: 600 } : {}}
                >
                  {sidebarVisible ? '◀' : '▶ ☰ Menu'}
                </button>
                <span>Live Chat 💬</span>
              </div>
              {!sidebarVisible && (
                <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  Full View
                </span>
              )}
            </div>

            {/* Status filters */}
            <div className="filter-bar">
              {STATUS_CHIPS.map((s) => (
                <button
                  key={s}
                  className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'All' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Platform filters */}
            <div className="filter-bar">
              <button
                className={`filter-chip ${platformFilter === '' ? 'active' : ''}`}
                onClick={() => setPlatformFilter('')}
              >
                All
              </button>
              {PLATFORM_CHIPS.map((p) => (
                <button
                  key={p}
                  className={`filter-chip ${platformFilter === p ? 'active' : ''}`}
                  onClick={() => setPlatformFilter(p)}
                >
                  {getPlatformIcon(p)} {p.slice(0, 4)}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              className="form-input"
              placeholder="🔍 Search subscribers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <div className="conversation-list-body">
            {convLoading ? (
              <div className="loading-overlay">
                <div className="loading-spinner" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-icon">💬</div>
                <div className="empty-title">No conversations</div>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const id = conv._id || conv.id;
                const name = conv.contact?.name || conv.contactName || 'Unknown';
                const preview = conv.lastMessage?.body || conv.lastMessageBody || '…';
                const time =
                  conv.lastMessageTime ||
                  conv.last_message_at ||
                  conv.lastMessage?.createdAt ||
                  conv.updated_at ||
                  conv.created_at;
                const unread = conv.unreadCount || conv.unread_count || 0;
                const platform = conv.platform || 'FACEBOOK';
                const isActive = id === selectedId;

                return (
                  <div
                    key={id}
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => selectConversation(conv)}
                  >
                    <div className="avatar avatar-sm">{getInitials(name)}</div>

                    <div className="conv-info">
                      <div className="conv-name truncate">{name}</div>
                      <div className="conv-preview truncate">{preview}</div>
                    </div>

                    <div className="conv-meta">
                      <span className="conv-time">{formatRelativeTime(time)}</span>
                      <span className={`platform-icon ${getPlatformClass(platform)}`}>
                        {getPlatformIcon(platform)}
                      </span>
                      {unread > 0 && <span className="unread-badge">{unread}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── 2. Full-Screen Chat Area (Middle Column) ── */}
        <main className="chat-area">
          {!selectedConv ? (
            <div className="chat-empty">
              <div style={{ fontSize: '4.5rem', opacity: 0.2 }}>💬</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
                Select a conversation
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Choose a conversation from the left to start live messaging
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="chat-header">
                <div className="avatar">{getInitials(contactName)}</div>
                <div className="chat-header-info">
                  <div className="chat-header-name">{contactName}</div>
                  <div className="chat-header-status">
                    <span className={`badge ${getPlatformBadgeClass(contactPlatform)}`}>
                      {getPlatformIcon(contactPlatform)} {contactPlatform}
                    </span>
                    {botPaused ? (
                      <span className="badge badge-warning">⏸️ Bot Paused</span>
                    ) : (
                      <span className="badge badge-success">🤖 Bot Active</span>
                    )}
                  </div>
                </div>

                <div className="chat-header-actions">
                  {/* Bot Pause Toggle Button */}
                  <button
                    type="button"
                    className={`btn btn-sm ${botPaused ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={handleToggleBot}
                    disabled={togglingBot}
                    title={botPaused ? 'Resume bot auto-replies' : 'Pause bot for human takeover'}
                  >
                    {botPaused ? '▶️ Resume Bot' : '⏸️ Pause Bot'}
                  </button>

                  {/* Resolve Button */}
                  {selectedConv.status !== 'RESOLVED' && (
                    <button className="btn btn-sm btn-success" onClick={handleResolve}>
                      ✅ Resolve
                    </button>
                  )}

                  {/* Toggle Subscriber Panel */}
                  <button
                    type="button"
                    className={`btn btn-sm ${showSubscriberPanel ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowSubscriberPanel(!showSubscriberPanel)}
                    title="Toggle Subscriber Details Panel"
                  >
                    👤 Subscriber Info
                  </button>
                </div>
              </div>

              {/* Messages viewport */}
              <div className="chat-messages">
                {msgLoading ? (
                  <div className="loading-overlay" style={{ flex: 1 }}>
                    <div className="loading-spinner" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-empty">No messages yet. Send a message below! 👋</div>
                ) : (
                  messages.map((msg) => {
                    const isInbound =
                      msg.direction?.toLowerCase() === 'inbound' || msg.type?.toLowerCase() === 'inbound';
                    const rawMediaUrl = msg.media_url || msg.mediaUrl;
                    const backendUrl = import.meta.env.VITE_API_URL
                      ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
                      : 'http://localhost:5000';
                    const fullMediaUrl =
                      rawMediaUrl && !rawMediaUrl.startsWith('http')
                        ? `${backendUrl}${rawMediaUrl}`
                        : rawMediaUrl;
                    const msgType = (msg.type || '').toUpperCase();

                    return (
                      <div
                        key={msg._id || msg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isInbound ? 'flex-start' : 'flex-end',
                        }}
                      >
                        <div className={`message-bubble ${isInbound ? 'inbound' : 'outbound'}`}>
                          {/* Rich Media Previews */}
                          {fullMediaUrl && (
                            <div style={{ marginBottom: 8 }}>
                              {msgType === 'IMAGE' || /\.(jpg|jpeg|png|gif|webp)$/i.test(fullMediaUrl) ? (
                                <img
                                  src={fullMediaUrl}
                                  alt="Attachment"
                                  style={{
                                    maxWidth: 320,
                                    maxHeight: 240,
                                    borderRadius: 10,
                                    objectFit: 'cover',
                                    display: 'block',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => window.open(fullMediaUrl, '_blank')}
                                />
                              ) : msgType === 'VIDEO' || /\.(mp4|webm|mov)$/i.test(fullMediaUrl) ? (
                                <video
                                  controls
                                  src={fullMediaUrl}
                                  style={{ maxWidth: 320, maxHeight: 220, borderRadius: 10 }}
                                />
                              ) : msgType === 'AUDIO' || /\.(mp3|wav|ogg)$/i.test(fullMediaUrl) ? (
                                <audio controls style={{ maxWidth: 260 }} src={fullMediaUrl} />
                              ) : (
                                <a
                                  href={fullMediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 14px',
                                    background: 'rgba(0,0,0,0.12)',
                                    borderRadius: 8,
                                    fontSize: '0.85rem',
                                    color: 'inherit',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                  }}
                                >
                                  📎 Download File Attachment
                                </a>
                              )}
                            </div>
                          )}

                          {msg.body && <div>{msg.body}</div>}
                          <div className="message-time">{formatTime(msg.created_at || msg.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="chat-input-area" style={{ position: 'relative' }}>
                {/* Canned Quick Replies Popover */}
                {showCannedModal && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 20,
                      right: 20,
                      marginBottom: 10,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 16,
                      boxShadow: 'var(--shadow-lg)',
                      zIndex: 100,
                      maxHeight: 280,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>⚡ Quick Replies</span>
                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => setShowCannedModal(false)}
                      >
                        ✕ Close
                      </button>
                    </div>

                    <input
                      className="form-input w-full"
                      placeholder="Search quick replies…"
                      value={cannedSearch}
                      onChange={(e) => setCannedSearch(e.target.value)}
                      style={{ marginBottom: 10, padding: '6px 10px', fontSize: '0.85rem' }}
                    />

                    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {cannedResponses.filter(
                        (c) =>
                          c.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
                          c.body.toLowerCase().includes(cannedSearch.toLowerCase())
                      ).length === 0 ? (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                          No matching quick replies found.
                        </div>
                      ) : (
                        cannedResponses
                          .filter(
                            (c) =>
                              c.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
                              c.body.toLowerCase().includes(cannedSearch.toLowerCase())
                          )
                          .map((item) => (
                            <div
                              key={item.id}
                              style={{
                                padding: '8px 12px',
                                background: 'var(--bg-surface)',
                                borderRadius: 8,
                                cursor: 'pointer',
                                border: '1px solid var(--border)',
                              }}
                              onClick={() => {
                                setMessageText(item.body);
                                setShowCannedModal(false);
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>
                                {item.title}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {item.body}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}

                <div className="chat-input-row" style={{ alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                  />

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      borderRadius: '50%',
                      width: 40,
                      height: 40,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.15rem',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending || selectedConv.status === 'RESOLVED'}
                    title="Upload & Send Image / Video / File"
                  >
                    {uploading ? (
                      <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    ) : (
                      '📎'
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      borderRadius: 20,
                      height: 40,
                      padding: '0 14px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 600,
                    }}
                    onClick={() => setShowCannedModal(!showCannedModal)}
                    disabled={selectedConv.status === 'RESOLVED'}
                    title="Insert Quick Reply"
                  >
                    ⚡ Quick Replies
                  </button>

                  <textarea
                    className="chat-textarea"
                    placeholder="Type a message… (press Enter to send, / for quick replies)"
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      if (e.target.value === '/') setShowCannedModal(true);
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={sending || uploading || selectedConv.status === 'RESOLVED'}
                  />

                  <button
                    className="chat-send-btn"
                    onClick={handleSend}
                    disabled={sending || uploading || !messageText.trim() || selectedConv.status === 'RESOLVED'}
                    title="Send message"
                  >
                    {sending ? (
                      <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    ) : (
                      '➤'
                    )}
                  </button>
                </div>

                {selectedConv.status === 'RESOLVED' && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                    This conversation is resolved. Reopen or send a message to activate.
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* ── 3. Subscriber Info & Metadata Panel (Right Column) ── */}
        {selectedConv && showSubscriberPanel && (
          <aside className="subscriber-panel">
            {/* Header / Avatar */}
            <div className="subscriber-panel-header">
              <div className="avatar" style={{ width: 60, height: 60, fontSize: '1.4rem', margin: '0 auto 10px' }}>
                {getInitials(contactName)}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{contactName}</div>
              <div style={{ marginTop: 4 }}>
                <span className={`badge ${getPlatformBadgeClass(contactPlatform)}`}>
                  {getPlatformIcon(contactPlatform)} {contactPlatform}
                </span>
              </div>
            </div>

            <div className="subscriber-panel-body">
              {/* Profile Details */}
              <div className="subscriber-section">
                <div className="subscriber-section-title">Subscriber Details</div>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Phone: </span>
                    <span style={{ fontWeight: 600 }}>{contactPhone}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Email: </span>
                    <span style={{ fontWeight: 600 }}>{contactEmail}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>External ID: </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{contactExternalId}</span>
                  </div>
                </div>
              </div>

              {/* Bot & Flow Control */}
              <div className="subscriber-section">
                <div className="subscriber-section-title">
                  <span>Bot & Flow Automation</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Bot Status:</span>
                  <span className={`badge ${botPaused ? 'badge-warning' : 'badge-success'}`}>
                    {botPaused ? '⏸️ Bot Paused' : '🤖 Bot Active'}
                  </span>
                </div>

                <button
                  type="button"
                  className={`btn btn-sm ${botPaused ? 'btn-primary' : 'btn-secondary'} w-full`}
                  onClick={handleToggleBot}
                  disabled={togglingBot}
                >
                  {botPaused ? '▶️ Resume Bot Auto-Replies' : '⏸️ Pause Bot (Human Takeover)'}
                </button>

                {/* Trigger Flow Dropdown */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    ⚡ Trigger Bot Flow:
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      className="form-input"
                      style={{ fontSize: '0.82rem', padding: '6px 8px', flex: 1 }}
                      value={selectedFlowId}
                      onChange={(e) => setSelectedFlowId(e.target.value)}
                    >
                      <option value="">— Select Flow —</option>
                      {availableFlows
                        .filter((f) => f.platform === contactPlatform || f.platform === 'FACEBOOK')
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleTriggerFlow}
                      disabled={!selectedFlowId || triggeringFlow}
                    >
                      {triggeringFlow ? '…' : 'Start'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Labels & Tags Section */}
              <div className="subscriber-section">
                <div className="subscriber-section-title">
                  <span>Labels & Tags</span>
                  <span style={{ fontSize: '0.7rem' }}>({contactTags.length})</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
                  {contactTags.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No tags assigned yet</span>
                  ) : (
                    contactTags.map((tag) => (
                      <span key={tag} className="tag-chip">
                        🏷️ {tag}
                        <span
                          className="tag-chip-remove"
                          onClick={() => handleRemoveTag(tag)}
                          title="Remove tag"
                        >
                          ✕
                        </span>
                      </span>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddTag} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input
                    className="form-input"
                    placeholder="Add label (e.g. VIP, Lead)…"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    style={{ fontSize: '0.82rem', padding: '6px 10px', flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="btn btn-sm btn-secondary"
                    disabled={addingTag || !newTagInput.trim()}
                  >
                    + Add
                  </button>
                </form>
              </div>

              {/* Internal Notes Section */}
              <div className="subscriber-section">
                <div className="subscriber-section-title">
                  <span>Internal Staff Notes</span>
                  <span style={{ fontSize: '0.7rem' }}>({contactNotes.length})</span>
                </div>

                <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    className="form-input"
                    placeholder="Write an internal note about this subscriber…"
                    rows={2}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    style={{ fontSize: '0.82rem', resize: 'vertical' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    style={{ alignSelf: 'flex-end' }}
                    disabled={addingNote || !newNoteText.trim()}
                  >
                    {addingNote ? 'Saving…' : '📝 Save Note'}
                  </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {contactNotes.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                      No staff notes yet
                    </div>
                  ) : (
                    contactNotes.map((note) => (
                      <div key={note.id} className="note-item">
                        <div className="note-header">
                          <span style={{ fontWeight: 600 }}>{note.author_name || note.userName || 'Staff'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{formatRelativeTime(note.created_at)}</span>
                            <span
                              style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: '0.8rem' }}
                              onClick={() => handleDeleteNote(note.id)}
                              title="Delete note"
                            >
                              🗑
                            </span>
                          </div>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                          {note.note}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
