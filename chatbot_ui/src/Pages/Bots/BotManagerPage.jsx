import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { flowAPI, integrationAPI } from '../../services/api';
import {
  Bot,
  Plus,
  Search,
  SlidersHorizontal,
  Play,
  Pause,
  Edit3,
  Copy,
  Trash2,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Layers,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  ShoppingBag,
  UserCheck,
  HelpCircle,
  Zap,
  Globe,
  Grid,
  List,
  ChevronRight,
} from 'lucide-react';

/* ─── Platform Definitions ─── */
const PLATFORMS = {
  FACEBOOK:  { label: 'Facebook',  icon: '📘', color: '#1877f2', badgeBg: 'rgba(24, 119, 242, 0.15)', border: 'rgba(24, 119, 242, 0.35)' },
  INSTAGRAM: { label: 'Instagram', icon: '📸', color: '#e1306c', badgeBg: 'rgba(225, 48, 108, 0.15)', border: 'rgba(225, 48, 108, 0.35)' },
  WHATSAPP:  { label: 'WhatsApp',  icon: '💬', color: '#25d366', badgeBg: 'rgba(37, 211, 102, 0.15)', border: 'rgba(37, 211, 102, 0.35)' },
  TELEGRAM:  { label: 'Telegram',  icon: '✈️', color: '#229ed9', badgeBg: 'rgba(34, 158, 217, 0.15)', border: 'rgba(34, 158, 217, 0.35)' },
  WEBCHAT:   { label: 'Webchat',   icon: '🌐', color: '#6366f1', badgeBg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.35)' },
};

/* ─── Trigger Definitions ─── */
const TRIGGER_TYPES = {
  KEYWORD:       { label: 'Keyword Trigger',  icon: '🔑', color: '#10b981' },
  FIRST_CONTACT: { label: 'First Contact',    icon: '👋', color: '#f59e0b' },
  FIRST_MESSAGE: { label: 'First Message',    icon: '👋', color: '#f59e0b' },
  ANY:           { label: 'Any Message',      icon: '💬', color: '#6366f1' },
  ANY_MESSAGE:   { label: 'Any Message',      icon: '💬', color: '#6366f1' },
  POSTBACK:      { label: 'Button Postback',  icon: '🔘', color: '#8b5cf6' },
  WEBHOOK:       { label: 'Webhook / API',    icon: '⚡', color: '#ec4899' },
};

