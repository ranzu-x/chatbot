import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { useAuth } from '../../Provider/AuthContext';
import { flowAPI, integrationAPI, botAPI, templateAPI } from '../../services/api';
import WhatsAppTemplateManager from '../../Components/Templates/WhatsAppTemplateManager';
import FacebookUtilityTemplateManager from '../../Components/Templates/FacebookUtilityTemplateManager';
import ChatWidgetManager from '../../Components/Engagement/ChatWidgetManager';
import SequenceMessageReport from '../../Components/Sequences/SequenceMessageReport';
import UserInputFlowManagerList from '../../Components/UserInputFlows/UserInputFlowManagerList';
import HttpApiCampaignManagerList from '../../Components/HttpApi/HttpApiCampaignManagerList';
import WhatsAppFlowManagerList from '../../Components/WhatsAppFlows/WhatsAppFlowManagerList';
import StoreConnectionsManager from '../../Components/Commerce/StoreConnectionsManager';
import CommerceCampaignsManager from '../../Components/Commerce/CommerceCampaignsManager';
import CommerceActivity from '../../Components/Commerce/CommerceActivity';
import { humanizeBotError, cleanRawMessage } from '../../utils/humanizeBotError';
import AIAgentManagerList from '../../Components/AIAgents/AIAgentManagerList';
import AIReplySettingsPanel from '../../Components/AIAgents/AIReplySettingsPanel';
import Swal from 'sweetalert2';
import {
  Bot,
  AlertCircle,
  AlertTriangle,
  Check,
  ShieldAlert,
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
  WEBCHAT:   { label: 'Webchat',   icon: Globe,         color: 'var(--channel-webchat)', bg: 'rgba(99, 102, 241, 0.12)', border: 'var(--channel-webchat)' },
};

function getPlatformInfo(p) {
  const norm = (p || 'WHATSAPP').toUpperCase();
  return PLATFORM_MAP[norm] || { label: norm, icon: MessageSquare, color: 'var(--text-tertiary)', bg: 'rgba(100, 116, 139, 0.12)', border: 'var(--text-tertiary)' };
}

/* ─── Primary Categories & Sub-tabs ─── */
const MAIN_CATEGORIES = [
  { id: 'automation',     label: 'Bot Manager',     icon: Zap },
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
    { id: 'httpApiCampaigns', label: 'HTTP API Campaigns' },
    { id: 'quickActions',     label: 'Quick Actions' },
    { id: 'outboundActions',  label: 'Outbound Actions' },
    { id: 'webhookWorkflows', label: 'Webhook Workflows' },
    { id: 'whatsappCalling',  label: 'WhatsApp Calling' },
  ],
  dataCollection: [
    { id: 'customFields',   label: 'Custom Variables' },
    { id: 'contactLabels',  label: 'Contact Labels' },
    { id: 'segments',       label: 'Subscriber Segments' },
    { id: 'userInputFlows', label: 'User Input Flows' },
    { id: 'whatsappFlows',  label: 'WhatsApp Flows' },
  ],
  ai: [
    { id: 'aiReplySettings', label: 'AI Reply Settings' },
    { id: 'activeAgents',    label: 'Active Agents' },
    { id: 'agents',          label: 'Agents' },
  ],
  engagement: [
    // Comment Automation moved out to its own top-level page
    // (/comment-automation, Sidebar.jsx) — see CommentAutomationPage.jsx.
    { id: 'followUpSequences', label: 'Sequences' },
    { id: 'iceBreakers',       label: 'Ice Breakers & Welcome' },
    { id: 'storyMentions',     label: 'Story Mentions Reply' },
    { id: 'actionMenus',       label: 'Action Buttons & Menus' },
    { id: 'chatWidget',        label: 'Chat Widget' },
  ],
  commerce: [
    { id: 'commerceCampaigns', label: 'Automation Campaigns' },
    { id: 'commerceActivity',  label: 'Orders & Activity' },
    { id: 'storeConnections',  label: 'Store Connections' },
    { id: 'catalogSync',       label: 'Product Catalog Sync' },
    { id: 'productMessages',   label: 'Product Messages' },
    { id: 'paymentLinks',      label: 'Payment Links & Cart' },
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
        position: { x: 80, y: 120 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: [], match_type: 'contains' },
      },
      {
        id: 'text_1',
        type: 'text',
        position: { x: 440, y: 120 },
        data: { label: 'Welcome Text', message: `Hello! Welcome to ${name || 'our service'}. How can we assist you today?`, buttons: [] },
      },
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'text_1', type: 'default', animated: false },
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
        position: { x: 80, y: 120 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['start', 'menu'], match_type: 'contains' },
      },
      {
        id: 'btn_1',
        type: 'buttons',
        position: { x: 440, y: 120 },
        data: {
          label: 'Text Message',
          message: `👋 Welcome to ${name || 'our bot'}! Please pick an option below:`,
          buttons: ['🛍️ Browse Products', '💰 View Pricing', '💬 Talk to Agent'],
        },
      },
    ],
    edges: () => [
      { id: 'e_start_btn', source: 'start_1', target: 'btn_1', type: 'default', animated: false },
    ],
  },
  {
    id: 'lead_capture',
    title: 'Lead Capture & Booking',
    description: 'Collects visitor Name, Email, and Phone number automatically.',
    icon: UserCheck,
    color: '#f59e0b',
    nodes: () => [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 80, y: 120 },
        data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: ['quote', 'consult', 'booking'], match_type: 'contains' },
      },
      {
        id: 'text_intro',
        type: 'text',
        position: { x: 440, y: 120 },
        data: { label: 'Intro Prompt', message: '✨ Let’s get you scheduled! May I know your full name?', buttons: [] },
      },
      {
        id: 'collect_name',
        type: 'collectInput',
        position: { x: 800, y: 120 },
        data: { label: 'Capture Name', variableName: 'contact_name', text: 'Please type your name:' },
      },
    ],
    edges: () => [
      { id: 'e1', source: 'start_1', target: 'text_intro', type: 'default', animated: false },
      { id: 'e2', source: 'text_intro', target: 'collect_name', type: 'default', animated: false },
    ],
  },
];

