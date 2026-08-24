import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '../../Components/Sidebar';
import { conversationAPI, uploadAPI, cannedResponseAPI } from '../../services/api';
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
  const now  = Date.now();
  const diff = now - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'now';
  if (mins < 60)  return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Status / Platform filter chips ──────────────────────────────────────────
const STATUS_CHIPS   = ['All', 'OPEN', 'PENDING', 'RESOLVED'];
const PLATFORM_CHIPS = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'WEBCHAT'];

export default function InboxPage() {
  const { user } = useAuth();
  const [conversations,   setConversations]   = useState([]);
  const [convLoading,     setConvLoading]      = useState(true);
  const [selectedConv,    setSelectedConv]     = useState(null);
  const [messages,        setMessages]         = useState([]);
  const [msgLoading,      setMsgLoading]       = useState(false);
  const [messageText,     setMessageText]      = useState('');
  const [sending,         setSending]          = useState(false);
  const [uploading,       setUploading]        = useState(false);
  const [statusFilter,    setStatusFilter]     = useState('All');
  const [platformFilter,  setPlatformFilter]   = useState('');
  const [search,          setSearch]           = useState('');

  // Canned Responses State
  const [cannedResponses, setCannedResponses] = useState([]);
  const [showCannedModal, setShowCannedModal] = useState(false);
  const [showCreateCanned, setShowCreateCanned] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedBody, setNewCannedBody] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);

  const selectedId = selectedConv?._id || selectedConv?.id;
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Load Canned Responses
  const loadCannedResponses = useCallback(async () => {
    try {
      const res = await cannedResponseAPI.getAll();
      setCannedResponses(res.data.cannedResponses || []);
    } catch (err) {
      console.error('Failed to load canned responses', err);
    }
  }, []);

  useEffect(() => {
    loadCannedResponses();
  }, [loadCannedResponses]);

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter !== 'All') params.status   = statusFilter;
      if (platformFilter)         params.platform  = platformFilter;
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

  // ── Load messages for selected conversation ─────────────────────────────────
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    setMsgLoading(true);
    try {
      const res = await conversationAPI.getOne(convId);
      const data = res.data;
      setMessages(data.messages || []);
      // Update the selected conv data
      setSelectedConv(data.conversation || data);
    } catch (err) {
      console.error('Failed to load messages', err);
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
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio autoplay restrictions or unsupported
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
      await conversationAPI.sendMessage(convId, {
        body: filename || file.name,
        type,
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

  // ── Resolve conversation ────────────────────────────────────────────────────
  const handleResolve = async () => {
    if (!selectedConv) return;
    const convId = selectedConv._id || selectedConv.id;
    try {
      await conversationAPI.updateStatus(convId, 'RESOLVED');
      setSelectedConv((prev) => ({ ...prev, status: 'RESOLVED' }));
      setConversations((prev) =>
        prev.map((c) => (c._id === convId || c.id === convId) ? { ...c, status: 'RESOLVED' } : c)
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

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />

      <div className="inbox-layout">
        {/* ── Conversation List ── */}
        <aside className="conversation-list">
          <div className="conversation-list-header">
            <div className="conversation-list-title">Inbox 💬</div>

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
                All Platforms
              </button>
              {PLATFORM_CHIPS.map((p) => (
                <button
                  key={p}
                  className={`filter-chip ${platformFilter === p ? 'active' : ''}`}
                  onClick={() => setPlatformFilter(p)}
                >
                  {getPlatformIcon(p)} {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              className="form-input"
              placeholder="🔍 Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                const id       = conv._id || conv.id;
                const name     = conv.contact?.name || conv.contactName || 'Unknown';
                const preview  = conv.lastMessage?.body || conv.lastMessageBody || '…';
                const time     = conv.lastMessageTime || conv.last_message_at || conv.lastMessage?.createdAt || conv.updated_at || conv.created_at || conv.updatedAt || conv.createdAt;
                const unread   = conv.unreadCount || conv.unread_count || 0;
                const platform = conv.platform || 'WHATSAPP';
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
                      <span className={`platform-icon platform-icon ${getPlatformClass(platform)}`}>
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

        {/* ── Chat Area ── */}
        <main className="chat-area">
          {!selectedConv ? (
            <div className="chat-empty" style={{ flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '4rem', opacity: 0.2 }}>💬</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Select a conversation</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Choose a conversation from the left panel to start chatting
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="chat-header">
                <div className="avatar">{getInitials(selectedConv.contact?.name || selectedConv.contactName)}</div>
                <div className="chat-header-info">
                  <div className="chat-header-name">
                    {selectedConv.contact?.name || selectedConv.contactName || 'Unknown Contact'}
                  </div>
                  <div className="chat-header-status">
                    <span className={`badge ${getPlatformBadgeClass(selectedConv.platform)}`}>
                      {getPlatformIcon(selectedConv.platform)} {selectedConv.platform}
                    </span>
                  </div>
                </div>

                {/* Status badge */}
                <span className={`badge ${
                  selectedConv.status === 'RESOLVED' ? 'badge-success'
                  : selectedConv.status === 'PENDING' ? 'badge-warning'
                  : 'badge-primary'
                }`}>
                  <span className={`status-dot ${(selectedConv.status || 'open').toLowerCase()}`} />
                  {selectedConv.status || 'OPEN'}
                </span>

                <div className="chat-header-actions">
                  {selectedConv.status !== 'RESOLVED' && (
                    <button className="btn btn-sm btn-success" onClick={handleResolve}>
                      ✅ Resolve
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="chat-messages">
                {msgLoading ? (
                  <div className="loading-overlay" style={{ flex: 1 }}>
                    <div className="loading-spinner" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-empty">No messages yet. Say hello! 👋</div>
                ) : (
                  messages.map((msg) => {
                    const isInbound = msg.direction?.toLowerCase() === 'inbound' || msg.type?.toLowerCase() === 'inbound';
                    const rawMediaUrl = msg.media_url || msg.mediaUrl;
                    const backendUrl = import.meta.env.VITE_API_URL
                      ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
                      : 'http://localhost:5000';
                    const fullMediaUrl = rawMediaUrl && !rawMediaUrl.startsWith('http') ? `${backendUrl}${rawMediaUrl}` : rawMediaUrl;
                    const msgType = (msg.type || '').toUpperCase();

                    return (
                      <div key={msg._id || msg.id} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className={`message-bubble ${isInbound ? 'inbound' : 'outbound'}`}>
                          {/* Media Rendering */}
                          {fullMediaUrl && (
                            <div style={{ marginBottom: 6 }}>
                              {msgType === 'IMAGE' || /\.(jpg|jpeg|png|gif|webp)$/i.test(fullMediaUrl) ? (
                                <img
                                  src={fullMediaUrl}
                                  alt="Attachment"
                                  style={{ maxWidth: 260, maxHeight: 200, borderRadius: 8, objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                                  onClick={() => window.open(fullMediaUrl, '_blank')}
                                />
                              ) : msgType === 'AUDIO' || /\.(mp3|wav|ogg)$/i.test(fullMediaUrl) ? (
                                <audio controls style={{ maxWidth: 240 }} src={fullMediaUrl} />
                              ) : (
                                <a
                                  href={fullMediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '6px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: 6,
                                    fontSize: '0.85rem', color: 'inherit', textDecoration: 'none'
                                  }}
                                >
                                  📎 Download Attachment
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

              {/* Input Area */}
              <div className="chat-input-area" style={{ position: 'relative' }}>
                {/* Canned Responses Popover Menu */}
                {showCannedModal && (
                  <div
                    style={{
                      position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 8,
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                      padding: 16, boxShadow: 'var(--shadow-lg)', zIndex: 100, maxHeight: 300, display: 'flex', flexDirection: 'column'
                    }}
                  >
                    <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>⚡ Quick Replies (Canned Responses)</span>
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
                      onChange={e => setCannedSearch(e.target.value)}
                      style={{ marginBottom: 10, padding: '6px 10px', fontSize: '0.85rem' }}
                    />

                    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {cannedResponses.filter(c => c.title.toLowerCase().includes(cannedSearch.toLowerCase()) || c.body.toLowerCase().includes(cannedSearch.toLowerCase())).length === 0 ? (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                          No matching quick replies found.
                        </div>
                      ) : (
                        cannedResponses
                          .filter(c => c.title.toLowerCase().includes(cannedSearch.toLowerCase()) || c.body.toLowerCase().includes(cannedSearch.toLowerCase()))
                          .map((item) => (
                            <div
                              key={item.id}
                              style={{
                                padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8,
                                cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.15s'
                              }}
                              onClick={() => {
                                setMessageText(item.body);
                                setShowCannedModal(false);
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>{item.title}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                  />
                  
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ borderRadius: '50%', width: 38, height: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending || selectedConv.status === 'RESOLVED'}
                    title="Attach file / image"
                  >
                    {uploading ? (
                      <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : '📎'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ borderRadius: 19, height: 38, padding: '0 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                    onClick={() => setShowCannedModal(!showCannedModal)}
                    disabled={selectedConv.status === 'RESOLVED'}
                    title="Insert Canned Response / Quick Reply"
                  >
                    ⚡ Quick Replies
                  </button>

                  <textarea
                    className="chat-textarea"
                    placeholder="Type a message… (or click Quick Replies ⚡)"
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      if (e.target.value === '/') setShowCannedModal(true);
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={sending || uploading || selectedConv.status === 'RESOLVED'}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="chat-send-btn"
                    onClick={handleSend}
                    disabled={sending || uploading || !messageText.trim() || selectedConv.status === 'RESOLVED'}
                    title="Send message"
                  >
                    {sending ? (
                      <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    ) : '➤'}
                  </button>
                </div>
                {selectedConv.status === 'RESOLVED' && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                    This conversation is resolved. Reopen to send messages.
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