/* ─── Pre-built Bot Starter Templates ─── */
const STARTER_TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Canvas',
    description: 'Start from scratch and design a custom multi-step flow with complete freedom.',
    icon: Sparkles,
    badge: 'Custom',
    color: '#6366f1',
    nodes: (name) => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 320, y: 80 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['hi', 'hello'], match_type: 'contains' },
      },
      {
        id: 'text_1',
        type: 'text',
        position: { x: 320, y: 240 },
        data: { label: 'Welcome Text', message: `Hello! Welcome to ${name || 'our service'}. How can we assist you today?` },
      },
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'text_1', type: 'smoothstep', animated: true },
    ],
  },
  {
    id: 'welcome_menu',
    title: 'Welcome & Main Menu',
    description: 'Greets subscriber on keyword or first message and provides quick action buttons.',
    icon: Bot,
    badge: 'Popular',
    color: '#10b981',
    nodes: (name) => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 320, y: 60 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['hi', 'hello', 'start', 'menu'], match_type: 'contains' },
      },
      {
        id: 'btn_1',
        type: 'buttons',
        position: { x: 320, y: 220 },
        data: {
          label: 'Interactive Menu',
          message: `👋 Welcome to ${name || 'our chatbot'}! Please pick an option below:`,
          buttons: ['🛍️ Browse Products', '💰 View Pricing', '💬 Talk to Agent'],
        },
      },
      {
        id: 'text_pricing',
        type: 'text',
        position: { x: 50, y: 440 },
        data: { label: 'Pricing Info', message: '💳 Our plans start at $19/mo. Check our website for full details!' },
      },
      {
        id: 'text_agent',
        type: 'text',
        position: { x: 420, y: 440 },
        data: { label: 'Agent Handoff', message: '🔔 One moment! An agent will join this conversation shortly.' },
      },
    ],
    edges: () => [
      { id: 'e_start_btn', source: 'start_1', target: 'btn_1', type: 'smoothstep', animated: true },
      { id: 'e_btn_pricing', source: 'btn_1', sourceHandle: 'btn-1', target: 'text_pricing', type: 'smoothstep', animated: true },
      { id: 'e_btn_agent', source: 'btn_1', sourceHandle: 'btn-2', target: 'text_agent', type: 'smoothstep', animated: true },
    ],
  },
  {
    id: 'lead_capture',
    title: 'Lead Capture & Booking',
    description: 'Collects visitor Name, Email, and Phone number and confirms submission.',
    icon: UserCheck,
    badge: 'High Conversion',
    color: '#f59e0b',
    nodes: (name) => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 320, y: 60 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['quote', 'consult', 'booking', 'lead'], match_type: 'contains' },
      },
      {
        id: 'text_intro',
        type: 'text',
        position: { x: 320, y: 200 },
        data: { label: 'Intro Prompt', message: '✨ Let’s get you scheduled! May I know your full name?' },
      },
      {
        id: 'collect_name',
        type: 'collectInput',
        position: { x: 320, y: 350 },
        data: { label: 'Capture Name', variableName: 'contact_name', text: 'Please type your name:' },
      },
      {
        id: 'text_confirm',
        type: 'text',
        position: { x: 320, y: 500 },
        data: { label: 'Confirmation', message: '🎉 Thank you {{contact_name}}! Our team will reach out to you shortly.' },
      },
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'text_intro', type: 'smoothstep', animated: true },
      { id: 'e2', source: 'text_intro', target: 'collect_name', type: 'smoothstep', animated: true },
      { id: 'e3', source: 'collect_name', target: 'text_confirm', type: 'smoothstep', animated: true },
    ],
  },
  {
    id: 'ecommerce_showcase',
    title: 'E-Commerce & Carousel',
    description: 'Displays a visual carousel of popular products with direct purchase actions.',
    icon: ShoppingBag,
    badge: 'Rich Media',
    color: '#ec4899',
    nodes: (name) => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 320, y: 60 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['shop', 'products', 'buy', 'catalog'], match_type: 'contains' },
      },
      {
        id: 'carousel_1',
        type: 'carousel',
        position: { x: 320, y: 220 },
        data: {
          label: 'Featured Products',
          cards: [
            { title: 'Premium Plan', subtitle: 'Unlimited bots and live chat', imageUrl: '', buttons: ['Select Plan'] },
            { title: 'Starter Plan', subtitle: 'Perfect for small teams', imageUrl: '', buttons: ['Select Plan'] },
          ],
        },
      },
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'carousel_1', type: 'smoothstep', animated: true },
    ],
  },
  {
    id: 'support_faq',
    title: 'Customer Support FAQ',
    description: 'Instant answers to frequent questions with automatic fallback and agent handoff.',
    icon: HelpCircle,
    badge: 'Automation',
    color: '#06b6d4',
    nodes: (name) => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 320, y: 60 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['help', 'faq', 'support', 'question'], match_type: 'contains' },
      },
      {
        id: 'qr_faq',
        type: 'quickReplies',
        position: { x: 320, y: 220 },
        data: {
          label: 'FAQ Quick Options',
          message: 'How can we help you today? Pick a topic:',
          replies: ['🚚 Shipping Times', '↩️ Refund Policy', '📞 Human Support'],
        },
      },
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'qr_faq', type: 'smoothstep', animated: true },
    ],
  },
];