function formatUniqueId(id) {
  if (!id) return 'BOT-0000';
  const padded = String(id).padStart(4, '0');
  return `BOT-${padded}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatLogDateTime(dateStr) {
  if (!dateStr) return { date: '—', time: '—', relative: '' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { date: '—', time: '—', relative: '' };

  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative = '';
  if (diffSec < 60) relative = 'Just now';
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffHours < 24) relative = `${diffHours}h ago`;
  else relative = `${diffDays}d ago`;

  return { date, time, relative };
}

export default function BotManagerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Data
  const [integrations, setIntegrations] = useState([]);
  const [flows, setFlows] = useState([]);
  const [, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected State
  const [selectedAccount, setSelectedAccount] = useState(null); // null = "All Accounts" or specific integration object
  const [accountSearch, setAccountSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState(() => location.state?.channelFilter || 'ALL');

  // Category & SubTab Navigation
  const [activeCategory, setActiveCategory] = useState(() => location.state?.activeCategory || 'automation');
  const [activeSubTab, setActiveSubTab] = useState(() => location.state?.activeSubTab || 'keywordReplies');

  // Table Filter & Search
  const [folderFilter, setFolderFilter] = useState(() => location.state?.folderFilter || 'All Folders');
  const [tableSearch, setTableSearch] = useState(() => location.state?.tableSearch || '');
  const [currentPage, setCurrentPage] = useState(() => location.state?.currentPage || 1);
  const [pageSize, setPageSize] = useState(10);

  // Restore selectedAccount from previous navigation state if available
  const restoredAccountRef = useRef(false);
  useEffect(() => {
    if (!restoredAccountRef.current && location.state?.selectedAccountId && integrations.length > 0) {
      const found = integrations.find((i) => String(i.id) === String(location.state.selectedAccountId));
      if (found) {
        setSelectedAccount(found);
        restoredAccountRef.current = true;
      }
    }
  }, [integrations, location.state]);

  // Navigate to flow builder while retaining page origin state
  const openFlowBuilder = useCallback((flowId) => {
    navigate(`/flows/${flowId}`, {
      state: {
        from: location.pathname + location.search,
        label: 'Automations',
        activeCategory,
        activeSubTab,
        selectedAccountId: selectedAccount?.id || null,
        channelFilter,
        folderFilter,
        tableSearch,
        currentPage,
      },
    });
  }, [navigate, location, activeCategory, activeSubTab, selectedAccount, channelFilter, folderFilter, tableSearch, currentPage]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState('general');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowPlatform] = useState('WHATSAPP');
  const [creating, setCreating] = useState(false);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);

  // Clone Flow Modal State
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [flowToClone, setFlowToClone] = useState(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneTargetIntegId, setCloneTargetIntegId] = useState('');
  const [cloning, setCloning] = useState(false);

  // Error Log Modal State — scoped entirely by the account selected in the
  // left rail (see loadErrorLogs). There is no separate platform filter: one
  // connected account is always exactly one platform, so a platform tab on
  // top of an already-account-scoped list would just be a second control
  // for the same dimension.
  const [showErrorLogModal, setShowErrorLogModal] = useState(false);
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogSearch, setErrorLogSearch] = useState('');
  const [expandedErrorId, setExpandedErrorId] = useState(null);
  const [copiedLogId, setCopiedLogId] = useState(null);
  // 'simple' = plain-language explanation for account owners,
  // 'developer' = the raw channel error and its diagnostic payload.
  const [errorLogView, setErrorLogView] = useState('simple');


  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadErrorLogs = useCallback(async () => {
    setErrorLogsLoading(true);
    try {
      const params = { limit: 100 };
      // Scope to the account currently selected in the left rail — otherwise
      // every connected account's errors show up under whichever one you're
      // looking at. Agency-wide errors that aren't attributable to a single
      // account (integration_id NULL) only appear under "All Accounts".
      if (selectedAccount?.id && selectedAccount.id !== 'all') {
        params.integrationId = selectedAccount.id;
      }
      const res = await botAPI.getErrorLogs(params);
      if (res.data?.success) {
        setErrorLogs(res.data.errors || []);
      }
    } catch (err) {
      console.error('Failed to load bot error logs:', err);
    } finally {
      setErrorLogsLoading(false);
    }
  }, [selectedAccount]);

  const openErrorLogModal = useCallback(() => {
    setShowErrorLogModal(true);
    loadErrorLogs();
  }, [loadErrorLogs]);

  const handleDeleteErrorLog = async (id, e) => {
    e?.stopPropagation();
    try {
      await botAPI.deleteErrorLog(id);
      setErrorLogs((prev) => prev.filter((item) => item.id !== id));
      showToast('Error log entry removed', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete error log', 'error');
    }
  };

  const handleClearAllErrors = async () => {
    // Clearing follows the same scope the list is showing — one account's
    // errors when an account is selected, everything when "All Accounts" is.
    const scopedToAccount = selectedAccount?.id && selectedAccount.id !== 'all';
    const scopeLabel = scopedToAccount ? (selectedAccount.name || getPlatformInfo(selectedAccount.platform).label) : 'All Accounts';
    const result = await Swal.fire({
      title: `Clear Errors for ${scopeLabel}?`,
      text: `Are you sure you want to clear the error log for ${scopeLabel}? This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: 'var(--text-tertiary)',
      confirmButtonText: 'Yes, Clear',
    });
    if (result.isConfirmed) {
      try {
        const params = {};
        if (scopedToAccount) params.integrationId = selectedAccount.id;
        await botAPI.clearErrorLogs(params);
        if (scopedToAccount) {
          setErrorLogs((prev) => prev.filter((item) => String(item.integration_id) !== String(selectedAccount.id)));
        } else {
          setErrorLogs([]);
        }
        showToast(`Error log cleared for ${scopeLabel}`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to clear error logs', 'error');
      }
    }
  };

  const handleSimulateTestError = async () => {
    try {
      const platform = selectedAccount?.platform || 'WHATSAPP';
      await botAPI.createTestErrorLog({
        platform,
        contactIdentifier: selectedAccount?.wa_display_phone || '+1 (555) 019-2834',
        message: `${getPlatformInfo(platform).label} API Error: Recipient account "${selectedAccount?.name || 'CareSphere'}" delivery error test simulation.`,
      });
      showToast('Simulated error log entry added', 'success');
      loadErrorLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to generate test error', 'error');
    }
  };

  const handleCopyErrorDetails = (errItem, e) => {
    e?.stopPropagation();
    let textToCopy = errItem.error_message;
    if (errItem.error_details) {
      try {
        const parsed = JSON.parse(errItem.error_details);
        textToCopy = `${errItem.error_message}\n\nTechnical Details:\n${JSON.stringify(parsed, null, 2)}`;
      } catch {
        textToCopy = `${errItem.error_message}\n\nTechnical Details:\n${errItem.error_details}`;
      }
    }
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogId(errItem.id);
    setTimeout(() => setCopiedLogId(null), 2000);
    showToast('Error details copied to clipboard');
  };

  const filteredErrorLogs = useMemo(() => {
    // Only the search box filters client-side — the list is already scoped
    // to one account (or all) by loadErrorLogs itself.
    return errorLogs.filter((item) => {
      if (errorLogSearch.trim()) {
        const q = errorLogSearch.toLowerCase().trim();
        const msg = (item.error_message || '').toLowerCase();
        const contact = (item.contact_identifier || item.contact_name || '').toLowerCase();
        const botName = (item.bot_name || '').toLowerCase();
        const flowName = (item.flow_name || '').toLowerCase();
        if (!msg.includes(q) && !contact.includes(q) && !botName.includes(q) && !flowName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [errorLogs, errorLogSearch]);

  /* ─── Load Data ─── */
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [integsRes, flowsRes, templRes] = await Promise.allSettled([
        integrationAPI.getAll(),
        flowAPI.getAll(),
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

      if (templRes.status === 'fulfilled') {
        setTemplates(templRes.value.data?.templates || []);
      }

      // Default select the first account if none currently chosen. Error logs
      // are NOT fetched here — the "Sync error logs" effect below already
      // fires on mount and again whenever this setSelectedAccount call lands,
      // so a call here would just be a second, near-simultaneous request for
      // the exact same (still-unscoped) data.
      setSelectedAccount((prev) => {
        if (prev) return prev;
        if (integs.length > 0) return integs[0];
        return { id: 'all', name: 'All Connected Channels', platform: 'WHATSAPP', is_active: 1 };
      });
    } catch (e) {
      console.error(e);
      showToast('Failed to load bot manager data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Sync error logs when the selected account changes — this is the ONE place
  // error logs get fetched from page-load/account-change (loadAllData
  // deliberately does not also call loadErrorLogs; see above). Deliberately
  // not depending on loadErrorLogs itself, only on the id that actually
  // determines its scope — including the function reference here re-fires
  // the effect on every render where its identity changes for unrelated
  // reasons, which previously caused redundant duplicate fetches.
  useEffect(() => {
    loadErrorLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id]);

  // Filter sub-tabs dynamically per channel platform (Message Templates for WhatsApp & Facebook)
  const currentSubTabs = useMemo(() => {
    const list = SUB_TABS[activeCategory] || [];
    const platform = (selectedAccount?.platform || 'WHATSAPP').toUpperCase();
    return list.filter((sub) => {
      // Message Templates available for WhatsApp (HSM) and Facebook (Utility Templates)
      if (sub.id === 'messageTemplates') {
        return ['WHATSAPP', 'FACEBOOK'].includes(platform);
      }
      // WhatsApp specific tools ONLY for WhatsApp
      if (['whatsappCalling', 'catalogSync', 'productMessages'].includes(sub.id)) {
        return platform === 'WHATSAPP';
      }
      // Story mentions ONLY for Facebook / Instagram
      if (sub.id === 'storyMentions') {
        return ['FACEBOOK', 'INSTAGRAM'].includes(platform);
      }
      // WhatsApp Flows management (incl. encryption keys) is ADMIN/RESELLER
      // only server-side (routes/whatsappFlowRefs.js, routes/whatsappFlowEndpoint.js)
      // — hide the tab from USER team members rather than show a form whose
      // every mutating call 403s.
      if (sub.id === 'whatsappFlows') {
        return user?.role !== 'USER';
      }
      return true;
    });
  }, [activeCategory, selectedAccount, user?.role]);

  // Sync category change to reset subtab
  const handleCategoryChange = (catId) => {
    setActiveCategory(catId);
    const list = SUB_TABS[catId] || [];
    const platform = (selectedAccount?.platform || 'WHATSAPP').toUpperCase();
    const available = list.filter((sub) => {
      if (sub.id === 'messageTemplates') {
        return ['WHATSAPP', 'FACEBOOK'].includes(platform);
      }
      if (['whatsappCalling', 'catalogSync', 'productMessages'].includes(sub.id)) {
        return platform === 'WHATSAPP';
      }
      if (sub.id === 'storyMentions') {
        return ['FACEBOOK', 'INSTAGRAM'].includes(platform);
      }
      if (sub.id === 'whatsappFlows') {
        return user?.role !== 'USER';
      }
      return true;
    });
    if (available.length > 0) {
      setActiveSubTab(available[0].id);
    }
  };

  // Track previous selected account ID to reset tab to default Automation tab when switching bot accounts
  const prevAccountIdRef = useRef(selectedAccount?.id);
  useEffect(() => {
    if (prevAccountIdRef.current !== undefined && selectedAccount?.id && prevAccountIdRef.current !== selectedAccount.id) {
      setActiveCategory('automation');
      setActiveSubTab('keywordReplies');
      setCurrentPage(1);
      setFolderFilter('All Folders');
      setTableSearch('');
    }
    prevAccountIdRef.current = selectedAccount?.id;
  }, [selectedAccount?.id]);

  const handleSelectAccount = (acc) => {
    setSelectedAccount(acc);
    setActiveCategory('automation');
    setActiveSubTab('keywordReplies');
    setCurrentPage(1);
    setFolderFilter('All Folders');
    setTableSearch('');
  };

  const handleChannelFilterChange = (channel) => {
    setChannelFilter(channel);
    if (channel !== 'ALL') {
      const currentPlat = (selectedAccount?.platform || '').toUpperCase();
      if (currentPlat !== channel) {
        const firstMatch = integrations.find(
          (acc) => (acc.platform || 'WHATSAPP').toUpperCase() === channel
        );
        if (firstMatch) {
          handleSelectAccount(firstMatch);
        }
      }
    }
  };

  // When platform changes within activeCategory, ensure activeSubTab is valid
  const currentAccountPlatform = selectedAccount?.platform;
  useEffect(() => {
    const list = SUB_TABS[activeCategory] || [];
    const platform = (currentAccountPlatform || 'WHATSAPP').toUpperCase();
    const available = list.filter((sub) => {
      if (sub.id === 'messageTemplates') {
        return ['WHATSAPP', 'FACEBOOK'].includes(platform);
      }
      if (['whatsappCalling', 'catalogSync', 'productMessages'].includes(sub.id)) {
        return platform === 'WHATSAPP';
      }
      if (sub.id === 'storyMentions') {
        return ['FACEBOOK', 'INSTAGRAM'].includes(platform);
      }
      if (sub.id === 'whatsappFlows') {
        return user?.role !== 'USER';
      }
      return true;
    });

    const isCurrentValid = available.some((sub) => sub.id === activeSubTab);
    if (!isCurrentValid && available.length > 0) {
      setActiveSubTab(available[0].id);
    }
  }, [currentAccountPlatform, activeCategory, activeSubTab, user?.role]);




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
      // Exclude broadcast flows from the keyword bot replies table
      if (f.trigger_type === 'BROADCAST') {
        return false;
      }

      // 1. Filter strictly by Selected Account
      if (selectedAccount && selectedAccount.id !== 'all') {
        // Flows must belong STRICTLY to this bot account
        if (String(f.integration_id || '') !== String(selectedAccount.id)) {
          return false;
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
      const targetPlatform = selectedAccount?.platform || newFlowPlatform || 'WHATSAPP';
      const targetIntegId = selectedAccount?.id && selectedAccount?.id !== 'all' ? selectedAccount?.id : null;

      let nodes = template.nodes(newFlowName);
      let edges = template.edges(newFlowName);


      const res = await flowAPI.create({
        name: newFlowName.trim(),
        platform: targetPlatform,
        integrationId: targetIntegId,
        // The template's own start keywords — blank for Blank Canvas (no default trigger).
        triggerKeyword: (nodes.find((n) => n.type === 'start')?.data?.keywords || []).join(',') || null,
        triggerType: 'KEYWORD',
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        isActive: 1,
      });

      showToast(`Flow "${newFlowName}" created!`);
      setShowCreateModal(false);
      setNewFlowName('');
      const newId = res.data?.flowId || res.data?.flow?.id || res.data?.id;

      if (newId) {
        openFlowBuilder(newId);
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

  /* ─── Clone / Copy Flow to Bot Account ─── */
  const openCloneModal = (flow) => {
    setFlowToClone(flow);
    setCloneName(`${flow.name} (Copy)`);
    const defaultIntegId = (selectedAccount?.id && selectedAccount.id !== 'all')
      ? String(selectedAccount.id)
      : (flow.integration_id ? String(flow.integration_id) : (integrations[0]?.id ? String(integrations[0].id) : ''));
    setCloneTargetIntegId(defaultIntegId);
    setShowCloneModal(true);
  };

  const handleCloneFlow = async (e) => {
    e?.preventDefault();
    if (!flowToClone || !cloneName.trim()) {
      showToast('Please enter a name for the cloned flow', 'error');
      return;
    }
    setCloning(true);
    try {
      await flowAPI.clone(flowToClone.id, {
        name: cloneName.trim(),
        targetIntegrationId: cloneTargetIntegId ? Number(cloneTargetIntegId) : null,
      });

      const targetInteg = integrations.find((i) => String(i.id) === String(cloneTargetIntegId));
      const targetLabel = targetInteg?.name || targetInteg?.wa_display_phone || 'Bot Account';
      showToast(`Flow cloned successfully to ${targetLabel}!`, 'success');

      setShowCloneModal(false);
      setFlowToClone(null);
      setCloneName('');

      await loadAllData();
    } catch (err) {
      console.error('Clone flow error:', err);
      showToast(err?.response?.data?.message || 'Failed to clone flow', 'error');
    } finally {
      setCloning(false);
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

  /* ─── Play / Pause Flow ─── */
  const handleToggleFlow = async (flow, e) => {
    if (e) e.stopPropagation();
    const isCurrentlyActive = flow.is_active !== 0 && flow.is_active !== false;
    try {
      const res = await flowAPI.toggle(flow.id);
      const newActive = res.data?.isActive !== undefined ? (res.data.isActive ? 1 : 0) : (isCurrentlyActive ? 0 : 1);
      setFlows((prev) =>
        prev.map((f) => (f.id === flow.id ? { ...f, is_active: newActive } : f))
      );
      showToast(newActive ? `Bot "${flow.name}" is now Active` : `Bot "${flow.name}" is now Paused`);
    } catch (err) {
      console.error(err);
      showToast('Failed to toggle bot status', 'error');
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
          background: var(--bg-hover);
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* ── Left Navigation Column ── */
        .bm-accounts-nav {
          width: 280px;
          flex-shrink: 0;
          background: var(--bg-surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          box-shadow: 2px 0 6px rgba(0,0,0,0.02);
        }
        .bm-nav-header {
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border);
        }
        .bm-nav-title {
          font-size: 0.96rem;
          font-weight: 800;
          color: var(--text-primary);
        }
        .bm-add-bot-btn {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--primary);
          background: rgba(24, 24, 27, 0.06);
          border: 1px solid rgba(24, 24, 27, 0.16);
          border-radius: 6px;
          padding: 5px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .bm-add-bot-btn:hover {
          background: var(--primary);
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
          border: 1px solid var(--border);
          background: var(--bg-input);
          font-size: 0.8rem;
          color: var(--text-primary);
          outline: none;
        }
        .bm-channel-pills {
          display: flex;
          gap: 4px;
          padding: 0 14px 10px;
          overflow-x: auto;
          border-bottom: 1px solid var(--border);
          scrollbar-width: none;
        }
        .bm-channel-pills::-webkit-scrollbar { display: none; }
        .bm-pill {
          padding: 4px 8px;
          border-radius: 14px;
          font-size: 0.72rem;
          font-weight: 600;
          border: 1px solid var(--border);
          background: var(--bg-surface);
          color: var(--text-tertiary);
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .bm-pill.active {
          background: var(--text-primary);
          color: #ffffff;
          border-color: var(--text-primary);
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
          background: var(--bg-hover);
        }
        .bm-account-item.active {
          background: var(--primary-soft);
          border-color: var(--primary-light);
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
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .bm-account-details .sub {
          font-size: 0.78rem;
          color: var(--text-tertiary);
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
          border-bottom: 1px solid var(--border);
          margin-bottom: 14px;
        }
        .bm-cat-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 0;
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--text-tertiary);
          border: none;
          background: none;
          cursor: pointer;
          border-bottom: 2.5px solid transparent;
          transition: all 0.15s;
        }
        .bm-cat-tab:hover {
          color: var(--text-primary);
        }
        .bm-cat-tab.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
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
          border: 1px solid var(--border);
          background: var(--bg-surface);
          color: var(--text-tertiary);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .bm-subtab-pill:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .bm-subtab-pill.active {
          background: var(--primary);
          color: #ffffff;
          border-color: var(--primary);
          box-shadow: 0 2px 8px rgba(24, 24, 27, 0.2);
        }

        /* ── Work Area Content Box ── */
        .bm-content-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.03);
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .bm-card-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
        }
        .bm-card-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0;
        }
        .bm-card-sub {
          font-size: 0.78rem;
          color: var(--text-tertiary);
          margin: 3px 0 0 0;
        }
        .bm-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: var(--bg-input);
          border-bottom: 1px solid var(--border);
          gap: 12px;
          flex-wrap: wrap;
        }
        .bm-table th {
          padding: 12px 16px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border);
          background: var(--bg-input);
          white-space: nowrap;
          text-align: left;
        }
        .bm-table td {
          padding: 13px 16px;
          font-size: 0.82rem;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
          background: var(--bg-surface);
        }
        .bm-table tr:hover td {
          background: var(--bg-hover);
        }
        .bm-row-action {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg-surface);
          color: var(--text-tertiary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .bm-row-action:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: rgba(24, 24, 27, 0.06);
          transform: translateY(-1px);
        }
        .bm-row-action.delete:hover {
          border-color: #ef4444;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
        }
        .bm-row-action.play:hover {
          border-color: #16a34a;
          color: #16a34a;
          background: rgba(22, 163, 74, 0.12);
        }
        .bm-row-action.pause:hover {
          border-color: #d97706;
          color: #d97706;
          background: rgba(217, 119, 6, 0.12);
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
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)' }} />
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
              onClick={() => handleChannelFilterChange('ALL')}
            >
              All {channelCounts.ALL}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'WHATSAPP' ? 'active' : ''}`}
              onClick={() => handleChannelFilterChange('WHATSAPP')}
            >
              <MessageCircle size={12} color="#25d366" /> {channelCounts.WHATSAPP}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'TELEGRAM' ? 'active' : ''}`}
              onClick={() => handleChannelFilterChange('TELEGRAM')}
            >
              <Send size={12} color="#229ed9" /> {channelCounts.TELEGRAM}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'FACEBOOK' ? 'active' : ''}`}
              onClick={() => handleChannelFilterChange('FACEBOOK')}
            >
              <Facebook size={12} color="#1877f2" /> {channelCounts.FACEBOOK}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'INSTAGRAM' ? 'active' : ''}`}
              onClick={() => handleChannelFilterChange('INSTAGRAM')}
            >
              <Instagram size={12} color="#e1306c" /> {channelCounts.INSTAGRAM}
            </button>
            <button
              className={`bm-pill ${channelFilter === 'WEBCHAT' ? 'active' : ''}`}
              onClick={() => handleChannelFilterChange('WEBCHAT')}
            >
              <Globe size={12} color="var(--channel-webchat)" /> {channelCounts.WEBCHAT}
            </button>
          </div>

          {/* Accounts List */}
          <div className="bm-account-list">
            {filteredAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
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
                    onClick={() => handleSelectAccount(acc)}
                  >
                    <div
                      className="bm-avatar-circle"
                      style={{ background: pInfo.bg, color: pInfo.color }}
                    >
                      <IconComponent size={18} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', truncate: true }}>
                        {acc.name || acc.fb_page_name || 'Nexa Bot'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 1, truncate: true }}>
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
                onClick={() => openErrorLogModal()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: errorLogs.length > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                  background: errorLogs.length > 0 ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg-surface)',
                  color: errorLogs.length > 0 ? '#dc2626' : 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                title="View Bot Error Log"
              >
                <AlertCircle size={15} color={errorLogs.length > 0 ? '#ef4444' : 'var(--text-tertiary)'} />
                <span>Error Log</span>
                {errorLogs.length > 0 && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 10,
                      marginLeft: 2,
                    }}
                  >
                    {errorLogs.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => navigate('/settings/business-hours', { state: { selectedAccountId: selectedAccount?.id && selectedAccount.id !== 'all' ? selectedAccount.id : null } })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Clock size={14} color="var(--primary)" /> Business Hours
              </button>

              <button
                onClick={() => setShowSettingsModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
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
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-tertiary)',
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
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                      zIndex: 100,
                      width: 180,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() => {
                        setShowOptionsDropdown(false);
                        setShowCreateModal(true);
                      }}
                      style={{ padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                    >
                      <Plus size={13} color="var(--primary)" /> Create Flow
                    </div>
                    <div
                      onClick={() => {
                        setShowOptionsDropdown(false);
                        openErrorLogModal();
                      }}
                      style={{ padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', borderTop: '1px solid var(--border)' }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#fef2f2'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                    >
                      <AlertCircle size={13} color="#ef4444" /> Bot Error Log {errorLogs.length > 0 ? `(${errorLogs.length})` : ''}
                    </div>
                    <div
                      onClick={() => {
                        setShowOptionsDropdown(false);
                        loadAllData();
                        showToast('Refreshed all bot flows');
                      }}
                      style={{ padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
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
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      fontSize: '0.82rem',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="All Folders">All Folders</option>
                    <option value="Onboarding">Onboarding</option>
                    <option value="Support">Support</option>
                    <option value="Sales">Sales</option>
                  </select>

                  <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                    <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search & Enter..."
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px 7px 30px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-surface)',
                        fontSize: '0.82rem',
                        color: 'var(--text-primary)',
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
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-tertiary)',
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
                      background: 'var(--primary)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(24, 24, 27, 0.25)',
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
                      <th style={{ textAlign: 'center' }}>STATUS</th>
                      <th>UPDATED AT</th>
                      <th style={{ textAlign: 'right', paddingRight: 24 }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 60, textAlign: 'center' }}>
                          <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Loading keyword bot replies...</p>
                        </td>
                      </tr>
                    ) : displayedFlows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 60, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: 'var(--text-muted)' }}><Bot size={32} strokeWidth={1.5} /></div>
                          <h4 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                            No keyword reply flows yet
                          </h4>
                          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '0 0 14px 0' }}>
                            Click "+ Create" to build your first interactive visual chat bot flow.
                          </p>
                          <button
                            onClick={() => setShowCreateModal(true)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: 8,
                              background: 'var(--primary)',
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
                      displayedFlows.map((flow, idx) => {
                        const isFlowActive = flow.is_active !== 0 && flow.is_active !== false;
                        return (
                        <tr key={flow.id} style={{ cursor: 'pointer' }} onClick={() => openFlowBuilder(flow.id)}>
                          <td style={{ fontWeight: 700, color: 'var(--text-tertiary)' }}>
                            {idx + 1}
                          </td>

                          <td>
                            <code style={{ fontSize: '0.8rem', color: 'var(--primary)', background: 'var(--primary-soft)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                              {formatUniqueId(flow.id)}
                            </code>
                          </td>

                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                              {flow.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                              Trigger: <strong>{flow.trigger_keyword || 'hi, hello'}</strong> ({flow.platform || 'WHATSAPP'})
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td style={{ textAlign: 'center' }}>
                            {isFlowActive ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 10px',
                                  borderRadius: 12,
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                Active
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 10px',
                                  borderRadius: 12,
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#fef3c7',
                                  color: '#b45309',
                                }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                                Paused
                              </span>
                            )}
                          </td>

                          <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                            {formatDate(flow.updated_at || flow.created_at)}
                          </td>

                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', paddingRight: 20 }}>
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {/* Play / Pause Toggle Button */}
                              <button
                                className={`bm-row-action ${isFlowActive ? 'pause' : 'play'}`}
                                title={isFlowActive ? 'Pause Bot' : 'Play / Resume Bot'}
                                onClick={(e) => handleToggleFlow(flow, e)}
                                style={
                                  isFlowActive
                                    ? { color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }
                                    : { color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }
                                }
                              >
                                {isFlowActive ? (
                                  <Pause size={13} />
                                ) : (
                                  <Play size={13} fill="currentColor" />
                                )}
                              </button>

                              <button
                                className="bm-row-action"
                                title="Open Live Visual Builder"
                                onClick={() => openFlowBuilder(flow.id)}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                className="bm-row-action"
                                title="Clone / Copy to Bot Account"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCloneModal(flow);
                                }}
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                className="bm-row-action"
                                title="Test in Inbox"
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
                        );
                      })
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
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  fontSize: '0.8rem',
                  color: 'var(--text-tertiary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>1–{Math.min(displayedFlows.length, pageSize)} of {displayedFlows.length}</span>
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                    Previous
                  </button>
                  <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 700 }}>
                    1
                  </button>
                  <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 2b: CHAT WIDGET (ENGAGEMENT) — per-channel chat entry point,
              or the full Webchat widget manager when a Webchat account is selected
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'engagement' && activeSubTab === 'chatWidget' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Chat Widget</h3>
                <p className="bm-card-sub">
                  A ready-to-share chat entry point for the selected channel — or the full embeddable widget for Webchat.
                </p>
              </div>
              <div style={{ padding: 20 }}>
                <ChatWidgetManager selectedAccount={selectedAccount} />
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 3: AI REPLIES — Agents (live), Reply Settings / Active
              Agents (Phase 4 of the AI Reply rollout — placeholders for now)
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'ai' && activeSubTab === 'agents' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Agents</h3>
                <p className="bm-card-sub">
                  Reusable AI personalities — build one once, use it on any bot, any channel.
                </p>
              </div>
              <div style={{ padding: 20 }}>
                <AIAgentManagerList />
              </div>
            </div>
          )}

          {activeCategory === 'ai' && (activeSubTab === 'aiReplySettings' || activeSubTab === 'activeAgents') && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">{activeSubTab === 'aiReplySettings' ? 'AI Reply Settings' : 'Active Agents'}</h3>
                <p className="bm-card-sub">
                  {activeSubTab === 'aiReplySettings'
                    ? 'On/off, trigger mode, default Agent and routing confidence for this bot.'
                    : 'Which Agents are live on this specific bot.'}
                </p>
              </div>
              <div style={{ padding: 20 }}>
                <AIReplySettingsPanel
                  integrationId={selectedAccount?.id ?? null}
                  view={activeSubTab === 'aiReplySettings' ? 'settings' : 'activeAgents'}
                />
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
              VIEW 2B: FACEBOOK UTILITY TEMPLATES (pages_utility_messaging)
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'automation' && activeSubTab === 'messageTemplates' && (selectedAccount?.platform || '').toUpperCase() === 'FACEBOOK' && (
            <FacebookUtilityTemplateManager
              selectedAccount={selectedAccount}
              showToast={showToast}
            />
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 2C: MESSAGE TEMPLATES WHEN NO ACCOUNT SELECTED
              ═════════════════════════════════════════════════════════════════ */}
          {activeCategory === 'automation' && activeSubTab === 'messageTemplates' && !selectedAccount && (
            <div className="bm-content-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--text-muted)' }}><FileText size={40} strokeWidth={1.5} /></div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                Select a Bot Account to View Templates
              </h3>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-tertiary)', maxWidth: 440, margin: '0 auto 16px' }}>
                Please select a connected <strong>WhatsApp</strong> or <strong>Facebook Page</strong> from the left panel to manage its message templates.
              </p>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              VIEW 4: DEFAULT FALLBACK VIEW FOR OTHER SUB-TABS
              ═════════════════════════════════════════════════════════════════ */}
          {/* User Input Flows — full list (create/open/rename/delete + a
              "Reports" drill-down of submitted answers) lives right here in
              Bot Manager → Data Collection now, not a separate page off the
              main sidebar. The builder itself is still its own route
              (/user-input-flows/:id/edit — a full canvas can't reasonably
              live inside this tab), opened via the row's Open action. */}
          {activeCategory === 'dataCollection' && activeSubTab === 'userInputFlows' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">User Input Flows</h3>
                <p className="bm-card-sub">
                  Reusable question sequences for collecting subscriber data — run them from any bot flow
                  on the same channel with a "Run User Input Flow" node.
                </p>
              </div>
              <UserInputFlowManagerList integrationId={selectedAccount?.id && selectedAccount.id !== 'all' ? selectedAccount.id : null} />
            </div>
          )}

          {/* HTTP API Campaigns — reusable outbound-HTTP configs. Called by
              id from any bot flow with an "HTTP API" node, which fires the
              request for real when the flow reaches it. */}
          {activeCategory === 'automation' && activeSubTab === 'httpApiCampaigns' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">HTTP API Campaigns</h3>
                <p className="bm-card-sub">
                  Send custom field values out to an external API, or pull data back into a contact's
                  fields — call one from any bot flow with an "HTTP API" node.
                </p>
              </div>
              <HttpApiCampaignManagerList />
            </div>
          )}

          {/* Sequences — same pattern: full list management here, the
              delivery report (sent / skipped-by-window / failed, with a
              per-subscriber drill-down) right alongside it so a stuck
              enrollment is diagnosable without a database query. */}
          {activeCategory === 'engagement' && activeSubTab === 'followUpSequences' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Sequence Messages</h3>
                <p className="bm-card-sub">
                  Scheduled message series a subscriber is enrolled into over time — start or stop one from
                  any bot flow with a "Start Sequence" / "Stop Sequence" action. Each channel's own
                  messaging-window rules are respected automatically — a skipped send shows why below.
                </p>
              </div>
              <SequenceMessageReport integrationId={selectedAccount?.id && selectedAccount.id !== 'all' ? selectedAccount.id : null} />
            </div>
          )}

          {/* WhatsApp Flows — moved here from the standalone /settings/whatsapp-flows
              page. ADMIN/RESELLER only, same restriction as before (see the
              currentSubTabs filter above and routes/whatsappFlowRefs.js /
              routes/whatsappFlowEndpoint.js on the backend) — a USER team member
              never reaches this even by direct navigation. */}
          {activeCategory === 'dataCollection' && activeSubTab === 'whatsappFlows' && user?.role !== 'USER' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">WhatsApp Flows</h3>
                <p className="bm-card-sub">
                  Reference Flows you've already built and published in Meta Business Manager — agents can then send them from the Live Inbox's "+" menu. This app doesn't author or publish Flow screen JSON itself, but it does handle Meta's encrypted data-exchange traffic once a Flow is sent, relaying each screen's request to your own server if you wire one up below.
                </p>
              </div>
              <WhatsAppFlowManagerList />
            </div>
          )}

          {/* Store Connections — moved here from the standalone /agency/commerce
              page, which now redirects to this tab. */}
          {activeCategory === 'commerce' && activeSubTab === 'commerceCampaigns' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Commerce Automation Campaigns</h3>
                <p className="bm-card-sub">
                  Order notifications, Cash-on-Delivery verification and abandoned-cart recovery on WhatsApp.
                </p>
              </div>
              <CommerceCampaignsManager onOpenStores={() => setActiveSubTab('storeConnections')} />
            </div>
          )}

          {activeCategory === 'commerce' && activeSubTab === 'commerceActivity' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Orders & Activity</h3>
                <p className="bm-card-sub">Messages the campaigns sent, COD answers and abandoned carts.</p>
              </div>
              <CommerceActivity />
            </div>
          )}

          {activeCategory === 'commerce' && activeSubTab === 'storeConnections' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">Store Connections</h3>
                <p className="bm-card-sub">
                  Connect a Shopify or WooCommerce store to run order, COD and abandoned-cart automations on WhatsApp.
                </p>
              </div>
              <StoreConnectionsManager />
            </div>
          )}

          {!['keywordReplies', 'messageTemplates'].includes(activeSubTab) && !(activeCategory === 'dataCollection' && activeSubTab === 'userInputFlows') && !(activeCategory === 'automation' && activeSubTab === 'httpApiCampaigns') && !(activeCategory === 'engagement' && activeSubTab === 'followUpSequences') && !(activeCategory === 'dataCollection' && activeSubTab === 'whatsappFlows') && !(activeCategory === 'commerce' && ['storeConnections', 'commerceCampaigns', 'commerceActivity'].includes(activeSubTab)) && !(activeCategory === 'engagement' && activeSubTab === 'chatWidget') && activeCategory !== 'ai' && (
            <div className="bm-content-card">
              <div className="bm-card-header">
                <h3 className="bm-card-title">{activeSubTab.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <p className="bm-card-sub">
                  Configure automated settings and workflows for {selectedAccount?.name || 'this account'}.
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--text-muted)' }}><Zap size={40} strokeWidth={1.5} /></div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
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
                    background: 'var(--primary)',
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
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} color="var(--primary)" /> Create Conversational Flow
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                }}
              >
                <X size={14} />
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
                  Target Bot Account
                </label>
                <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                  <strong>{selectedAccount?.name || 'Selected Bot'}</strong> ({getPlatformInfo(selectedAccount?.platform).label} — {selectedAccount?.wa_display_phone || selectedAccount?.wa_phone_number_id || selectedAccount?.fb_page_name || 'Channel Account'})
                </div>
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
                          border: `1.5px solid ${isSel ? 'var(--primary)' : 'var(--border)'}`,
                          background: isSel ? 'var(--primary-soft)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.84rem', color: isSel ? '#4f46e5' : 'var(--text-primary)', marginBottom: 4 }}>
                          <TIcon size={16} color={tmpl.color} /> {tmpl.title}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
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
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.85rem' }}
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
                    background: 'var(--primary)',
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

      {/* ── Clone Flow Modal ── */}
      {showCloneModal && flowToClone && (
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
          onClick={() => setShowCloneModal(false)}
        >
          <div
            style={{
              width: 520,
              maxWidth: '92vw',
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Copy size={18} color="var(--primary)" /> Clone Bot Flow
              </h3>
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleCloneFlow} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                Cloning source flow: <strong style={{ color: 'var(--text-primary)' }}>{flowToClone.name}</strong> ({flowToClone.platform})
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5, color: 'var(--text-primary)' }}>
                  New Flow Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  required
                  className="form-input w-full"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder="e.g. Sales Bot (Copy)"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5, color: 'var(--text-primary)' }}>
                  Target Bot Account <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  required
                  className="form-input w-full"
                  value={cloneTargetIntegId}
                  onChange={(e) => setCloneTargetIntegId(e.target.value)}
                  style={{ height: 38, fontSize: '0.84rem' }}
                >
                  {integrations
                    .filter((acc) => !flowToClone.platform || (acc.platform || '').toUpperCase() === (flowToClone.platform || '').toUpperCase())
                    .map((acc) => {
                      const pInfo = getPlatformInfo(acc.platform);
                      const identifier = acc.wa_display_phone || acc.wa_phone_number_id || acc.fb_page_name || acc.ig_username || (acc.tiktok_username ? `@${acc.tiktok_username}` : acc.tiktok_open_id) || `${pInfo.label} Account`;
                      return (
                        <option key={acc.id} value={acc.id}>
                          {acc.name || identifier} ({pInfo.label} — {identifier})
                        </option>
                      );
                    })}
                </select>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  The cloned flow will be strictly isolated and attached only to this bot account.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCloneModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cloning}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 8,
                    background: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                >
                  {cloning ? 'Cloning...' : 'Clone Flow'}
                </button>
              </div>
            </form>
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
              width: settingsModalTab === 'businessHours' ? 620 : 500,
              maxWidth: '92vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color="var(--primary)" /> Bot Settings
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Tabs — General is the original (mock) bot-config form, left as-is;
                Business Hours is the real, wired-up feature. */}
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-hover)', borderRadius: 10, marginBottom: 16, flexShrink: 0 }}>
              {[{ id: 'general', label: 'General' }, { id: 'businessHours', label: 'Business Hours' }].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSettingsModalTab(t.id)}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700,
                    background: settingsModalTab === t.id ? 'var(--bg-surface)' : 'transparent',
                    color: settingsModalTab === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    boxShadow: settingsModalTab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ overflowY: 'auto', paddingRight: 2 }}>
              {settingsModalTab === 'general' && (
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
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.85rem' }}
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
                        background: 'var(--primary)',
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
              )}

              {settingsModalTab === 'businessHours' && (
                <div style={{ textAlign: 'center', padding: '28px 16px' }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: 'rgba(24, 24, 27, 0.06)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px auto',
                    }}
                  >
                    <Clock size={26} />
                  </div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                    Business Hours & Availability
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 380, margin: '0 auto 18px auto', lineHeight: 1.5 }}>
                    Business Hours configuration has moved to a dedicated full page with timezone detection, live operating status, multi-channel bot switching, and off-hours automation.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsModal(false);
                      navigate('/settings/business-hours', {
                        state: { selectedAccountId: selectedAccount?.id && selectedAccount.id !== 'all' ? selectedAccount.id : null },
                      });
                    }}
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', fontSize: '0.85rem' }}
                  >
                    Open Business Hours Page <ExternalLink size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bot Error Log Modal ── */}
      {showErrorLogModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowErrorLogModal(false)}
        >
          <div
            style={{
              width: 880,
              maxWidth: '96vw',
              // A fixed height (not just a maxHeight cap) so the modal is the
              // same size whether it's showing the loading spinner, the empty
              // state, or a full list — all three now sit inside one
              // internally-scrolling box instead of each sizing the modal to
              // fit itself, which is what made it visibly jump/resize on
              // every tab switch (loading spinner is short, a populated list
              // is tall — the modal was resizing between the two).
              height: '80vh',
              maxHeight: '88vh',
              background: 'var(--bg-surface)',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--bg-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                    flexShrink: 0,
                  }}
                >
                  <AlertCircle size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Error Log
                    </h3>
                    {errorLogs.length > 0 && (
                      <span
                        style={{
                          background: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 12,
                        }}
                      >
                        {errorLogs.length}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {selectedAccount?.id && selectedAccount.id !== 'all'
                      ? <>Showing errors for <strong style={{ color: 'var(--text-secondary)' }}>{selectedAccount.name || getPlatformInfo(selectedAccount.platform).label}</strong> only.</>
                      : 'Showing errors across every connected account.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSimulateTestError}
                  title="Generate a sample test error to preview logging behavior"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px dashed var(--border-light)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
                >
                  <Sparkles size={13} color="var(--primary)" />
                  <span>Simulate Test Error</span>
                </button>

                {errorLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllErrors}
                    title="Clear all error logs"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
                  >
                    <Trash2 size={13} />
                    <span>Clear All</span>
                  </button>
                )}

                {/* Plain-language vs raw channel error */}
                <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                  {[['simple', 'Simple'], ['developer', 'Developer']].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setErrorLogView(mode); setExpandedErrorId(null); }}
                      title={mode === 'simple' ? 'Plain-language explanation' : 'Raw error from the channel'}
                      style={{
                        padding: '4px 11px',
                        borderRadius: 6,
                        border: 'none',
                        background: errorLogView === mode ? 'var(--bg-surface)' : 'transparent',
                        color: errorLogView === mode ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        fontSize: '0.75rem',
                        fontWeight: errorLogView === mode ? 600 : 500,
                        cursor: 'pointer',
                        boxShadow: errorLogView === mode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => loadErrorLogs()}
                  disabled={errorLogsLoading}
                  title="Refresh logs"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} className={errorLogsLoading ? 'spin' : ''} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowErrorLogModal(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--bg-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Search Toolbar — no channel tabs here: the list is already
                scoped to one account (or all accounts) via the left rail,
                and one account is always exactly one platform, so a
                platform filter on top of that would just duplicate it. */}
            <div
              style={{
                padding: '12px 24px',
                borderBottom: '1px solid var(--bg-hover)',
                background: 'var(--bg-input)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search errors, contacts, bots..."
                  value={errorLogSearch}
                  onChange={(e) => setErrorLogSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Error List Body */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '16px 24px',
                background: 'var(--bg-input)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                // Loading/empty states have far less content than a populated
                // list — center them in the fixed-height body instead of
                // letting them pin to the top, so the box reads as one
                // steady frame rather than a half-empty leftover.
                justifyContent: (errorLogsLoading && errorLogs.length === 0) || filteredErrorLogs.length === 0 ? 'center' : 'flex-start',
              }}
            >
              {errorLogsLoading && errorLogs.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 10px' }} />
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', margin: 0 }}>Fetching bot error logs...</p>
                </div>
              ) : filteredErrorLogs.length === 0 ? (
                <div
                  style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    background: 'var(--bg-surface)',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: '#ecfdf5',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}
                  >
                    <CheckCircle2 size={26} />
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {errorLogs.length === 0 ? 'No Bot Errors Detected' : 'No Errors Matching Filter'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)', maxWidth: 380, marginInline: 'auto' }}>
                    {errorLogs.length === 0
                      ? 'All bots and automated flows are running smoothly. Any future delivery or API failures will appear here.'
                      : 'Try resetting your search query or channel filter to view other error entries.'}
                  </p>
                </div>
              ) : (
                filteredErrorLogs.map((errItem) => {
                  const { date, time, relative } = formatLogDateTime(errItem.created_at);
                  const isExpanded = expandedErrorId === errItem.id;
                  const pInfo = getPlatformInfo(errItem.platform);
                  const isCopied = copiedLogId === errItem.id;

                  const human = humanizeBotError(errItem);
                  const isDev = errorLogView === 'developer';

                  return (
                    <div
                      key={errItem.id}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '14px 18px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                        {/* Error Icon & Main Message */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, flex: 1, minWidth: 0 }}>
                          <AlertTriangle size={15} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 3 }} />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.86rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                lineHeight: 1.45,
                                wordBreak: 'break-word',
                                fontFamily: isDev ? 'Consolas, Monaco, "Courier New", monospace' : 'inherit',
                              }}
                            >
                              {isDev ? cleanRawMessage(errItem.error_message) : human.title}
                            </div>

                            {!isDev && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4 }}>
                                {human.detail}
                                {human.action && (
                                  <span style={{ display: 'block', marginTop: 5, color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {human.action}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Tags row — neutral, no per-type colour coding */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                              <span style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', fontWeight: 500 }}>
                                {pInfo.label}
                              </span>

                              {errItem.flow_name && (
                                <span style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', fontWeight: 500 }}>
                                  Flow: {errItem.flow_name}
                                </span>
                              )}

                              {errItem.bot_name && (
                                <span style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', fontWeight: 500 }}>
                                  Bot: {errItem.bot_name}
                                </span>
                              )}

                              {isDev && human.code && (
                                <span style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', fontWeight: 500, fontFamily: 'Consolas, Monaco, monospace' }}>
                                  Code {human.code}
                                </span>
                              )}

                              {errItem.contact_identifier && (
                                <span>
                                  To: {errItem.contact_name ? `${errItem.contact_name} (${errItem.contact_identifier})` : errItem.contact_identifier}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Date / Time & Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                              {relative}
                            </div>
                            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {date} • {time}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isDev && (
                              <button
                                type="button"
                                onClick={() => setExpandedErrorId(isExpanded ? null : errItem.id)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: isExpanded ? 'var(--bg-input)' : 'var(--bg-surface)',
                                  color: 'var(--text-secondary)',
                                  fontSize: '0.73rem',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>{isExpanded ? 'Hide payload' : 'Payload'}</span>
                                <ChevronDown
                                  size={13}
                                  style={{
                                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.15s ease',
                                  }}
                                />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => handleDeleteErrorLog(errItem.id, e)}
                              title="Delete this error entry"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-tertiary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
                              onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Raw diagnostic payload — developer view only */}
                      {isDev && isExpanded && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bg-hover)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>
                              Diagnostic payload
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyErrorDetails(errItem, e)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '3px 8px',
                                borderRadius: 5,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-secondary)',
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                              <span>{isCopied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>

                          <pre
                            style={{
                              margin: 0,
                              padding: 10,
                              borderRadius: 6,
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.72rem',
                              lineHeight: 1.45,
                              overflowX: 'auto',
                              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              maxHeight: 220,
                            }}
                          >
                            {(() => {
                              try {
                                if (!errItem.error_details) return JSON.stringify({ message: errItem.error_message }, null, 2);
                                return JSON.stringify(JSON.parse(errItem.error_details), null, 2);
                              } catch {
                                return String(errItem.error_details || errItem.error_message);
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 24px',
                borderTop: '1px solid var(--bg-hover)',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Showing {filteredErrorLogs.length} of {errorLogs.length} recorded error{errorLogs.length === 1 ? '' : 's'}.
              </div>

              <button
                type="button"
                onClick={() => setShowErrorLogModal(false)}
                style={{
                  padding: '7px 18px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: '#1e293b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
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
