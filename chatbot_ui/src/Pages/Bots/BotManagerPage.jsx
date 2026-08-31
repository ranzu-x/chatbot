import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { flowAPI, integrationAPI, channelAPI, botAPI, templateAPI } from '../../services/api';
import WhatsAppTemplateManager from '../../Components/Templates/WhatsAppTemplateManager';
import CommentAutomationManager from '../../Components/Comments/CommentAutomationManager';
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
  ChevronDown,
  Video,
  Folder,
  Settings,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Radio,
  FileText,
  Clock,
  Key,
  Shield,
  Eye,
  Database,
  Share2,
  PhoneCall,
  Heart,
  FileCode,
  Tag,
  Users,
  MoreVertical,
  X,
} from 'lucide-react';

/* ─── Platform Map & Config ─── */
const PLATFORM_MAP = {
  WHATSAPP:  { label: 'WhatsApp',  icon: MessageCircle, color: '#25d366', bg: 'rgba(37, 211, 102, 0.12)', border: '#25d366' },
  FACEBOOK:  { label: 'Facebook',  icon: Facebook,      color: '#1877f2', bg: 'rgba(24, 119, 242, 0.12)', border: '#1877f2' },
  INSTAGRAM: { label: 'Instagram', icon: Instagram,     color: '#e1306c', bg: 'rgba(225, 48, 108, 0.12)', border: '#e1306c' },
  TELEGRAM:  { label: 'Telegram',  icon: Send,          color: '#229ed9', bg: 'rgba(34, 158, 217, 0.12)', border: '#229ed9' },
  TIKTOK:    { label: 'TikTok',    icon: Video,         color: '#FE2C55', bg: 'rgba(254, 44, 85, 0.12)',   border: '#FE2C55' },
  WEBCHAT:   { label: 'Webchat',   icon: Globe,         color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: '#6366f1' },
};

function getPlatformInfo(p) {
  const norm = (p || 'WHATSAPP').toUpperCase();
  return PLATFORM_MAP[norm] || { label: norm, icon: MessageSquare, color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', border: '#64748b' };
}

/* ─── Primary Categories & Sub-tabs ─── */
const MAIN_CATEGORIES = [
  { id: 'automation',     label: 'Automation',      icon: Zap },
  { id: 'dataCollection', label: 'Data Collection', icon: Folder },
  { id: 'ai',             label: 'AI',              icon: Sparkles },
  { id: 'engagement',     label: 'Engagement',      icon: Radio },
  { id: 'commerce',       label: 'Commerce',        icon: ShoppingBag },
  { id: 'integrations',   label: 'Integrations',    icon: Share2 },
];

const SUB_TABS = {
  automation: [
    { id: 'keywordReplies',   label: 'Keyword Replies' },
    { id: 'messageTemplates', label: 'Message Templates' },
    { id: 'clickAds',         label: 'Click Ads' },
    { id: 'followUpSequences',label: 'Follow-up Sequences' },
    { id: 'quickActions',     label: 'Quick Actions' },
    { id: 'outboundActions',  label: 'Outbound Actions' },
    { id: 'webhookWorkflows', label: 'Webhook Workflows' },
    { id: 'whatsappCalling',  label: 'WhatsApp Calling' },
  ],
  dataCollection: [
    { id: 'userInputFlows', label: 'User Input Flows' },
    { id: 'customFields',   label: 'Custom Variables' },
    { id: 'contactLabels',  label: 'Contact Labels' },
    { id: 'segments',       label: 'Subscriber Segments' },
  ],
  ai: [
    { id: 'aiPrompts',   label: 'AI Prompts & Training' },
    { id: 'aiBotRules',  label: 'AI Bot Rules' },
    { id: 'aiModels',    label: 'ChatGPT / Gemini Models' },
    { id: 'knowledgeBase', label: 'Knowledge Base / Files' },
  ],
  engagement: [
    { id: 'commentAutomation', label: 'Comment Automation' },
    { id: 'iceBreakers',       label: 'Ice Breakers & Welcome' },
    { id: 'storyMentions',     label: 'Story Mentions Reply' },
    { id: 'actionMenus',       label: 'Action Buttons & Menus' },
  ],
  commerce: [
    { id: 'catalogSync',      label: 'Product Catalog Sync' },
    { id: 'productMessages',  label: 'Product Messages' },
    { id: 'orderConfirm',     label: 'Order Confirmations' },
    { id: 'paymentLinks',     label: 'Payment Links & Cart' },
  ],
  integrations: [
    { id: 'webhooksOutbound', label: 'Webhooks Outbound' },
    { id: 'googleSheets',     label: 'Google Sheets Sync' },
    { id: 'crmConnectors',    label: 'CRM Connectors' },
    { id: 'zapierMake',       label: 'Zapier / Make' },
  ],
};

/* ─── Starter Templates ─── */
const STARTER_TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Canvas',
    description: 'Start from scratch and design a custom multi-step flow.',
    icon: Sparkles,
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
    description: 'Greets subscriber on keyword or first message with interactive buttons.',
    icon: Bot,
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
          message: `👋 Welcome to ${name || 'our bot'}! Please pick an option below:`,
          buttons: ['🛍️ Browse Products', '💰 View Pricing', '💬 Talk to Agent'],
        },
      },
    ],
    edges: () => [
      { id: 'e_start_btn', source: 'start_1', target: 'btn_1', type: 'smoothstep', animated: true },
    ],
  },
  {
    id: 'lead_capture',
    title: 'Lead Capture & Booking',
    description: 'Collects visitor Name, Email, and Phone number automatically.',
    icon: UserCheck,
    color: '#f59e0b',
    nodes: (name) => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 320, y: 60 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['quote', 'consult', 'booking'], match_type: 'contains' },
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
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'text_intro', type: 'smoothstep', animated: true },
      { id: 'e2', source: 'text_intro', target: 'collect_name', type: 'smoothstep', animated: true },
    ],
  },
];

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' });
}

