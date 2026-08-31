import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import {
  conversationAPI,
  uploadAPI,
  cannedResponseAPI,
  contactAPI,
  flowAPI,
  agencyAPI,
} from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { useLayout } from '../../Provider/LayoutContext';
import io from 'socket.io-client';
import {
  MessageSquare,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Globe,
  Search,
  SlidersHorizontal,
  Bot,
  User,
  Tag,
  FileText,
  Paperclip,
  Check,
  CheckCheck,
  Zap,
  Sparkles,
  Pause,
  Play,
  Trash2,
  PhoneCall,
  Clock,
  ChevronRight,
  X,
  Plus,
  RefreshCw,
  MoreVertical,
  Shield,
  CheckCircle2,
  Smile,
  Image as ImageIcon,
  Film,
  Menu,
  Download,
  ExternalLink,
  Volume2,
  UserCheck,
  ListFilter,
  Layers,
  Calendar,
  Phone,
  Mail,
  Sliders,
} from 'lucide-react';

/* ─── Platform Map ─── */
const PLATFORM_MAP = {
  WHATSAPP:  { label: 'WhatsApp',  icon: MessageCircle, color: '#25d366', bg: 'rgba(37, 211, 102, 0.12)' },
  FACEBOOK:  { label: 'Facebook',  icon: Facebook,      color: '#1877f2', bg: 'rgba(24, 119, 242, 0.12)' },
  INSTAGRAM: { label: 'Instagram', icon: Instagram,     color: '#e1306c', bg: 'rgba(225, 48, 108, 0.12)' },
  TELEGRAM:  { label: 'Telegram',  icon: Send,          color: '#229ed9', bg: 'rgba(34, 158, 217, 0.12)' },
  WEBCHAT:   { label: 'Webchat',   icon: Globe,         color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
};

function getPlatformInfo(p) {
  const norm = (p || 'WHATSAPP').toUpperCase();
  return PLATFORM_MAP[norm] || { label: norm, icon: MessageSquare, color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' };
}

function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const baseUrl = apiUrl.startsWith('http')
    ? apiUrl.replace('/api/v1', '')
    : '';
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
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

function formatFullDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name = '') {
  return (name || '').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const STATUS_CHIPS = ['All', 'OPEN', 'PENDING', 'RESOLVED'];
const DRAWER_TABS = ['Overview', 'Labels', 'Flows & Agent', 'Custom Fields', 'Notes'];

export default function InboxPage() {
  const { user } = useAuth();
  const { openPopupNav } = useLayout();

  // Conversations & Messages
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [uploading, setUploading] = useState(false);

  const [statusFilter, setStatusFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showSubscriberPanel, setShowSubscriberPanel] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);

  // Subscriber Details & Extended Panel State
  const [activeDrawerTab, setActiveDrawerTab] = useState('Overview');
  const [botPaused, setBotPaused] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [contactTags, setContactTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [contactNotes, setContactNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [agentsList, setAgentsList] = useState([]);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [availableFlows, setAvailableFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [triggeringFlow, setTriggeringFlow] = useState(false);
  const [convStatus, setConvStatus] = useState('OPEN');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Canned Responses State
  const [cannedResponses, setCannedResponses] = useState([]);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedId = selectedConv?._id || selectedConv?.id;
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Load Canned Responses, Flows & Team Agents
  useEffect(() => {
    cannedResponseAPI.getAll().then((res) => setCannedResponses(res.data?.cannedResponses || [])).catch(() => {});
    flowAPI.getAll().then((res) => setAvailableFlows(res.data?.flows || [])).catch(() => {});
    if (agencyAPI?.getAgents) {
      agencyAPI.getAgents().then((res) => setAgentsList(res.data?.agents || [])).catch(() => {});
    }
  }, []);

  // Load conversations list
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

  // Load messages and subscriber info
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    setMsgLoading(true);
    try {
      const res = await conversationAPI.getOne(convId);
      const data = res.data;
      setMessages(data.messages || []);
      const conv = data.conversation || data;
      setSelectedConv(conv);
      setConvStatus(conv.status || 'OPEN');
      setBotPaused(Boolean(conv.bot_paused || conv.botPaused || conv.contactBotPaused));
      setContactTags(conv.contactTags || []);
      setContactNotes(data.notes || []);
    } catch (err) {
      console.error('Failed to load conversation details', err);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  const selectConversation = (conv) => {
    setSelectedConv(conv);
    setConvStatus(conv.status || 'OPEN');
    setMessages([]);
    loadMessages(conv._id || conv.id);
  };

  // Socket.io Real-time connection with strict deduplication
  useEffect(() => {
    if (!user) return;

    let socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      if (apiUrl.startsWith('http')) {
        socketUrl = apiUrl.replace('/api/v1', '');
      } else {
        socketUrl = undefined; // lets socket.io use current origin and Vite proxy
      }
    }

    const socket = io(socketUrl, {
      auth: {
        agencyId: user.agencyId,
        userId: user.id,
        role: user.role,
      },
      transports: ['websocket', 'polling'],
    });

    socket.on('new_message', (data) => {
      if (String(data.conversationId) === String(selectedIdRef.current)) {
        const incoming = data.message;
        if (!incoming) return;

        setMessages((prev) => {
          const isDuplicate = prev.some((m) => {
            if (m.id && incoming.id && String(m.id) === String(incoming.id)) return true;
            if (m._id && incoming._id && String(m._id) === String(incoming._id)) return true;
            if (m.external_msg_id && incoming.external_msg_id && m.external_msg_id === incoming.external_msg_id) return true;
            return false;
          });
          if (isDuplicate) return prev;
          return [...prev, incoming];
        });
      }
      loadConversations();
    });

    socket.on('conversation_updated', () => {
      loadConversations();
    });

    return () => socket.disconnect();
  }, [user, loadConversations]);

  // Auto-scroll messages to bottom reliably
  const scrollToBottom = useCallback((instant = false) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
    }
  }, []);

  useEffect(() => {
    if (!msgLoading && messages.length > 0) {
      // Immediate scroll
      scrollToBottom(true);
      // Secondary scrolls to handle async DOM layout & image dimension calculations
      const t1 = setTimeout(() => scrollToBottom(true), 40);
      const t2 = setTimeout(() => scrollToBottom(true), 150);
      const t3 = setTimeout(() => scrollToBottom(true), 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [messages, msgLoading, selectedId, scrollToBottom]);

  // Send Message with robust deduplication
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!messageText.trim() || !selectedId || sending) return;

    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const res = await conversationAPI.sendMessage(selectedId, {
        content: text,
        body: text,
        type: 'text',
        direction: 'OUTBOUND',
      });
      const newMsg = res.data.message || res.data;

      // Add to messages only if not already present
      setMessages((prev) => {
        const isDuplicate = prev.some((m) => {
          if (m.id && newMsg.id && String(m.id) === String(newMsg.id)) return true;
          if (m._id && newMsg._id && String(m._id) === String(newMsg._id)) return true;
          return false;
        });
        if (isDuplicate) return prev;
        return [...prev, newMsg];
      });

      loadConversations();
    } catch (err) {
      console.error('Failed to send message', err);
      const errMsg = err?.response?.data?.message || 'Failed to send message. Check your WhatsApp connection settings.';
      setSendError(errMsg);
      // Restore the typed message so user doesn't lose it
      setMessageText(text);
      // Auto-clear error after 8 seconds
      setTimeout(() => setSendError(''), 8000);
    } finally {
      setSending(false);
    }
  };

  // Handle File / Media Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await uploadAPI.uploadFile(formData);
      const { url, type, filename } = uploadRes.data;

      const res = await conversationAPI.sendMessage(selectedId, {
        type: type || 'IMAGE',
        body: filename || file.name,
        mediaUrl: url,
        direction: 'OUTBOUND',
      });

      const newMsg = res.data.message || res.data;
      setMessages((prev) => {
        const isDuplicate = prev.some((m) => {
          if (m.id && newMsg.id && String(m.id) === String(newMsg.id)) return true;
          if (m._id && newMsg._id && String(m._id) === String(newMsg._id)) return true;
          return false;
        });
        if (isDuplicate) return prev;
        return [...prev, newMsg];
      });

      loadConversations();
    } catch (err) {
      console.error('Failed to upload file', err);
      alert('Failed to upload attachment.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle Bot Pause
  const handleToggleBot = async () => {
    if (!selectedConv) return;
    const contactId = selectedConv.contact_id || selectedConv.contactId;
    if (!contactId) return;

    setTogglingBot(true);
    try {
      await contactAPI.toggleBot(contactId);
      setBotPaused((prev) => !prev);
    } catch (err) {
      console.error('Failed to toggle bot', err);
    } finally {
      setTogglingBot(false);
    }
  };

  // Assign Team Agent
  const handleAssignAgent = async (agentProfileId) => {
    if (!selectedId) return;
    setAssigningAgent(true);
    try {
      await conversationAPI.assign(selectedId, agentProfileId || null);
      setSelectedConv((prev) => ({ ...prev, assigned_to_id: agentProfileId }));
      loadConversations();
    } catch (err) {
      console.error('Failed to assign agent', err);
    } finally {
      setAssigningAgent(false);
    }
  };

  // Update Conversation Status (OPEN, PENDING, RESOLVED)
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedId) return;
    setUpdatingStatus(true);
    try {
      await conversationAPI.updateStatus(selectedId, newStatus);
      setConvStatus(newStatus);
      setSelectedConv((prev) => ({ ...prev, status: newStatus }));
      loadConversations();
    } catch (err) {
      console.error('Failed to update status', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Trigger Visual Bot Flow
  const handleTriggerFlow = async () => {
    if (!selectedId || !selectedFlowId) return;
    setTriggeringFlow(true);
    try {
      await conversationAPI.triggerFlow(selectedId, selectedFlowId);
      alert('Flow triggered successfully!');
      loadMessages(selectedId);
    } catch (err) {
      console.error('Failed to trigger flow', err);
    } finally {
      setTriggeringFlow(false);
    }
  };

  // Add Contact Tag / Label
  const handleAddTag = async (e) => {
    e?.preventDefault();
    const tag = newTagInput.trim();
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!tag || !contactId || addingTag) return;

    setAddingTag(true);
    try {
      await contactAPI.addTag(contactId, tag);
      setContactTags((prev) => [...new Set([...prev, tag])]);
      setNewTagInput('');
    } catch (err) {
      console.error('Failed to add tag', err);
    } finally {
      setAddingTag(false);
    }
  };

  // Remove Contact Tag / Label
  const handleRemoveTag = async (tag) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    try {
      await contactAPI.removeTag(contactId, tag);
      setContactTags((prev) => prev.filter((t) => t !== tag));
    } catch (err) {
      console.error('Failed to remove tag', err);
    }
  };

  // Add Internal Agent Note
  const handleAddNote = async (e) => {
    e?.preventDefault();
    const noteText = newNoteText.trim();
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!noteText || !contactId || savingNote) return;

    setSavingNote(true);
    try {
      await contactAPI.addNote(contactId, noteText);
      const res = await contactAPI.getNotes(contactId);
      setContactNotes(res.data.notes || []);
      setNewNoteText('');
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setSavingNote(false);
    }
  };

  // Filtered Conversations
  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    const name = (c.contactName || c.contact_name || c.external_id || '').toLowerCase();
    const lastMsg = (c.lastMessageBody || c.lastMessage?.content || c.last_message || '').toLowerCase();
    const integName = (c.integrationName || c.integration_name || '').toLowerCase();
    const matchesSearch = name.includes(q) || lastMsg.includes(q) || integName.includes(q);

    const convPlat = (c.platform || c.integrationPlatform || c.contactPlatform || '').toUpperCase();
    const matchesPlatform = !platformFilter || platformFilter === 'ALL' || convPlat === platformFilter.toUpperCase();

    // Match Status
    let matchesStatus = true;
    if (statusFilter && statusFilter !== 'All') {
      const convStatus = (c.status || 'OPEN').toUpperCase();
      if (statusFilter.toUpperCase() === 'OPEN') {
        matchesStatus = ['OPEN', 'ASSIGNED'].includes(convStatus);
      } else if (statusFilter.toUpperCase() === 'RESOLVED') {
        matchesStatus = ['RESOLVED', 'CLOSED'].includes(convStatus);
      } else {
        matchesStatus = convStatus === statusFilter.toUpperCase();
      }
    }

    return matchesSearch && matchesPlatform && matchesStatus;
  });

  const activePlatformInfo = getPlatformInfo(selectedConv?.platform || selectedConv?.integrationPlatform || selectedConv?.contactPlatform);
  const ActivePlatformIcon = activePlatformInfo.icon || MessageSquare;

  return (
    <AppLayout>
      <div className="inbox-layout" style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#f8fafc' }}>
        {/* ── 1. Conversation List Column ── */}
        <aside className="conversation-list" style={{ width: 330, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
          <div className="conversation-list-header" style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={openPopupNav}
                  title="Open Navigation Menu (Pop Bar)"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = '#f8fafc'; }}
                >
                  <Menu size={16} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.94rem', color: '#0f172a' }}>
                  <MessageSquare size={17} color="#2563eb" /> Live Inbox
                </div>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb' }}>
                {filteredConversations.length} Active
              </span>
            </div>

            {/* Channel Platform Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {[
                { id: '', label: 'All' },
                { id: 'WHATSAPP', label: '💬 WhatsApp' },
                { id: 'FACEBOOK', label: '📘 Facebook' },
                { id: 'INSTAGRAM', label: '📸 Instagram' },
                { id: 'TELEGRAM', label: '✈️ Telegram' },
                { id: 'WEBCHAT', label: '🌐 Webchat' },
              ].map((p) => {
                const isSel = (platformFilter || '') === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlatformFilter(p.id)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      border: '1px solid',
                      borderColor: isSel ? '#0f172a' : '#e2e8f0',
                      background: isSel ? '#0f172a' : '#f8fafc',
                      color: isSel ? '#ffffff' : '#64748b',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Status Filter Chips */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {STATUS_CHIPS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: statusFilter === s ? '#2563eb' : '#e2e8f0',
                    background: statusFilter === s ? '#2563eb' : '#ffffff',
                    color: statusFilter === s ? '#ffffff' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search subscribers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 30, fontSize: '0.8rem', height: 34 }}
              />
            </div>
          </div>

          {/* Conversation List Items */}
          <div className="conversation-list-body" style={{ flex: 1, overflowY: 'auto' }}>
            {convLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Loading chats...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                No conversations found.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const id = conv._id || conv.id;
                const isSelected = String(selectedId) === String(id);
                const pInfo = getPlatformInfo(conv.platform || conv.contactPlatform);
                const PlatformIcon = pInfo.icon;
                const contactName = conv.contactName || conv.contact_name || conv.external_id || 'Visitor';
                const lastMsg = conv.lastMessageBody || conv.lastMessage?.content || conv.last_message || 'Started conversation';
                const time = conv.lastMessageTime || conv.last_message_at || conv.updatedAt || conv.createdAt;

                return (
                  <div
                    key={id}
                    className={`conversation-item ${isSelected ? 'active' : ''}`}
                    onClick={() => selectConversation(conv)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      background: isSelected ? '#f0f4ff' : 'transparent',
                      borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      {conv.contactAvatar || conv.avatar ? (
                        <img
                          src={resolveMediaUrl(conv.contactAvatar || conv.avatar)}
                          alt={contactName}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: '#f1f5f9',
                            color: '#0f172a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                          }}
                        >
                          {getInitials(contactName)}
                        </div>
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                      >
                        <PlatformIcon size={10} color={pInfo.color} />
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {contactName}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0, marginLeft: 4 }}>
                          {formatRelativeTime(time)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {lastMsg}
                      </div>
                      {/* Channel / Bot Account Tag */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: pInfo.bg,
                            color: pInfo.color,
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <PlatformIcon size={10} />
                          {conv.integrationName || conv.integration_name || pInfo.label}
                        </span>
                        {conv.status && (
                          <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 600, textTransform: 'capitalize' }}>
                            {conv.status.toLowerCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── 2. Active Chat Messages Area ── */}
        <main className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
          {selectedConv ? (
            <>
              {/* Chat Header */}
              <div className="chat-header" style={{ height: 56, padding: '0 20px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: activePlatformInfo.bg,
                      color: activePlatformInfo.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ActivePlatformIcon size={18} />
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                      {selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id || 'Subscriber'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: activePlatformInfo.color }}>
                        {selectedConv.integrationName || selectedConv.integration_name || activePlatformInfo.label}
                      </span>
                      <span>•</span>
                      <span>{activePlatformInfo.label}</span>
                      <span>•</span>
                      <span style={{ color: botPaused ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                        ● {botPaused ? 'Bot Paused (Agent Mode)' : 'Bot Active'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={handleToggleBot}
                    disabled={togglingBot}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: botPaused ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      color: botPaused ? '#10b981' : '#ef4444',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {botPaused ? <Play size={13} /> : <Pause size={13} />}
                    {botPaused ? 'Resume Bot' : 'Pause Bot'}
                  </button>

                  <button
                    onClick={() => setShowSubscriberPanel((p) => !p)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      color: '#475569',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <SlidersHorizontal size={14} />
                    {showSubscriberPanel ? 'Hide Drawer' : 'Subscriber Info'}
                  </button>
                </div>
              </div>

              {/* Chat Message List */}
              <div ref={messagesContainerRef} className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {msgLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading conversation messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: '0.84rem' }}>
                    No messages yet in this conversation.
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isOutbound = (msg.direction || '').toUpperCase() === 'OUTBOUND';
                    const rawMedia = msg.media_url || msg.mediaUrl || msg.url || (
                      typeof msg.body === 'string' && (msg.body.startsWith('http') || msg.body.startsWith('/uploads')) && msg.body.match(/\.(jpeg|jpg|gif|png|webp|svg|mp4|webm|mov|ogg|mp3|pdf|doc|docx)($|\?)/i)
                        ? msg.body
                        : null
                    );
                    const mediaUrl = resolveMediaUrl(rawMedia);
                    const text = (msg.body || msg.content || msg.message || '').trim();
                    const isMediaOnly = rawMedia && (text === rawMedia || text === '[Attachment]' || text === '[Media]' || text === '[Audio]');

                    const isImage = msg.type === 'IMAGE' || (mediaUrl && mediaUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i));
                    const isVideo = msg.type === 'VIDEO' || (mediaUrl && mediaUrl.match(/\.(mp4|webm|mov|mkv)($|\?)/i));
                    const isAudio = msg.type === 'AUDIO' || (mediaUrl && mediaUrl.match(/\.(mp3|wav|ogg|m4a)($|\?)/i));
                    const isDoc   = msg.type === 'DOCUMENT' || (mediaUrl && mediaUrl.match(/\.(pdf|doc|docx|zip|txt)($|\?)/i));

                    return (
                      <div
                        key={msg.id || msg._id || idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isOutbound ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '72%',
                            padding: isImage && isMediaOnly ? '4px' : '10px 14px',
                            borderRadius: isOutbound ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                            background: isOutbound ? '#2563eb' : '#ffffff',
                            color: isOutbound ? '#ffffff' : '#0f172a',
                            border: isOutbound ? 'none' : '1px solid #e2e8f0',
                            fontSize: '0.86rem',
                            lineHeight: 1.45,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            wordBreak: 'break-word',
                            overflow: 'hidden',
                          }}
                        >
                          {/* ── Image Rendering ── */}
                          {isImage && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8 }}>
                              <img
                                src={mediaUrl}
                                alt="Attachment"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 280,
                                  borderRadius: 10,
                                  cursor: 'pointer',
                                  display: 'block',
                                  objectFit: 'cover',
                                }}
                                onClick={() => setPreviewImage(mediaUrl)}
                              />
                            </div>
                          )}

                          {/* ── Video Rendering ── */}
                          {isVideo && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8 }}>
                              <video
                                src={mediaUrl}
                                controls
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 280,
                                  borderRadius: 10,
                                  display: 'block',
                                }}
                              />
                            </div>
                          )}

                          {/* ── Audio Rendering ── */}
                          {isAudio && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8, minWidth: 220 }}>
                              <audio src={mediaUrl} controls style={{ width: '100%', height: 36 }} />
                            </div>
                          )}

                          {/* ── Document / File Rendering ── */}
                          {isDoc && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8 }}>
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  background: isOutbound ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
                                  color: isOutbound ? '#ffffff' : '#0f172a',
                                  textDecoration: 'none',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                }}
                              >
                                <FileText size={16} />
                                <span>{text || 'Download Document'}</span>
                                <Download size={14} style={{ marginLeft: 'auto' }} />
                              </a>
                            </div>
                          )}

                          {/* Text message */}
                          {!isMediaOnly && text && <div>{text}</div>}
                        </div>

                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3, padding: '0 4px' }}>
                          {formatTime(msg.created_at || msg.timestamp || msg.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                {/* Send Error Banner */}
                {sendError && (
                  <div style={{
                    padding: '8px 16px',
                    background: '#fef2f2',
                    borderBottom: '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.78rem',
                    color: '#dc2626',
                  }}>
                    <span style={{ fontWeight: 700, flexShrink: 0 }}>⚠ Send failed:</span>
                    <span style={{ flex: 1 }}>{sendError}</span>
                    <a
                      href="/channels/whatsapp"
                      style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap', fontSize: '0.72rem' }}
                    >
                      Fix in Settings →
                    </a>
                    <button
                      onClick={() => setSendError('')}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 2px', fontWeight: 700, flexShrink: 0 }}
                    >✕</button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="chat-input-area" style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    accept="image/*,video/*,audio/*,application/pdf"
                  />

                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    title="Send image, video, audio or file"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {uploading ? (
                      <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : (
                      <Paperclip size={16} />
                    )}
                  </button>

                  <input
                    type="text"
                    className="form-input"
                    placeholder="Type a message or reply..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    style={{ flex: 1, height: 40, fontSize: '0.86rem' }}
                  />

                  <button
                    type="submit"
                    disabled={!messageText.trim() || sending}
                    className="btn btn-primary"
                    style={{ height: 40, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Send size={15} /> Send
                  </button>
                </form>
              </div>

            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <MessageSquare size={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Select a conversation
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                Choose a subscriber from the left list to start live chatting
              </p>
            </div>
          )}
        </main>

        {/* ── 3. Comprehensive Subscriber Details & Management Drawer ── */}
        {selectedConv && showSubscriberPanel && (
          <aside style={{ width: 330, flexShrink: 0, borderLeft: '1px solid #e2e8f0', background: '#ffffff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Subscriber Header Card */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#fafbfe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: activePlatformInfo.bg,
                    color: activePlatformInfo.color,
                  }}
                >
                  {activePlatformInfo.label}
                </span>
                <button
                  onClick={() => setShowSubscriberPanel(false)}
                  style={{ color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none' }}
                  title="Close Drawer"
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem',
                  }}
                >
                  {getInitials(selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id || 'Subscriber'}
                  </h4>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                    ID: <strong>{selectedConv.contact_id || selectedConv.id}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                  Conversation Status
                </label>
                <select
                  value={convStatus}
                  disabled={updatingStatus}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#ffffff' }}
                >
                  <option value="OPEN">🟢 Open (Active)</option>
                  <option value="PENDING">🟡 Pending Follow-up</option>
                  <option value="RESOLVED">⚪ Resolved</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                  Assigned Team Agent
                </label>
                <select
                  value={selectedConv.assigned_to_id || ''}
                  disabled={assigningAgent}
                  onChange={(e) => handleAssignAgent(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#ffffff' }}
                >
                  <option value="">👤 Unassigned</option>
                  {agentsList.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Drawer Tabs Navigation */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', background: '#fafbfe' }}>
              {DRAWER_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveDrawerTab(tab)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: activeDrawerTab === tab ? '#2563eb' : '#64748b',
                    borderBottom: activeDrawerTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                    background: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab 1: Overview */}
            {activeDrawerTab === 'Overview' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Phone / Identifier
                  </span>
                  <div style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={13} color="#64748b" /> {selectedConv.contactPhone || selectedConv.external_id || '—'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Email Address
                  </span>
                  <div style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={13} color="#64748b" /> {selectedConv.contactEmail || '—'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Channel Integration
                  </span>
                  <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>
                    {selectedConv.integrationName || activePlatformInfo.label}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Subscribed On
                  </span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={13} color="#64748b" /> {formatFullDate(selectedConv.createdAt || selectedConv.created_at)}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Bot State
                  </span>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: botPaused ? '#ef4444' : '#10b981' }}>
                      ● {botPaused ? 'Human Agent Mode (Paused)' : 'Automated Bot Active'}
                    </span>
                    <button
                      onClick={handleToggleBot}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                    >
                      {botPaused ? 'Resume' : 'Pause'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Labels / Tags */}
            {activeDrawerTab === 'Labels' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <form onSubmit={handleAddTag} style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="New label / tag..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    style={{ flex: 1, height: 32, fontSize: '0.8rem' }}
                  />
                  <button type="submit" disabled={addingTag || !newTagInput.trim()} className="btn btn-primary btn-sm" style={{ height: 32 }}>
                    <Plus size={13} /> Add
                  </button>
                </form>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                    Attached Labels ({contactTags.length})
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {contactTags.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No tags attached yet.</span>
                    ) : (
                      contactTags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 12,
                            background: 'rgba(37, 99, 235, 0.08)',
                            color: '#2563eb',
                            border: '1px solid rgba(37, 99, 235, 0.2)',
                          }}
                        >
                          <Tag size={11} /> {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginLeft: 2 }}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Flows & Agent */}
            {activeDrawerTab === 'Flows & Agent' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                    Trigger Flow on Subscriber
                  </label>
                  <select
                    value={selectedFlowId}
                    onChange={(e) => setSelectedFlowId(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#ffffff', marginBottom: 8 }}
                  >
                    <option value="">Select a Bot Flow...</option>
                    {availableFlows.map((fl) => (
                      <option key={fl.id} value={fl.id}>
                        {fl.name} ({fl.platform})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleTriggerFlow}
                    disabled={!selectedFlowId || triggeringFlow}
                    className="btn btn-primary w-full btn-sm"
                    style={{ justifyContent: 'center' }}
                  >
                    <Zap size={13} /> {triggeringFlow ? 'Sending Flow...' : 'Execute Flow Now'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 4: Custom Fields */}
            {activeDrawerTab === 'Custom Fields' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Collected Flow Variables
                </span>
                <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ color: '#0f172a' }}>Platform:</strong>
                    <span>{activePlatformInfo.label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ color: '#0f172a' }}>External ID:</strong>
                    <span>{selectedConv.external_id || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ color: '#0f172a' }}>Bot Session:</strong>
                    <span>{botPaused ? 'Agent Handled' : 'Active'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: Internal Notes */}
            {activeDrawerTab === 'Notes' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    rows={3}
                    className="form-input"
                    placeholder="Write an internal note for this subscriber..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    style={{ fontSize: '0.82rem', resize: 'none' }}
                  />
                  <button type="submit" disabled={savingNote || !newNoteText.trim()} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
                    <Plus size={13} /> Save Note
                  </button>
                </form>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                    Notes Log ({contactNotes.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {contactNotes.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No internal notes added.</span>
                    ) : (
                      contactNotes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: '10px 12px',
                            fontSize: '0.82rem',
                          }}
                        >
                          <div style={{ color: '#0f172a', lineHeight: 1.4 }}>{n.note}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                            <span>By: {n.userName || 'Agent'}</span>
                            <span>{formatRelativeTime(n.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Image Lightbox Modal ── */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: -36,
                right: 0,
                color: '#ffffff',
                fontSize: '1.2rem',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              ✕ Close
            </button>
            <img
              src={previewImage}
              alt="Enlarged preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
