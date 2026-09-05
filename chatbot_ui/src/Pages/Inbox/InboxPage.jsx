import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import {
  conversationAPI,
  uploadAPI,
  cannedResponseAPI,
  contactAPI,
  flowAPI,
  agencyAPI,
  labelAPI,
  customFieldAPI,
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
  CheckSquare,
  Square,
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

// Remembers the selected subscriber across a page refresh (per browser tab).
const SELECTED_CONVERSATION_KEY = 'inbox_selected_conversation_id';

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

  // Structured Labels (agency-wide catalog + per-subscriber attachment)
  const [agencyLabels, setAgencyLabels] = useState([]);
  const [contactLabels, setContactLabels] = useState([]);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2563eb');
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelFilterId, setLabelFilterId] = useState('');

  // Custom Fields (agency-defined field types + per-subscriber values)
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({}); // { [fieldId]: value }
  const [savingFieldId, setSavingFieldId] = useState(null);
  const [showNewFieldForm, setShowNewFieldForm] = useState(false);
  const [newFieldDraft, setNewFieldDraft] = useState({ name: '', fieldType: 'TEXT', options: '' });
  const [savingNewField, setSavingNewField] = useState(false);

  // Bulk selection in the subscriber list
  const [selectedConvIds, setSelectedConvIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
  const searchInputRef = useRef(null);
  const messageInputRef = useRef(null);

  const selectedId = selectedConv?._id || selectedConv?.id;
  const selectedIdRef = useRef(selectedId);
  const selectedContactId = selectedConv?.contact_id || selectedConv?.contactId;
  const selectedContactIdRef = useRef(selectedContactId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedContactIdRef.current = selectedContactId;
  }, [selectedId, selectedContactId]);

  // Load Canned Responses, Flows, Team Agents, Labels & Custom Field definitions
  useEffect(() => {
    cannedResponseAPI.getAll().then((res) => setCannedResponses(res.data?.cannedResponses || [])).catch(() => {});
    flowAPI.getAll().then((res) => setAvailableFlows(res.data?.flows || [])).catch(() => {});
    if (agencyAPI?.getAgents) {
      agencyAPI.getAgents().then((res) => setAgentsList(res.data?.agents || [])).catch(() => {});
    }
    labelAPI.getAll().then((res) => setAgencyLabels(res.data?.labels || [])).catch(() => {});
    customFieldAPI.getAll().then((res) => setCustomFieldDefs(res.data?.fields || [])).catch(() => {});
  }, []);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter !== 'All') params.status = statusFilter;
      if (platformFilter) params.platform = platformFilter;
      if (labelFilterId) params.labelId = labelFilterId;
      const res = await conversationAPI.getAll(params);
      setConversations(res.data.conversations || res.data || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setConvLoading(false);
    }
  }, [statusFilter, platformFilter, labelFilterId]);

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
      setContactLabels(conv.contactLabels || []);
      setContactNotes(data.notes || []);
      try {
        sessionStorage.setItem(SELECTED_CONVERSATION_KEY, String(convId));
      } catch {
        // Storage unavailable (private browsing, etc) — selection just won't survive a refresh
      }

      // Custom field values for this subscriber
      const contactId = conv.contact_id || conv.contactId;
      if (contactId) {
        customFieldAPI.getForContact(contactId).then((cfRes) => {
          const fields = cfRes.data?.fields || [];
          const values = {};
          for (const f of fields) values[f.field_id] = f.value ?? '';
          setCustomFieldValues(values);
        }).catch(() => setCustomFieldValues({}));
      }
    } catch (err) {
      console.error('Failed to load conversation details', err);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  // Restore the previously selected subscriber after a page refresh (once, on mount).
  useEffect(() => {
    let savedId = null;
    try {
      savedId = sessionStorage.getItem(SELECTED_CONVERSATION_KEY);
    } catch {
      // ignore
    }
    if (savedId) loadMessages(savedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectConversation = (conv) => {
    setSelectedConv(conv);
    setConvStatus(conv.status || 'OPEN');
    setMessages([]);
    loadMessages(conv._id || conv.id);
    // Opening a conversation resets unread_count server-side (GET /conversations/:id) —
    // reflect that immediately in the list instead of waiting for the next full reload.
    const openedId = conv._id || conv.id;
    setConversations((prev) => prev.map((c) => (
      String(c._id || c.id) === String(openedId) ? { ...c, unread_count: 0 } : c
    )));
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

    // Live tick updates: delivered / read / failed status arriving asynchronously
    // (e.g. WhatsApp status webhooks) get patched onto the already-rendered message.
    socket.on('message_status_update', (data) => {
      if (String(data.conversationId) !== String(selectedIdRef.current)) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m.id) !== String(data.messageId)) return m;
          return {
            ...m,
            ...(data.deliveredAt ? { delivered_at: data.deliveredAt } : {}),
            ...(data.readAt ? { read_at: data.readAt, is_read: true } : {}),
            ...(data.status ? { status: data.status, failure_stage: data.failureStage, failure_reason: data.failureReason } : {}),
          };
        })
      );
    });

    socket.on('conversation_updated', (data) => {
      // Patch the currently-open conversation in place (assign/status/bot-pause changed by
      // another team member) instead of only refreshing the list — previously this required
      // a refresh to see reflected in the open detail pane.
      if (data && String(data.conversationId) === String(selectedIdRef.current)) {
        setSelectedConv((prev) => (prev ? {
          ...prev,
          ...(data.assignedToId !== undefined ? { assigned_to_id: data.assignedToId } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.botPaused !== undefined ? { bot_paused: data.botPaused, botPaused: data.botPaused } : {}),
        } : prev));
        if (data.status !== undefined) setConvStatus(data.status);
        if (data.botPaused !== undefined) setBotPaused(Boolean(data.botPaused));
      }
      loadConversations();
    });

    // Structured label attached/detached for a single subscriber
    socket.on('contact_labels_updated', (data) => {
      if (String(data.contactId) === String(selectedContactIdRef.current)) {
        setContactLabels(data.labels || []);
      }
      loadConversations();
    });

    // Bulk label attach/detach or a label being deleted entirely
    socket.on('contacts_bulk_labeled', (data) => {
      const affectsOpenConv = Array.isArray(data.contactIds) &&
        data.contactIds.map(String).includes(String(selectedContactIdRef.current));
      if (affectsOpenConv && selectedIdRef.current) {
        // Re-fetch this subscriber's full detail rather than guessing the new label set client-side
        loadMessages(selectedIdRef.current);
      }
      loadConversations();
    });

    // Custom field catalog changed (field added/renamed/removed) — refresh definitions
    socket.on('custom_fields_updated', () => {
      customFieldAPI.getAll().then((res) => setCustomFieldDefs(res.data?.fields || [])).catch(() => {});
    });

    // A specific subscriber's custom field value changed (by anyone, any tab)
    socket.on('contact_custom_field_updated', (data) => {
      if (String(data.contactId) === String(selectedContactIdRef.current)) {
        setCustomFieldValues((prev) => ({ ...prev, [data.fieldId]: data.value ?? '' }));
      }
    });

    return () => socket.disconnect();
    // loadMessages is a stable useCallback([]) reference — safe to omit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadConversations]);

  // Keyboard shortcuts: Ctrl/Cmd+K focuses search, "/" focuses the reply box
  // (only when not already typing somewhere), Escape closes the subscriber drawer.
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '/' && !isTyping && selectedIdRef.current) {
        e.preventDefault();
        messageInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current.blur();
        } else {
          setShowSubscriberPanel(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        senderType: 'AGENT',
        senderName: user?.name || user?.email?.split('@')[0] || 'Admin',
        agentName: user?.name || user?.email?.split('@')[0] || 'Admin',
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
      // The server still records failed sends as a message (red tick) so the conversation
      // shows what was attempted instead of it just vanishing — add it if present.
      const failedMsg = err?.response?.data?.chatMessage;
      if (failedMsg) {
        setMessages((prev) => (prev.some((m) => String(m.id) === String(failedMsg.id)) ? prev : [...prev, failedMsg]));
      } else {
        // No persisted record came back — restore the typed text so nothing is lost
        setMessageText(text);
      }
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
        senderType: 'AGENT',
        senderName: user?.name || user?.email?.split('@')[0] || 'Admin',
        agentName: user?.name || user?.email?.split('@')[0] || 'Admin',
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
      // If the file reached our server and the platform send failed afterwards, the server
      // still records it as a red-tick message so it's visible in the conversation.
      const failedMsg = err?.response?.data?.chatMessage;
      if (failedMsg) {
        setMessages((prev) => (prev.some((m) => String(m.id) === String(failedMsg.id)) ? prev : [...prev, failedMsg]));
        setSendError(err?.response?.data?.message || 'Failed to deliver attachment.');
        setTimeout(() => setSendError(''), 8000);
      } else {
        alert('Failed to upload attachment.');
      }
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

  // ─── Bulk Actions on selected subscribers in the list ────────────────────────
  const handleBulkAssign = async (agentProfileId) => {
    const ids = Array.from(selectedConvIds);
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await conversationAPI.bulkAssign(ids, agentProfileId);
      setSelectedConvIds(new Set());
      loadConversations();
    } catch (err) {
      console.error('Bulk assign failed', err);
      alert(err?.response?.data?.message || 'Bulk assign failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkStatus = async (status) => {
    const ids = Array.from(selectedConvIds);
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await conversationAPI.bulkUpdateStatus(ids, status);
      setSelectedConvIds(new Set());
      loadConversations();
    } catch (err) {
      console.error('Bulk status update failed', err);
      alert(err?.response?.data?.message || 'Bulk status update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkLabel = async (labelId) => {
    const ids = Array.from(selectedConvIds);
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const contactIds = [...new Set(
        ids.map((cid) => conversations.find((c) => String(c._id || c.id) === String(cid))?.contact_id).filter(Boolean)
      )];
      await labelAPI.bulkAttach({ contactIds, labelId });
      setSelectedConvIds(new Set());
      loadConversations();
    } catch (err) {
      console.error('Bulk label failed', err);
      alert(err?.response?.data?.message || 'Bulk label failed');
    } finally {
      setBulkBusy(false);
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

  // ─── Structured Labels (unified with the Contacts/Subscriber Manager) ────────
  // Attach an existing agency label to the open subscriber
  const handleAttachLabel = async (labelId) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId || savingLabel) return;
    setSavingLabel(true);
    try {
      const res = await labelAPI.attachToContact(contactId, { labelId });
      setContactLabels(res.data?.labels || []);
      setLabelPickerOpen(false);
    } catch (err) {
      console.error('Failed to attach label', err);
    } finally {
      setSavingLabel(false);
    }
  };

  // Create a brand-new agency label and attach it in one step
  const handleCreateAndAttachLabel = async (e) => {
    e?.preventDefault();
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    const name = newLabelName.trim();
    if (!name || !contactId || savingLabel) return;
    setSavingLabel(true);
    try {
      const res = await labelAPI.attachToContact(contactId, { name, color: newLabelColor });
      setContactLabels(res.data?.labels || []);
      setNewLabelName('');
      setLabelPickerOpen(false);
      // Refresh the agency-wide label catalog so the new label shows up in the picker/filter
      labelAPI.getAll().then((r) => setAgencyLabels(r.data?.labels || [])).catch(() => {});
    } catch (err) {
      console.error('Failed to create label', err);
    } finally {
      setSavingLabel(false);
    }
  };

  // Detach a label from the open subscriber
  const handleDetachLabel = async (labelId) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    try {
      const res = await labelAPI.detachFromContact(contactId, labelId);
      setContactLabels(res.data?.labels || []);
    } catch (err) {
      console.error('Failed to remove label', err);
    }
  };

  // ─── Custom Fields ────────────────────────────────────────────────────────
  const handleSaveCustomField = async (fieldId, value) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    setSavingFieldId(fieldId);
    try {
      await customFieldAPI.setValue(contactId, fieldId, value);
      setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    } catch (err) {
      console.error('Failed to save custom field', err);
    } finally {
      setSavingFieldId(null);
    }
  };

  const handleCreateCustomField = async (e) => {
    e?.preventDefault();
    const name = newFieldDraft.name.trim();
    if (!name || savingNewField) return;
    setSavingNewField(true);
    try {
      const options = newFieldDraft.fieldType === 'SELECT'
        ? newFieldDraft.options.split(',').map((o) => o.trim()).filter(Boolean)
        : [];
      const res = await customFieldAPI.create({ name, fieldType: newFieldDraft.fieldType, options });
      setCustomFieldDefs((prev) => [...prev, res.data.field]);
      setNewFieldDraft({ name: '', fieldType: 'TEXT', options: '' });
      setShowNewFieldForm(false);
    } catch (err) {
      console.error('Failed to create custom field', err);
      alert(err?.response?.data?.message || 'Failed to create custom field');
    } finally {
      setSavingNewField(false);
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

            {/* Label Filter */}
            {agencyLabels.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
                <button
                  onClick={() => setLabelFilterId('')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700,
                    border: '1px solid', borderColor: !labelFilterId ? '#0f172a' : '#e2e8f0',
                    background: !labelFilterId ? '#0f172a' : '#f8fafc', color: !labelFilterId ? '#fff' : '#64748b',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  All Labels
                </button>
                {agencyLabels.map((lb) => {
                  const isSel = String(labelFilterId) === String(lb.id);
                  return (
                    <button
                      key={lb.id}
                      onClick={() => setLabelFilterId(isSel ? '' : lb.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700,
                        border: `1px solid ${isSel ? lb.color : '#e2e8f0'}`,
                        background: isSel ? lb.color : '#f8fafc', color: isSel ? '#fff' : lb.color,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSel ? '#fff' : lb.color }} />
                      {lb.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="form-input"
                placeholder="Search subscribers... (Ctrl+K)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 30, fontSize: '0.8rem', height: 34 }}
              />
            </div>
          </div>

          {/* Bulk Actions Toolbar — appears once one or more subscribers are checked */}
          {selectedConvIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              background: '#eef2ff', borderBottom: '1px solid #c7d2fe', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#4338ca' }}>
                {selectedConvIds.size} selected
              </span>
              <select
                disabled={bulkBusy}
                onChange={(e) => { if (e.target.value) { handleBulkAssign(e.target.value === 'unassign' ? null : e.target.value); e.target.value = ''; } }}
                defaultValue=""
                style={{ fontSize: '0.74rem', padding: '4px 6px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca' }}
              >
                <option value="" disabled>Assign to...</option>
                <option value="unassign">Unassign</option>
                {agentsList.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.email}</option>
                ))}
              </select>
              <select
                disabled={bulkBusy}
                onChange={(e) => { if (e.target.value) { handleBulkStatus(e.target.value); e.target.value = ''; } }}
                defaultValue=""
                style={{ fontSize: '0.74rem', padding: '4px 6px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca' }}
              >
                <option value="" disabled>Set status...</option>
                <option value="OPEN">Open</option>
                <option value="PENDING">Pending</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              {agencyLabels.length > 0 && (
                <select
                  disabled={bulkBusy}
                  onChange={(e) => { if (e.target.value) { handleBulkLabel(e.target.value); e.target.value = ''; } }}
                  defaultValue=""
                  style={{ fontSize: '0.74rem', padding: '4px 6px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca' }}
                >
                  <option value="" disabled>Add label...</option>
                  {agencyLabels.map((lb) => (
                    <option key={lb.id} value={lb.id}>{lb.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setSelectedConvIds(new Set())}
                style={{ marginLeft: 'auto', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          )}

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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConvIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id); else next.add(id);
                          return next;
                        });
                      }}
                      title="Select for bulk actions"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: selectedConvIds.has(id) ? '#2563eb' : '#cbd5e1', flexShrink: 0 }}
                    >
                      {selectedConvIds.has(id) ? <CheckSquare size={17} /> : <Square size={17} />}
                    </button>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <div style={{
                          fontSize: '0.76rem', color: conv.unread_count > 0 ? '#0f172a' : '#64748b',
                          fontWeight: conv.unread_count > 0 ? 700 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        }}>
                          {lastMsg}
                        </div>
                        {conv.unread_count > 0 && (
                          <span style={{
                            flexShrink: 0, minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                            background: '#2563eb', color: '#fff', fontSize: '0.68rem', fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {conv.unread_count > 99 ? '99+' : conv.unread_count}
                          </span>
                        )}
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
                      {Array.isArray(conv.contactLabels) && conv.contactLabels.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                          {conv.contactLabels.map((lb) => (
                            <span
                              key={lb.id}
                              style={{
                                fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                background: `${lb.color}18`, color: lb.color,
                              }}
                            >
                              {lb.name}
                            </span>
                          ))}
                        </div>
                      )}
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
                    className="transition-all duration-150 hover:brightness-95 active:scale-95"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 20,
                      border: 'none',
                      background: botPaused ? '#10b981' : '#fef2f2',
                      color: botPaused ? '#ffffff' : '#ef4444',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: togglingBot ? 'default' : 'pointer',
                      opacity: togglingBot ? 0.6 : 1,
                      boxShadow: botPaused ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none',
                      transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                    }}
                  >
                    {botPaused ? <Play size={13} /> : <Pause size={13} />}
                    {botPaused ? 'Resume Bot' : 'Pause Bot'}
                  </button>

                  <button
                    onClick={() => setShowSubscriberPanel((p) => !p)}
                    className="transition-all duration-150 hover:brightness-95 active:scale-95"
                    style={{
                      padding: '7px 14px',
                      borderRadius: 20,
                      border: '1px solid',
                      borderColor: showSubscriberPanel ? '#c7d2fe' : '#e2e8f0',
                      background: showSubscriberPanel ? '#eef2ff' : '#ffffff',
                      color: showSubscriberPanel ? '#4338ca' : '#475569',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'transform 0.12s ease, background 0.12s ease',
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

                    let meta = msg.metadata;
                    if (typeof meta === 'string') {
                      try { meta = JSON.parse(meta); } catch (_) { meta = null; }
                    }
                    const buttons = meta?.buttons || msg.buttons || null;
                    const hasAttachedButtons = isImage && buttons && buttons.length > 0;

                    // Determine sender attribution (Bot vs Admin / Team Member)
                    let isBot = false;
                    let senderDisplayName = '';
                    if (isOutbound) {
                      if (meta?.senderType === 'AGENT' || meta?.senderType === 'ADMIN' || meta?.agentName || meta?.userId) {
                        isBot = false;
                        senderDisplayName = meta?.agentName || meta?.senderName || user?.name || 'Admin';
                      } else if (meta?.senderType === 'BOT' || meta?.senderName === 'Bot') {
                        isBot = true;
                        senderDisplayName = meta?.senderName || 'Bot';
                      } else if (msg.sent_at) {
                        isBot = false;
                        senderDisplayName = meta?.senderName || user?.name || 'Admin';
                      } else {
                        isBot = true;
                        senderDisplayName = 'Bot';
                      }
                    } else {
                      senderDisplayName = selectedConv?.contactName || selectedConv?.contact_name || selectedConv?.name || selectedConv?.external_id || 'Subscriber';
                    }

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
                            padding: hasAttachedButtons ? 0 : (isImage && isMediaOnly ? '4px' : '10px 14px'),
                            borderRadius: isOutbound ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                            background: hasAttachedButtons ? '#ffffff' : (isOutbound ? '#f1f5f9' : '#ffffff'),
                            color: '#0f172a',
                            border: hasAttachedButtons ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
                            fontSize: '0.86rem',
                            lineHeight: 1.45,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            wordBreak: 'break-word',
                            overflow: 'hidden',
                          }}
                        >
                          {/* ── Interactive Header (if present) ── */}
                          {meta?.headerText && (
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4, color: '#0f172a' }}>
                              {meta.headerText}
                            </div>
                          )}
                          {meta?.headerMediaUrl && (
                            <div style={{ marginBottom: 8 }}>
                              <img
                                src={resolveMediaUrl(meta.headerMediaUrl)}
                                alt="Header Media"
                                style={{ width: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'cover' }}
                              />
                            </div>
                          )}

                          {/* ── Image Rendering ── */}
                          {isImage && (
                            <div style={{ marginBottom: (isMediaOnly || hasAttachedButtons) ? 0 : 8 }}>
                              <img
                                src={mediaUrl}
                                alt="Attachment"
                                style={{
                                  width: '100%',
                                  maxHeight: 280,
                                  borderRadius: hasAttachedButtons ? 0 : 10,
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
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  color: '#0f172a',
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
                          {!isMediaOnly && text && (
                            <div style={{ padding: hasAttachedButtons ? '8px 12px' : 0 }}>
                              {text}
                            </div>
                          )}

                          {/* ── Interactive Footer (if present) ── */}
                          {meta?.footerText && (
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
                              {meta.footerText}
                            </div>
                          )}

                          {/* Attached Buttons for Messenger Card / Interactive — full-width bars
                              matching how WhatsApp/Messenger actually render these natively.
                              Deliberately neutral (not platform-colored) so it looks identical
                              and consistent across every channel. */}
                          {buttons && buttons.length > 0 && (
                            <div
                              className={`flex flex-col m-0 p-0 border-t divide-y divide-slate-200 border-slate-200 bg-white ${hasAttachedButtons ? '' : 'mt-2 -mx-3.5 -mb-2.5'}`}
                              style={{ borderRadius: '0 0 10px 10px', overflow: 'hidden' }}
                            >
                              {buttons.map((b, bIdx) => {
                                const bTitle = typeof b === 'string' ? b : (b.title || b.text || b.label || b.reply_text || `Option ${bIdx + 1}`);
                                const isUrlButton = typeof b === 'object' && (b.type === 'URL' || b.type === 'web_url') && b.url;
                                const Tag = isUrlButton ? 'a' : 'div';
                                return (
                                  <Tag
                                    key={bIdx}
                                    {...(isUrlButton ? { href: b.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                                    className="w-full py-8 px-4 text-sm font-semibold flex items-center justify-center gap-2 text-slate-800 transition-colors cursor-pointer hover:bg-slate-50 active:bg-slate-100"
                                    style={{ textDecoration: 'none' }}
                                  >
                                    {isUrlButton && <ExternalLink size={14} className="text-slate-500" />}
                                    <span>{bTitle}</span>
                                  </Tag>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Sender info & timestamp */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.68rem',
                            color: '#94a3b8',
                            marginTop: 4,
                            padding: '0 4px',
                          }}
                        >
                          {isOutbound ? (
                            <>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3.5,
                                  fontWeight: 600,
                                  color: isBot ? '#64748b' : '#2563eb',
                                }}
                              >
                                {isBot ? <Bot size={11} /> : <User size={11} />}
                                {senderDisplayName}
                              </span>
                              <span>•</span>
                              <span>{formatTime(msg.created_at || msg.timestamp || msg.createdAt)}</span>
                              {msg.status === 'FAILED' && msg.failure_stage === 'SEND' ? (
                                <Check size={12} color="#ef4444" title={msg.failure_reason || 'Failed to send'} />
                              ) : msg.status === 'FAILED' && msg.failure_stage === 'DELIVERY' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }} title={msg.failure_reason || 'Sent, but not delivered'}>
                                  <Check size={12} color="#22c55e" style={{ marginRight: -6 }} />
                                  <Check size={12} color="#ef4444" />
                                </span>
                              ) : msg.is_read ? (
                                <CheckCheck size={12} color="#2563eb" title="Read" />
                              ) : msg.delivered_at ? (
                                <CheckCheck size={12} color="#94a3b8" title="Delivered" />
                              ) : (
                                <Check size={12} color="#94a3b8" title="Sent" />
                              )}
                            </>
                          ) : (
                            <>
                              <span style={{ fontWeight: 600, color: '#64748b' }}>
                                {senderDisplayName}
                              </span>
                              <span>•</span>
                              <span>{formatTime(msg.created_at || msg.timestamp || msg.createdAt)}</span>
                            </>
                          )}
                        </div>
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
                    className="transition-all duration-150 hover:bg-slate-100 active:scale-90"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: uploading ? 'default' : 'pointer',
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
                    ref={messageInputRef}
                    type="text"
                    className="form-input"
                    placeholder="Type a message or reply..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    style={{ flex: 1, height: 40, fontSize: '0.86rem', borderRadius: 20 }}
                  />

                  <button
                    type="submit"
                    disabled={!messageText.trim() || sending}
                    title="Send message"
                    className="transition-all duration-150 hover:brightness-110 active:scale-90 disabled:opacity-40"
                    style={{
                      width: 40, height: 40, borderRadius: '50%', border: 'none',
                      background: activePlatformInfo.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      cursor: (!messageText.trim() || sending) ? 'default' : 'pointer',
                      boxShadow: messageText.trim() ? `0 2px 10px ${activePlatformInfo.color}55` : 'none',
                    }}
                  >
                    <Send size={16} />
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

            {/* Tab 2: Labels (structured, color-coded — shared with the Subscriber/Contacts Manager) */}
            {activeDrawerTab === 'Labels' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      Attached Labels ({contactLabels.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setLabelPickerOpen((p) => !p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7,
                        border: '1px solid #c7d2fe', background: labelPickerOpen ? '#eef2ff' : '#fff',
                        color: '#4338ca', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} /> Add Label
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {contactLabels.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No labels attached yet.</span>
                    ) : (
                      contactLabels.map((lb) => (
                        <span
                          key={lb.id}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700,
                            padding: '4px 9px', borderRadius: 12,
                            background: `${lb.color}18`, color: lb.color, border: `1px solid ${lb.color}45`,
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: lb.color, flexShrink: 0 }} />
                          {lb.name}
                          <button
                            type="button"
                            onClick={() => handleDetachLabel(lb.id)}
                            title="Remove label"
                            style={{ background: 'none', border: 'none', color: lb.color, cursor: 'pointer', marginLeft: 2, lineHeight: 1, fontSize: '0.9rem' }}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {labelPickerOpen && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Existing agency labels not yet attached */}
                    <div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        Existing Labels
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {agencyLabels.filter((al) => !contactLabels.some((cl) => cl.id === al.id)).length === 0 ? (
                          <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                            {agencyLabels.length === 0 ? 'No labels created yet.' : 'All labels already attached.'}
                          </span>
                        ) : (
                          agencyLabels
                            .filter((al) => !contactLabels.some((cl) => cl.id === al.id))
                            .map((lb) => (
                              <button
                                key={lb.id}
                                type="button"
                                disabled={savingLabel}
                                onClick={() => handleAttachLabel(lb.id)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700,
                                  padding: '4px 9px', borderRadius: 12, cursor: savingLabel ? 'default' : 'pointer',
                                  background: `${lb.color}12`, color: lb.color, border: `1px dashed ${lb.color}60`,
                                }}
                              >
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: lb.color, flexShrink: 0 }} />
                                {lb.name}
                              </button>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Create a brand-new label and attach immediately */}
                    <form onSubmit={handleCreateAndAttachLabel} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={newLabelColor}
                        onChange={(e) => setNewLabelColor(e.target.value)}
                        title="Label color"
                        style={{ width: 30, height: 30, padding: 0, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="New label name..."
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        style={{ flex: 1, height: 30, fontSize: '0.8rem' }}
                      />
                      <button type="submit" disabled={savingLabel || !newLabelName.trim()} className="btn btn-primary btn-sm" style={{ height: 30 }}>
                        Create
                      </button>
                    </form>
                  </div>
                )}
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
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      Subscriber Data
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewFieldForm((p) => !p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7,
                        border: '1px solid #c7d2fe', background: showNewFieldForm ? '#eef2ff' : '#fff',
                        color: '#4338ca', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} /> New Field
                    </button>
                  </div>

                  {customFieldDefs.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px 0' }}>
                      No custom fields defined yet for your agency. Create one to start collecting structured data per subscriber (e.g. Order ID, Plan Tier, Renewal Date).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {customFieldDefs.map((field) => (
                        <div key={field.id}>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                            {field.name}
                          </label>
                          {field.field_type === 'SELECT' ? (
                            <select
                              value={customFieldValues[field.id] ?? ''}
                              onChange={(e) => handleSaveCustomField(field.id, e.target.value)}
                              disabled={savingFieldId === field.id}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#fff' }}
                            >
                              <option value="">—</option>
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.field_type === 'NUMBER' ? 'number' : field.field_type === 'DATE' ? 'date' : 'text'}
                              className="form-input"
                              value={customFieldValues[field.id] ?? ''}
                              onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                              onBlur={(e) => handleSaveCustomField(field.id, e.target.value)}
                              disabled={savingFieldId === field.id}
                              style={{ width: '100%', height: 32, fontSize: '0.82rem' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {showNewFieldForm && (
                    <form onSubmit={handleCreateCustomField} style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Field name (e.g. Order ID)"
                        value={newFieldDraft.name}
                        onChange={(e) => setNewFieldDraft((f) => ({ ...f, name: e.target.value }))}
                        style={{ height: 30, fontSize: '0.8rem' }}
                      />
                      <select
                        value={newFieldDraft.fieldType}
                        onChange={(e) => setNewFieldDraft((f) => ({ ...f, fieldType: e.target.value }))}
                        style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', background: '#fff' }}
                      >
                        <option value="TEXT">Text</option>
                        <option value="NUMBER">Number</option>
                        <option value="DATE">Date</option>
                        <option value="SELECT">Dropdown</option>
                      </select>
                      {newFieldDraft.fieldType === 'SELECT' && (
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Options, comma-separated (e.g. Gold, Silver, Bronze)"
                          value={newFieldDraft.options}
                          onChange={(e) => setNewFieldDraft((f) => ({ ...f, options: e.target.value }))}
                          style={{ height: 30, fontSize: '0.8rem' }}
                        />
                      )}
                      <button type="submit" disabled={savingNewField || !newFieldDraft.name.trim()} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
                        {savingNewField ? 'Creating...' : 'Create Field'}
                      </button>
                    </form>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    System Variables (read-only)
                  </span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 8 }}>
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