function formatUniqueId(id) {
  if (!id) return '2072078';
  return String(2000000 + Number(id) * 31);
}

export default function BotManagerPage() {
  const navigate = useNavigate();

  // Data
  const [integrations, setIntegrations] = useState([]);
  const [flows, setFlows] = useState([]);
  const [commentRules, setCommentRules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected State
  const [selectedAccount, setSelectedAccount] = useState(null); // null = "All Accounts" or specific integration object
  const [accountSearch, setAccountSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('ALL');

  // Category & SubTab Navigation
  const [activeCategory, setActiveCategory] = useState('automation');
  const [activeSubTab, setActiveSubTab] = useState('keywordReplies');

  // Table Filter & Search
  const [folderFilter, setFolderFilter] = useState('All Folders');
  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowPlatform, setNewFlowPlatform] = useState('WHATSAPP');
  const [creating, setCreating] = useState(false);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);

  // AI settings mock state
  const [aiPrompt, setAiPrompt] = useState('You are a helpful and polite customer support AI assistant for our brand.');
  const [aiModel, setAiModel] = useState('gpt-4o');

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ─── Load Data ─── */
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [integsRes, flowsRes, commentRes, templRes] = await Promise.allSettled([
        integrationAPI.getAll(),
        flowAPI.getAll(),
        channelAPI.getFBCommentRules(),
        templateAPI.getWATemplates(),
      ]);

      let integs = [];
      if (integsRes.status === 'fulfilled') {
        integs = integsRes.value.data?.integrations || [];
        setIntegrations(integs);
      }

      if (flowsRes.status === 'fulfilled') {
        setFlows(flowsRes.value.data?.flows || []);
      }

      if (commentRes.status === 'fulfilled') {
        setCommentRules(commentRes.value.data?.rules || []);
      }

      if (templRes.status === 'fulfilled') {
        setTemplates(templRes.value.data?.templates || []);
      }

      // Default select the first account if available
      if (integs.length > 0 && !selectedAccount) {
        setSelectedAccount(integs[0]);
      } else if (!selectedAccount) {
        setSelectedAccount({ id: 'all', name: 'All Connected Channels', platform: 'WHATSAPP', is_active: 1 });
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load bot manager data', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Filter sub-tabs dynamically per channel platform (Message Templates only for WhatsApp)
  const currentSubTabs = useMemo(() => {
    const list = SUB_TABS[activeCategory] || [];
    const platform = (selectedAccount?.platform || 'WHATSAPP').toUpperCase();
    return list.filter((sub) => {
      // Message Templates & WhatsApp specific tools ONLY for WhatsApp
      if (['messageTemplates', 'whatsappCalling', 'catalogSync', 'productMessages'].includes(sub.id)) {
        return platform === 'WHATSAPP';
      }
      // Comments / Story mentions ONLY for Facebook / Instagram
      if (['commentAutomation', 'storyMentions'].includes(sub.id)) {
        return ['FACEBOOK', 'INSTAGRAM'].includes(platform);
      }
      return true;
    });
  }, [activeCategory, selectedAccount]);

  // Sync category change to reset subtab
  const handleCategoryChange = (catId) => {
    setActiveCategory(catId);
    const list = SUB_TABS[catId] || [];
    const platform = (selectedAccount?.platform || 'WHATSAPP').toUpperCase();
    const available = list.filter((sub) => {
      if (['messageTemplates', 'whatsappCalling', 'catalogSync', 'productMessages'].includes(sub.id)) {
        return platform === 'WHATSAPP';
      }
      if (['commentAutomation', 'storyMentions'].includes(sub.id)) {
        return ['FACEBOOK', 'INSTAGRAM'].includes(platform);
      }
      return true;
    });
    if (available.length > 0) {
      setActiveSubTab(available[0].id);
    }
  };

  // When selected account or platform changes, ensure activeSubTab is valid for the current platform
  useEffect(() => {
    const list = SUB_TABS[activeCategory] || [];
    const platform = (selectedAccount?.platform || 'WHATSAPP').toUpperCase();
    const available = list.filter((sub) => {
      if (['messageTemplates', 'whatsappCalling', 'catalogSync', 'productMessages'].includes(sub.id)) {
        return platform === 'WHATSAPP';
      }
      if (['commentAutomation', 'storyMentions'].includes(sub.id)) {
        return ['FACEBOOK', 'INSTAGRAM'].includes(platform);
      }
      return true;
    });

    const isCurrentValid = available.some((sub) => sub.id === activeSubTab);
    if (!isCurrentValid && available.length > 0) {
      setActiveSubTab(available[0].id);
    }
  }, [selectedAccount, activeCategory, activeSubTab]);



  /* ─── Filter Accounts in Left Nav ─── */
  const filteredAccounts = useMemo(() => {
    return integrations.filter((acc) => {
      const p = (acc.platform || 'WHATSAPP').toUpperCase();
      const matchesChannel = channelFilter === 'ALL' || p === channelFilter;
      const q = accountSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (acc.name && acc.name.toLowerCase().includes(q)) ||
        (acc.wa_display_phone && acc.wa_display_phone.includes(q)) ||
        (acc.wa_phone_number_id && acc.wa_phone_number_id.includes(q)) ||
        (acc.fb_page_name && acc.fb_page_name.toLowerCase().includes(q)) ||
        (acc.ig_username && acc.ig_username.toLowerCase().includes(q));
      return matchesChannel && matchesSearch;
    });
  }, [integrations, channelFilter, accountSearch]);

  // Channel counts for pills
  const channelCounts = useMemo(() => {
    const counts = { ALL: integrations.length, WHATSAPP: 0, TELEGRAM: 0, FACEBOOK: 0, INSTAGRAM: 0, WEBCHAT: 0 };
    integrations.forEach((i) => {
      const p = (i.platform || 'WHATSAPP').toUpperCase();
      if (counts[p] !== undefined) counts[p]++;
    });
    return counts;
  }, [integrations]);

  /* ─── Filter Flows for Selected Account ─── */
  const displayedFlows = useMemo(() => {
    return flows.filter((f) => {
      // 1. Filter by Selected Account or Channel
      if (selectedAccount && selectedAccount.id !== 'all') {
        // If flow is bound to a specific integration_id, it must match this selected account
        if (f.integration_id) {
          if (String(f.integration_id) !== String(selectedAccount.id)) {
            return false;
          }
        } else {
          // If flow has no integration_id, it must match the selected account's platform
          const flowPlat = (f.platform || '').toUpperCase();
          const accPlat = (selectedAccount.platform || '').toUpperCase();
          if (flowPlat && accPlat && flowPlat !== accPlat) {
            return false;
          }
        }
      } else if (channelFilter && channelFilter !== 'ALL') {
        const flowPlat = (f.platform || '').toUpperCase();
        if (flowPlat !== channelFilter.toUpperCase()) {
          return false;
        }
      }

      // 2. Table search filtering
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const matchesName = f.name && f.name.toLowerCase().includes(q);
        const matchesKeyword = f.trigger_keyword && f.trigger_keyword.toLowerCase().includes(q);
        if (!matchesName && !matchesKeyword) return false;
      }
      return true;
    });
  }, [flows, selectedAccount, channelFilter, tableSearch]);


  /* ─── Create Flow ─── */
  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) {
      showToast('Please enter a flow name', 'error');
      return;
    }
    setCreating(true);
    try {
      const template = STARTER_TEMPLATES.find((t) => t.id === selectedTemplate) || STARTER_TEMPLATES[0];
      const nodes = template.nodes(newFlowName);
      const edges = template.edges(newFlowName);

      const targetPlatform = selectedAccount?.platform || newFlowPlatform || 'WHATSAPP';
      const targetIntegId = selectedAccount?.id !== 'all' ? selectedAccount?.id : null;

      const res = await flowAPI.create({
        name: newFlowName.trim(),
        platform: targetPlatform,
        integrationId: targetIntegId,
        triggerKeyword: 'hi,hello',
        triggerType: 'KEYWORD',
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        isActive: 1,
      });

      showToast(`Flow "${newFlowName}" created!`);
      setShowCreateModal(false);
      setNewFlowName('');
      const newId = res.data?.flow?.id || res.data?.id;
      if (newId) {
        navigate(`/flows/${newId}`);
      } else {
        loadAllData();
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to create flow', 'error');
    } finally {
      setCreating(false);
    }
  };

  /* ─── Delete Flow ─── */
  const handleDeleteFlow = async (flowId, flowName, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Delete flow "${flowName}"?`)) return;
    try {
      await flowAPI.delete(flowId);
      setFlows((prev) => prev.filter((f) => f.id !== flowId));
      showToast('Flow deleted');
    } catch {
      showToast('Failed to delete flow', 'error');
    }
  };

  const currentPlatformInfo = getPlatformInfo(selectedAccount?.platform);

  return (
    <AppLayout>
      <style>{`
        .bm-root {
          display: flex;
          height: calc(100vh - 60px);
          width: 100%;
          margin: 0;
          padding: 0;
          background: #f4f6fb;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* ── Left Navigation Column ── */
        .bm-accounts-nav {
          width: 280px;
          flex-shrink: 0;
          background: #ffffff;
          border-right: 1px solid #e4e4f0;
          display: flex;
          flex-direction: column;
          box-shadow: 2px 0 6px rgba(0,0,0,0.02);
        }
        .bm-nav-header {
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f0f0fa;
        }
        .bm-nav-title {
          font-size: 0.96rem;
          font-weight: 800;
          color: #1a1a2e;
        }
        .bm-add-bot-btn {
          font-size: 0.78rem;
          font-weight: 700;
          color: #6366f1;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 6px;
          padding: 5px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .bm-add-bot-btn:hover {
          background: #6366f1;
          color: #ffffff;
        }
        .bm-search-wrap {
          padding: 10px 14px;
          position: relative;
        }
        .bm-search-input {
          width: 100%;
          padding: 7px 10px 7px 32px;
          border-radius: 8px;
          border: 1px solid #e4e4f0;
          background: #f8f8fc;
          font-size: 0.8rem;
          color: #1a1a2e;
          outline: none;
        }
        .bm-channel-pills {
          display: flex;
          gap: 4px;
          padding: 0 14px 10px;
          overflow-x: auto;
          border-bottom: 1px solid #f0f0fa;
          scrollbar-width: none;
        }
        .bm-channel-pills::-webkit-scrollbar { display: none; }
        .bm-pill {
          padding: 4px 8px;
          border-radius: 14px;
          font-size: 0.72rem;
          font-weight: 600;
          border: 1px solid #e4e4f0;
          background: #ffffff;
          color: #5c5c80;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .bm-pill.active {
          background: #1a1a2e;
          color: #ffffff;
          border-color: #1a1a2e;
        }
        .bm-account-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .bm-account-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          cursor: pointer;
          border: 1.5px solid transparent;
          background: transparent;
          transition: all 0.15s;
        }
        .bm-account-item:hover {
          background: #f8f8fc;
        }
        .bm-account-item.active {
          background: #f0f2ff;
          border-color: #c7d2fe;
        }
        .bm-avatar-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-weight: 700;
          font-size: 0.9rem;
        }

        /* ── Main Work Area ── */
        .bm-main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 18px 24px;
        }

        /* ── Top Account Header ── */
        .bm-top-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .bm-account-details {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .bm-account-details h2 {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0;
          color: #1a1a2e;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .bm-account-details .sub {
          font-size: 0.78rem;
          color: #5c5c80;
          margin-top: 2px;
        }
        .bm-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
        }

        /* ── Primary Category Tabs ── */
        .bm-category-tabs {
          display: flex;
          gap: 24px;
          border-bottom: 1px solid #e4e4f0;
          margin-bottom: 14px;
        }
        .bm-cat-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 0;
          font-size: 0.88rem;
          font-weight: 600;
          color: #5c5c80;
          border: none;
          background: none;
          cursor: pointer;
          border-bottom: 2.5px solid transparent;
          transition: all 0.15s;
        }
        .bm-cat-tab:hover {
          color: #1a1a2e;
        }
        .bm-cat-tab.active {
          color: #6366f1;
          border-bottom-color: #6366f1;
          font-weight: 700;
        }

        /* ── Secondary Sub-Tabs (Pills) ── */
        .bm-subtabs-row {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: none;
        }
        .bm-subtabs-row::-webkit-scrollbar { display: none; }
        .bm-subtab-pill {
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          border: 1px solid #e4e4f0;
          background: #ffffff;
          color: #5c5c80;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .bm-subtab-pill:hover {
          background: #f8f8fc;
          color: #1a1a2e;
        }
        .bm-subtab-pill.active {
          background: #6366f1;
          color: #ffffff;
          border-color: #6366f1;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
        }

        /* ── Work Area Content Box ── */
        .bm-content-card {
          background: #ffffff;
          border: 1px solid #e4e4f0;
          border-radius: 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.03);
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .bm-card-header {
          padding: 16px 20px;
          border-bottom: 1px solid #f0f0fa;
        }
        .bm-card-title {
          font-size: 1rem;
          font-weight: 800;
          color: #1a1a2e;
          margin: 0;
        }
        .bm-card-sub {
          font-size: 0.78rem;
          color: #5c5c80;
          margin: 3px 0 0 0;
        }
        .bm-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: #fafbfe;
          border-bottom: 1px solid #e4e4f0;
          gap: 12px;
          flex-wrap: wrap;
        }
        .bm-table th {
          padding: 12px 16px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #5c5c80;
          border-bottom: 1px solid #e4e4f0;
          background: #f8f8fc;
          white-space: nowrap;
          text-align: left;
        }
        .bm-table td {
          padding: 13px 16px;
          font-size: 0.82rem;
          border-bottom: 1px solid #e4e4f0;
          vertical-align: middle;
          background: #ffffff;
        }
        .bm-table tr:hover td {
          background: #fbfbfe;
        }
        .bm-row-action {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid #e4e4f0;
          background: #ffffff;
          color: #5c5c80;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .bm-row-action:hover {
          border-color: #6366f1;
          color: #6366f1;
          background: rgba(99, 102, 241, 0.08);
          transform: translateY(-1px);
        }
        .bm-row-action.delete:hover {
          border-color: #ef4444;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
        }
      `}</style>

      <div className="bm-root">
        {/* ═══════════════════════════════════════════════════════════════════
            LEFT NAVIGATION: BOTS / ACCOUNTS
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="bm-accounts-nav">
          {/* Header */}
          <div className="bm-nav-header">
            <div className="bm-nav-title">Bots / Accounts</div>
            <button
              className="bm-add-bot-btn"
              onClick={() => {
                setShowCreateModal(true);
              }}
            >
              <Plus size={13} /> Add Bot
            </button>
          </div>

          {/* Search Box */}
          <div className="bm-search-wrap">
            <Search size={14} color="#9999bb" style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by name or number..."
              className="bm-search-input"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
            />
          </div>

          {/* Channel Filter Pills */}
          <div className="bm-channel-pills">
            <button
              className={`bm-pill ${channelFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setChannelFilter('ALL')}
            >
              All {channelCounts.ALL}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'WHATSAPP' ? 'active' : ''}`}
              onClick={() => setChannelFilter('WHATSAPP')}
            >
              💬 {channelCounts.WHATSAPP}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'TELEGRAM' ? 'active' : ''}`}
              onClick={() => setChannelFilter('TELEGRAM')}
            >
              ✈️ {channelCounts.TELEGRAM}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'FACEBOOK' ? 'active' : ''}`}
              onClick={() => setChannelFilter('FACEBOOK')}
            >
              📘 {channelCounts.FACEBOOK}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'INSTAGRAM' ? 'active' : ''}`}
              onClick={() => setChannelFilter('INSTAGRAM')}
            >
              📸 {channelCounts.INSTAGRAM}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'WEBCHAT' ? 'active' : ''}`}
              onClick={() => setChannelFilter('WEBCHAT')}
            >
              🌐 {channelCounts.WEBCHAT}
            </button>
          </div>

          {/* Accounts List */}
          <div className="bm-account-list">
            {filteredAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 14px', color: '#9999bb', fontSize: '0.8rem' }}>
                No accounts found.
              </div>
            ) : (
              filteredAccounts.map((acc) => {
                const pInfo = getPlatformInfo(acc.platform);
                const IconComponent = pInfo.icon;
                const isSelected = selectedAccount?.id === acc.id;
                const identifier = acc.wa_display_phone || acc.wa_phone_number_id || acc.fb_page_id || acc.ig_username || (acc.tiktok_username ? `@${acc.tiktok_username}` : acc.tiktok_open_id) || `${pInfo.label} Account`;

                return (
                  <div
                    key={acc.id}
                    className={`bm-account-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedAccount(acc)}
                  >
                    <div
                      className="bm-avatar-circle"
                      style={{ background: pInfo.bg, color: pInfo.color }}
                    >
                      <IconComponent size={18} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1a1a2e', truncate: true }}>
                        {acc.name || acc.fb_page_name || 'Nexa Bot'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#5c5c80', marginTop: 1, truncate: true }}>
                        {identifier}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            MAIN WORK AREA (SELECTED BOT DASHBOARD)
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="bm-main-content">
          {/* Top Header of Selected Account */}
          <div className="bm-top-header">
            <div className="bm-account-details">
              <div
                className="bm-avatar-circle"
                style={{
                  width: 44,
                  height: 44,
                  background: currentPlatformInfo.bg,
                  color: currentPlatformInfo.color,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                {React.createElement(currentPlatformInfo.icon, { size: 22 })}
              </div>

              <div>
                <h2>
                  {selectedAccount?.name || selectedAccount?.fb_page_name || 'All Connected Bots'}
                  <span className="bm-status-badge">● Active</span>
                </h2>
                <div className="sub">
                  {selectedAccount?.wa_display_phone || (selectedAccount?.wa_phone_number_id ? `ID: ${selectedAccount.wa_phone_number_id}` : (selectedAccount?.fb_page_name || `${currentPlatformInfo.label} Channel`))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
              <button
                onClick={() => setShowSettingsModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid #e4e4f0',
                  background: '#ffffff',
                  color: '#1a1a2e',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Settings size={14} /> Bot Settings
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowOptionsDropdown((prev) => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: '1px solid #e4e4f0',
                    background: '#ffffff',
                    color: '#5c5c80',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Options <ChevronDown size={13} />
                </button>

                {showOptionsDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '115%',
                      background: '#ffffff',
                      border: '1px solid #e4e4f0',
                      borderRadius: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                      zIndex: 100,
                      width: 170,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() => {
                        setShowOptionsDropdown(false);
                        setShowCreateModal(true);
                      }}
                      style={{ padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#1a1a2e' }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f8f8fc'}
                      onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                      <Plus size={13} color="#6366f1" /> Create Flow
                    </div>
                    <div
                      onClick={() => {
                        setShowOptionsDropdown(false);
                        loadAllData();
                        showToast('Refreshed all bot flows');
                      }}
                      style={{ padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#1a1a2e', borderTop: '1px solid #f0f0fa' }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f8f8fc'}
                      onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                      <RefreshCw size={13} color="#10b981" /> Refresh Account
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Primary Category Tabs */}
          <div className="bm-category-tabs">
            {MAIN_CATEGORIES.map((cat) => {
              const CatIcon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  className={`bm-cat-tab ${isActive ? 'active' : ''}`}
                  onClick={() => handleCategoryChange(cat.id)}
                >
                  <CatIcon size={16} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Secondary Sub-Tabs (Pills) */}
          <div className="bm-subtabs-row">
            {currentSubTabs.map((sub) => (
              <button
                key={sub.id}
                className={`bm-subtab-pill ${activeSubTab === sub.id ? 'active' : ''}`}
                onClick={() => setActiveSubTab(sub.id)}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 1: KEYWORD REPLIES (AUTOMATION)
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'automation' && activeSubTab === 'keywordReplies' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Keyword Replies</h3>
                <p className="bm-card-sub">
                  Create and manage keyword based replies and automate multi-step conversational visual flows.
                </p>
              </div>

              {/* Action Bar */}
              <div className="bm-action-bar">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 280 }}>
                  <select
                    value={folderFilter}
                    onChange={(e) => setFolderFilter(e.target.value)}
                    style={{
                      padding: '7px 28px 7px 10px',
                      borderRadius: 8,
                      border: '1px solid #e4e4f0',
                      background: '#ffffff',
                      fontSize: '0.82rem',
                      color: '#1a1a2e',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="All Folders">All Folders</option>
                    <option value="Onboarding">Onboarding</option>
                    <option value="Support">Support</option>
                    <option value="Sales">Sales</option>
                  </select>

                  <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                    <Search size={14} color="#9999bb" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search & Enter..."
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px 7px 30px',
                        borderRadius: 8,
                        border: '1px solid #e4e4f0',
                        background: '#ffffff',
                        fontSize: '0.82rem',
                        color: '#1a1a2e',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    title="Watch Video Tutorial"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      border: '1px solid #e4e4f0',
                      background: '#ffffff',
                      color: '#5c5c80',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Video size={16} />
                  </button>

                  <button
                    onClick={() => setShowCreateModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      borderRadius: 8,
                      background: '#6366f1',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    <Plus size={15} /> Create
                  </button>
                </div>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflowX: 'auto' }}>
                <table className="bm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>UNIQUE ID</th>
                      <th>REFERENCE NAME</th>
                      <th>UPDATED AT</th>
                      <th style={{ textAlign: 'right', paddingRight: 24 }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 60, textAlign: 'center' }}>
                          <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                          <p style={{ color: '#5c5c80', fontSize: '0.82rem' }}>Loading keyword bot replies...</p>
                        </td>
                      </tr>
                    ) : displayedFlows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 60, textAlign: 'center' }}>
                          <div style={{ fontSize: '2rem', marginBottom: 6 }}>🤖</div>
                          <h4 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '0 0 4px 0', color: '#1a1a2e' }}>
                            No keyword reply flows yet
                          </h4>
                          <p style={{ color: '#5c5c80', fontSize: '0.8rem', margin: '0 0 14px 0' }}>
                            Click "+ Create" to build your first interactive visual chat bot flow.
                          </p>
                          <button
                            onClick={() => setShowCreateModal(true)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: 8,
                              background: '#6366f1',
                              color: '#ffffff',
                              border: 'none',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                            }}
                          >
                            + Create Flow
                          </button>
                        </td>
                      </tr>
                    ) : (
                      displayedFlows.map((flow, idx) => (
                        <tr key={flow.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/flows/${flow.id}`)}>
                          <td style={{ fontWeight: 700, color: '#5c5c80' }}>
                            {idx + 1}
                          </td>

                          <td>
                            <code style={{ fontSize: '0.8rem', color: '#6366f1', background: '#f0f2ff', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                              {formatUniqueId(flow.id)}
                            </code>
                          </td>

                          <td>
                            <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: '0.86rem' }}>
                              {flow.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#9999bb', marginTop: 1 }}>
                              Trigger: <strong>{flow.trigger_keyword || 'hi, hello'}</strong> ({flow.platform || 'WHATSAPP'})
                            </div>
                          </td>

                          <td style={{ color: '#5c5c80', fontSize: '0.8rem' }}>
                            {formatDate(flow.updated_at || flow.created_at)}
                          </td>

                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', paddingRight: 20 }}>
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              <button
                                className="bm-row-action"
                                title="Open Live Visual Builder"
                                onClick={() => navigate(`/flows/${flow.id}`)}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                className="bm-row-action"
                                title="Test in Live Chat"
                                onClick={() => navigate('/inbox')}
                              >
                                <MessageSquare size={13} />
                              </button>
                              <button
                                className="bm-row-action"
                                title="Move to Folder"
                                onClick={() => showToast('Moved to folder')}
                              >
                                <Folder size={13} />
                              </button>
                              <button
                                className="bm-row-action delete"
                                title="Delete Flow"
                                onClick={(e) => handleDeleteFlow(flow.id, flow.name, e)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer / Pagination */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderTop: '1px solid #e4e4f0',
                  background: '#fafbfe',
                  fontSize: '0.8rem',
                  color: '#5c5c80',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #e4e4f0', background: '#ffffff' }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>1–{Math.min(displayedFlows.length, pageSize)} of {displayedFlows.length}</span>
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e4e4f0', background: '#ffffff', cursor: 'pointer' }}>
                    Previous
                  </button>
                  <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #6366f1', background: '#6366f1', color: '#fff', fontWeight: 700 }}>
                    1
                  </button>
                  <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e4e4f0', background: '#ffffff', cursor: 'pointer' }}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 2: COMMENT AUTOMATION (ENGAGEMENT)
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'engagement' && activeSubTab === 'commentAutomation' && (
            <CommentAutomationManager defaultPlatform={selectedAccount?.platform || 'FACEBOOK'} />
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 3: AI PROMPTS & BOT RULES (AI)
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'ai' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">AI Knowledge Base & Training Prompt</h3>
                <p className="bm-card-sub">
                  Configure smart generative replies powered by OpenAI ChatGPT, Google Gemini & Claude.
                </p>
              </div>

              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                    AI Model Engine
                  </label>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e4e4f0', width: 280, fontSize: '0.85rem' }}
                  >
                    <option value="gpt-4o">OpenAI GPT-4o (Recommended)</option>
                    <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                    System Instructions & Brand Knowledge
                  </label>
                  <textarea
                    rows={6}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e4e4f0', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => showToast('AI instructions saved!')}
                    style={{ padding: '8px 20px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Save AI Settings
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 2: WHATSAPP MESSAGE TEMPLATES (WHATSAPP EXCLUSIVE)
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'automation' && activeSubTab === 'messageTemplates' && (selectedAccount?.platform || '').toUpperCase() === 'WHATSAPP' && (
            <WhatsAppTemplateManager
              selectedAccount={selectedAccount}
              showToast={showToast}
            />
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 4: DEFAULT FALLBACK VIEW FOR OTHER SUB-TABS
              ═════════════════════════════════════════════════════════════════ */}
          {!['keywordReplies', 'messageTemplates'].includes(activeSubTab) && activeCategory !== 'engagement' && activeCategory !== 'ai' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">{activeSubTab.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <p className="bm-card-sub">
                  Configure automated settings and workflows for {selectedAccount?.name || 'this account'}.
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#5c5c80' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>⚡</div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px 0', color: '#1a1a2e' }}>
                  {activeSubTab.replace(/([A-Z])/g, ' $1').trim()} Module
                </h4>
                <p style={{ fontSize: '0.84rem', maxWidth: 400, margin: '0 auto 16px' }}>
                  This automation feature is enabled for {currentPlatformInfo.label}. Create visual flow triggers or integrate endpoints.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  + Add Flow Trigger
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Flow Modal ── */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 580,
              maxWidth: '92vw',
              background: '#ffffff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
              border: '1px solid #e4e4f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} color="#6366f1" /> Create Conversational Flow
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid #e4e4f0',
                  background: '#f8f8fc',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                  Flow Reference Name *
                </label>
                <input
                  required
                  className="form-input w-full"
                  placeholder="e.g. Lead Qualification & Pricing"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                  Starter Template
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {STARTER_TEMPLATES.map((tmpl) => {
                    const TIcon = tmpl.icon;
                    const isSel = selectedTemplate === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        onClick={() => setSelectedTemplate(tmpl.id)}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: `1.5px solid ${isSel ? '#6366f1' : '#e4e4f0'}`,
                          background: isSel ? '#f0f2ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.84rem', color: isSel ? '#4f46e5' : '#1a1a2e', marginBottom: 4 }}>
                          <TIcon size={16} color={tmpl.color} /> {tmpl.title}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#5c5c80', lineHeight: 1.4 }}>
                          {tmpl.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e4e4f0', background: '#ffffff', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateFlow}
                  disabled={creating}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 8,
                    background: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                >
                  {creating ? 'Building...' : 'Launch Visual Flow Builder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bot Settings Modal ── */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 500,
              maxWidth: '92vw',
              background: '#ffffff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
              border: '1px solid #e4e4f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color="#6366f1" /> Bot Configuration
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid #e4e4f0',
                  background: '#f8f8fc',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                  Welcome Greeting Message
                </label>
                <textarea
                  rows={2}
                  className="form-input w-full"
                  defaultValue="Hello! Welcome to our official support. How can we help you today?"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                  Away / Offline Auto-reply
                </label>
                <textarea
                  rows={2}
                  className="form-input w-full"
                  defaultValue="We are currently away. Our team will get back to you during business hours."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e4e4f0', background: '#ffffff', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    showToast('Bot settings updated!');
                  }}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 8,
            background: toast.type === 'error' ? '#ef4444' : '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.85rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