export default function BotManagerPage() {
  const navigate = useNavigate();
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [toast, setToast] = useState(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [newBotName, setNewBotName] = useState('');
  const [newBotPlatform, setNewBotPlatform] = useState('FACEBOOK');
  const [newBotIntegrationId, setNewBotIntegrationId] = useState('');
  const [integrations, setIntegrations] = useState([]);
  const [creating, setCreating] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── Load all bots/flows & integrations ── */
  const fetchBots = useCallback(async () => {
    try {
      setLoading(true);
      const [flowsRes, integsRes] = await Promise.allSettled([
        flowAPI.getAll(),
        integrationAPI.getAll(),
      ]);
      if (flowsRes.status === 'fulfilled') {
        setBots(flowsRes.value.data?.flows || flowsRes.value.data || []);
      }
      if (integsRes.status === 'fulfilled') {
        setIntegrations(integsRes.value.data?.integrations || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast('Failed to load bot flows', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  /* ── Toggle Active Status ── */
  const handleToggleActive = async (bot, e) => {
    e.stopPropagation();
    const newStatus = !bot.is_active;

    // Optimistic UI update
    setBots((prev) =>
      prev.map((b) => (b.id === bot.id ? { ...b, is_active: newStatus ? 1 : 0 } : b))
    );

    try {
      await flowAPI.toggle(bot.id);
      showToast(`Bot "${bot.name}" is now ${newStatus ? 'Active' : 'Paused'}`);
    } catch (err) {
      console.error('Failed to toggle bot status:', err);
      showToast('Failed to change status', 'error');
      // Revert on error
      fetchBots();
    }
  };

  /* ── Duplicate Bot ── */
  const handleDuplicateBot = async (bot, e) => {
    e.stopPropagation();
    try {
      let nodes = [];
      let edges = [];
      try { nodes = typeof bot.nodes_json === 'string' ? JSON.parse(bot.nodes_json) : (bot.nodes_json || []); } catch {}
      try { edges = typeof bot.edges_json === 'string' ? JSON.parse(bot.edges_json) : (bot.edges_json || []); } catch {}

      const res = await flowAPI.create({
        name: `${bot.name} (Copy)`,
        platform: bot.platform || 'FACEBOOK',
        integrationId: bot.integration_id || null,
        triggerKeyword: bot.trigger_keyword || 'hi,hello',
        triggerType: bot.trigger_type || 'KEYWORD',
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        isActive: 0,
      });

      showToast(`Duplicated "${bot.name}"!`);
      fetchBots();
    } catch (err) {
      console.error('Failed to duplicate bot:', err);
      showToast('Failed to duplicate bot', 'error');
    }
  };

  /* ── Delete Bot ── */
  const handleDeleteBot = async (bot, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete the bot "${bot.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await flowAPI.delete(bot.id);
      setBots((prev) => prev.filter((b) => b.id !== bot.id));
      showToast(`Deleted "${bot.name}"`);
    } catch (err) {
      console.error('Failed to delete bot:', err);
      showToast('Failed to delete bot', 'error');
    }
  };

  /* ── Create Bot from Template ── */
  const handleCreateBot = async (e) => {
    e.preventDefault();
    if (!newBotName.trim()) {
      showToast('Please enter a bot name', 'error');
      return;
    }

    setCreating(true);
    try {
      const template = STARTER_TEMPLATES.find((t) => t.id === selectedTemplate) || STARTER_TEMPLATES[0];
      const nodes = template.nodes(newBotName);
      const edges = template.edges();

      const startNode = nodes.find((n) => n.type === 'start');
      const triggerType = (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
      const rawKeywords = startNode?.data?.keywords || ['hi', 'hello'];
      const triggerKeyword = Array.isArray(rawKeywords) ? rawKeywords.join(',') : rawKeywords;

      const res = await flowAPI.create({
        name: newBotName.trim(),
        platform: newBotPlatform,
        integrationId: newBotIntegrationId ? Number(newBotIntegrationId) : null,
        triggerKeyword,
        triggerType,
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        isActive: 1,
      });

      const newId = res.data?.flowId || res.data?.id;
      showToast('Bot created successfully! Opening Flow Builder...');
      setShowCreateModal(false);
      setNewBotName('');
      setNewBotIntegrationId('');

      if (newId) {
        navigate(`/bots/${newId}/edit`);
      } else {
        fetchBots();
      }
    } catch (err) {
      console.error('Failed to create bot:', err);
      showToast(err.response?.data?.message || 'Failed to create bot', 'error');
    } finally {
      setCreating(false);
    }
  };

  /* ── Filtered Bots ── */
  const filteredBots = useMemo(() => {
    return bots.filter((b) => {
      // Platform filter
      if (selectedPlatform !== 'ALL' && b.platform?.toUpperCase() !== selectedPlatform) {
        return false;
      }
      // Status filter
      if (statusFilter === 'ACTIVE' && !b.is_active) return false;
      if (statusFilter === 'PAUSED' && b.is_active) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = b.name?.toLowerCase().includes(q);
        const kwMatch = b.trigger_keyword?.toLowerCase().includes(q);
        if (!nameMatch && !kwMatch) return false;
      }
      return true;
    });
  }, [bots, selectedPlatform, statusFilter, searchQuery]);

  /* ── Stats Calculations ── */
  const stats = useMemo(() => {
    const total = bots.length;
    const active = bots.filter((b) => b.is_active).length;
    const fb = bots.filter((b) => b.platform === 'FACEBOOK').length;
    const ig = bots.filter((b) => b.platform === 'INSTAGRAM').length;
    const wa = bots.filter((b) => b.platform === 'WHATSAPP').length;
    return { total, active, fb, ig, wa };
  }, [bots]);

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 10,
            background: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {toast.type === 'success' ? '✅' : '❌'} {toast.message}
        </div>
      )}

      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {/* ── Top Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              🤖 Bot Flow Manager
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4, margin: 0 }}>
              Design and automate conversational AI flows, triggers, carousels, and rich media for Facebook, Instagram, WhatsApp, and more.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 22px',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              boxShadow: '0 4px 18px rgba(99, 102, 241, 0.4)',
              cursor: 'pointer',
              border: 'none',
              color: '#fff',
            }}
          >
            <Plus size={18} /> Create Bot Flow
          </button>
        </div>

        {/* ── Metrics Cards ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={22} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.total}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Total Bot Flows</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={20} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{stats.active}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Active Bots</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(24, 119, 242, 0.15)',
                color: '#1877f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 20 }}>📘</span>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.fb}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Facebook Bots</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(225, 48, 108, 0.15)',
                color: '#e1306c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 20 }}>📸</span>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.ig}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Instagram Bots</div>
            </div>
          </div>
        </div>

        {/* ── Filter & Search Toolbar ── */}
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search bot name or keyword trigger..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 36, width: '100%', fontSize: 13 }}
            />
          </div>

          {/* Platform Pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {['ALL', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TELEGRAM', 'WEBCHAT'].map((plat) => {
              const info = PLATFORMS[plat] || { label: 'All Platforms', icon: '🌐' };
              const isSelected = selectedPlatform === plat;
              return (
                <button
                  key={plat}
                  type="button"
                  onClick={() => setSelectedPlatform(plat)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: isSelected ? '1px solid #6366f1' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    color: isSelected ? '#a5b4fc' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{info.icon}</span> {plat === 'ALL' ? 'All' : info.label}
                </button>
              );
            })}
          </div>

          {/* Status Filter & View Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input"
              style={{ fontSize: 12, padding: '6px 12px', width: 120 }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="PAUSED">Paused Only</option>
            </select>

            <div style={{ display: 'flex', background: 'var(--bg-surface-2, rgba(255,255,255,0.05))', borderRadius: 8, padding: 2 }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '6px 8px',
                  background: viewMode === 'grid' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: viewMode === 'grid' ? '#a5b4fc' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title="Grid View"
              >
                <Grid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                style={{
                  padding: '6px 8px',
                  background: viewMode === 'list' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: viewMode === 'list' ? '#a5b4fc' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title="List View"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Bots Content Area ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={32} className="spinning" style={{ margin: '0 auto 12px' }} />
            <div>Loading bot flows...</div>
          </div>
        ) : filteredBots.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'var(--bg-surface)',
              borderRadius: 16,
              border: '1px dashed var(--border-color, rgba(255,255,255,0.15))',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Bot size={32} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
              {searchQuery || selectedPlatform !== 'ALL' || statusFilter !== 'ALL'
                ? 'No matching bot flows found'
                : 'No Bot Flows Created Yet'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 440, margin: '0 auto 20px' }}>
              Create your first visual bot with triggers, buttons, interactive carousels, and rich media attachments.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 8,
              }}
            >
              <Plus size={16} /> Create New Bot Flow
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* ── Grid View ── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 20,
            }}
          >
            {filteredBots.map((bot) => {
              const platformInfo = PLATFORMS[bot.platform] || PLATFORMS.WEBCHAT;
              const triggerTypeKey = (bot.trigger_type || 'KEYWORD').toUpperCase();
              const triggerInfo = TRIGGER_TYPES[triggerTypeKey] || TRIGGER_TYPES.KEYWORD;

              let nodeCount = 0;
              let keywordsList = [];
              try {
                const parsedNodes = typeof bot.nodes_json === 'string' ? JSON.parse(bot.nodes_json) : (bot.nodes_json || []);
                nodeCount = parsedNodes.length;
                const startNode = parsedNodes.find((n) => n.type === 'start');
                if (startNode?.data?.keywords) {
                  keywordsList = startNode.data.keywords;
                } else if (bot.trigger_keyword) {
                  keywordsList = bot.trigger_keyword.split(',').map((k) => k.trim()).filter(Boolean);
                }
              } catch {}

              return (
                <div
                  key={bot.id}
                  className="card"
                  onClick={() => navigate(`/bots/${bot.id}/edit`)}
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    background: 'var(--bg-surface, #1e2238)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(255,255,255,0.08))';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Top Bar: Platform & Status Switch */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: platformInfo.badgeBg,
                          color: platformInfo.color,
                          fontSize: 12,
                          fontWeight: 700,
                          border: `1px solid ${platformInfo.border}`,
                        }}
                      >
                        <span>{platformInfo.icon}</span> {bot.fb_page_name || bot.integration_name || platformInfo.label}
                      </span>

                      {/* Active Toggle Switch */}
                      <div
                        onClick={(e) => handleToggleActive(bot, e)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 8px',
                          borderRadius: 20,
                          background: bot.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.08)',
                          color: bot.is_active ? '#10b981' : 'var(--text-muted)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: `1px solid ${bot.is_active ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}`,
                        }}
                        title={bot.is_active ? 'Click to Pause' : 'Click to Activate'}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: bot.is_active ? '#10b981' : '#64748b',
                            boxShadow: bot.is_active ? '0 0 8px #10b981' : 'none',
                          }}
                        />
                        {bot.is_active ? 'Active' : 'Paused'}
                      </div>
                    </div>

                    {/* Bot Name & Meta */}
                    <h3
                      style={{
                        fontSize: 17,
                        fontWeight: 700,
                        margin: '0 0 6px',
                        color: 'var(--text-primary)',
                        lineHeight: 1.3,
                      }}
                    >
                      {bot.name}
                    </h3>

                    {/* Trigger info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trigger:</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: triggerInfo.color,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {triggerInfo.icon} {triggerInfo.label}
                      </span>
                    </div>

                    {/* Keywords List Preview */}
                    {keywordsList.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
                        {keywordsList.slice(0, 4).map((kw, i) => (
                          <span
                            key={i}
                            style={{
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {kw}
                          </span>
                        ))}
                        {keywordsList.length > 4 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                            +{keywordsList.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Footer */}
                  <div
                    style={{
                      paddingTop: 12,
                      borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => handleDuplicateBot(bot, e)}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: 'none',
                          color: 'var(--text-muted)',
                          padding: '6px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                        title="Duplicate Bot"
                      >
                        <Copy size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteBot(bot, e)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: 'none',
                          color: '#ef4444',
                          padding: '6px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                        title="Delete Bot"
                      >
                        <Trash2 size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(`/bots/${bot.id}/edit`)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 6,
                          background: 'rgba(99, 102, 241, 0.18)',
                          color: '#a5b4fc',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={13} /> Edit Flow
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── List / Table View ── */
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-2, rgba(255,255,255,0.03))', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>Bot Name</th>
                  <th style={{ padding: '12px 16px' }}>Platform</th>
                  <th style={{ padding: '12px 16px' }}>Trigger</th>
                  <th style={{ padding: '12px 16px' }}>Keywords</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBots.map((bot) => {
                  const platformInfo = PLATFORMS[bot.platform] || PLATFORMS.WEBCHAT;
                  const triggerTypeKey = (bot.trigger_type || 'KEYWORD').toUpperCase();
                  const triggerInfo = TRIGGER_TYPES[triggerTypeKey] || TRIGGER_TYPES.KEYWORD;

                  let keywordsList = [];
                  try {
                    const parsedNodes = typeof bot.nodes_json === 'string' ? JSON.parse(bot.nodes_json) : (bot.nodes_json || []);
                    const startNode = parsedNodes.find((n) => n.type === 'start');
                    if (startNode?.data?.keywords) {
                      keywordsList = startNode.data.keywords;
                    } else if (bot.trigger_keyword) {
                      keywordsList = bot.trigger_keyword.split(',').map((k) => k.trim()).filter(Boolean);
                    }
                  } catch {}

                  return (
                    <tr
                      key={bot.id}
                      onClick={() => navigate(`/bots/${bot.id}/edit`)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {bot.name}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: platformInfo.badgeBg,
                            color: platformInfo.color,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {platformInfo.icon} {bot.fb_page_name || bot.integration_name || platformInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: triggerInfo.color, fontWeight: 600 }}>
                        {triggerInfo.icon} {triggerInfo.label}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {keywordsList.slice(0, 3).map((kw, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#10b981',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleActive(bot, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color: bot.is_active ? '#10b981' : '#64748b',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: bot.is_active ? '#10b981' : '#64748b',
                            }}
                          />
                          {bot.is_active ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => navigate(`/bots/${bot.id}/edit`)}
                            className="btn btn-primary"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDuplicateBot(bot, e)}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: 'none',
                              color: 'var(--text-muted)',
                              padding: '6px 8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                            title="Duplicate"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteBot(bot, e)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: 'none',
                              color: '#ef4444',
                              padding: '6px 8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create New Bot Flow Modal ── */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={() => !creating && setShowCreateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 720,
              width: '100%',
              background: 'var(--bg-surface, #1e2238)',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              padding: 28,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  🤖 Create New Bot Flow
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Choose a starter template or start from a blank canvas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 22,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBot}>
              {/* Bot Name & Platform Selection */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>
                    Bot Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Limitless Sales Bot, Support FAQ..."
                    value={newBotName}
                    onChange={(e) => setNewBotName(e.target.value)}
                    className="form-input"
                    required
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>
                    Connect to Page / Channel *
                  </label>
                  <select
                    value={newBotIntegrationId ? `integ_${newBotIntegrationId}` : `plat_${newBotPlatform}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('integ_')) {
                        const integId = val.replace('integ_', '');
                        const integ = integrations.find((i) => String(i.id) === String(integId));
                        setNewBotIntegrationId(integId);
                        if (integ?.platform) setNewBotPlatform(integ.platform.toUpperCase());
                      } else if (val.startsWith('plat_')) {
                        setNewBotIntegrationId('');
                        setNewBotPlatform(val.replace('plat_', ''));
                      }
                    }}
                    className="form-input"
                    style={{ width: '100%' }}
                  >
                    {integrations.length > 0 && (
                      <optgroup label="Connected Pages & Channels">
                        {integrations.map((i) => {
                          const icon = i.platform === 'FACEBOOK' ? '📘' : i.platform === 'INSTAGRAM' ? '📸' : i.platform === 'WHATSAPP' ? '💬' : '🌐';
                          return (
                            <option key={i.id} value={`integ_${i.id}`}>
                              {icon} {i.fb_page_name || i.name} ({i.platform})
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                    <optgroup label="General Platform (All Pages)">
                      <option value="plat_FACEBOOK">📘 All Facebook Pages</option>
                      <option value="plat_INSTAGRAM">📸 All Instagram Accounts</option>
                      <option value="plat_WHATSAPP">💬 All WhatsApp Numbers</option>
                      <option value="plat_TELEGRAM">✈️ Telegram</option>
                      <option value="plat_WEBCHAT">🌐 Website Live Chat</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Starter Templates Selection */}
              <label className="form-label" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'block' }}>
                Select Starter Template
              </label>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {STARTER_TEMPLATES.map((tmpl) => {
                  const Icon = tmpl.icon;
                  const isSelected = selectedTemplate === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => setSelectedTemplate(tmpl.id)}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        cursor: 'pointer',
                        border: isSelected
                          ? `2px solid ${tmpl.color}`
                          : '1px solid var(--border-color, rgba(255,255,255,0.08))',
                        background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: `${tmpl.color}22`,
                              color: tmpl.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon size={18} />
                          </div>
                          {tmpl.badge && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: `${tmpl.color}22`,
                                color: tmpl.color,
                              }}
                            >
                              {tmpl.badge}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                          {tmpl.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {tmpl.description}
                        </div>
                      </div>

                      {isSelected && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: tmpl.color, fontSize: 11, fontWeight: 700 }}>
                          <CheckCircle2 size={13} /> Selected
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 22px',
                    fontWeight: 700,
                  }}
                >
                  {creating ? (
                    <>
                      <RefreshCw size={16} className="spinning" /> Creating...
                    </>
                  ) : (
                    <>
                      Create & Open Flow Builder <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
