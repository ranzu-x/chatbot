import { createPortal } from 'react-dom';
import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router';
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, useNodesState, useEdgesState,
  addEdge, ReactFlowProvider, useReactFlow, useNodeConnections,
  BaseEdge, EdgeLabelRenderer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Save, Loader2, Check, AlertTriangle,
  MessageSquare, MessageCircle, ListOrdered, LayoutGrid, CreditCard,
  Layers, Keyboard, GitBranch, Clock, Headphones,
  CircleStop, Play, Type, GripVertical, X, Plus, Trash2,
  ChevronRight, Zap, MousePointerClick, Mail, Phone,
  User, Settings2, CornerDownRight, Image, Upload,
  Video, Music, FileText, Globe, ExternalLink,
  Smartphone, RotateCcw, Undo2, Redo2, ThumbsUp, Sparkles, MoreVertical,
  Copy, ShoppingBag, HelpCircle, Flag, ClipboardList, Workflow, Tag, Timer, Palette, Megaphone, Network, MessagesSquare
} from 'lucide-react';
import FlowPhonePreview from './FlowPhonePreview';
import PlatformIcon, { getPlatformMeta } from '../../Components/Common/PlatformIcon';
import BroadcastStartNodeProperties from '../../Components/Broadcast/BroadcastStartNodeProperties';
import ChatWidgetStartNodeProperties from '../../Components/Engagement/ChatWidgetStartNodeProperties';
import { buildDefaultWidgetFlowGraph } from '../../utils/chatWidgetHelpers';
import { flowAPI, uploadAPI, integrationAPI, customFieldAPI, userInputFlowAPI, sequenceAPI, labelAPI, googleSheetsAPI, channelAPI, httpApiCampaignAPI } from '../../services/api';
import WidgetAppearancePanel from '../../Components/Engagement/WidgetAppearancePanel';
import Swal from 'sweetalert2';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PLATFORM_RULES = {
  WHATSAPP: {
    text: true,
    interactive: true, // WhatsApp Interactive message with Header, Body, Footer & Reply/CTA buttons
    image: true,
    video: true,
    audio: true,
    file: true,
    buttons: 3,        // WhatsApp Interactive Reply Buttons (max 3)
    quickReplies: false, // WhatsApp uses buttons, interactive or listMenu
    listMenu: 10,      // WhatsApp Interactive List Message (max 10 items)
    card: false,
    carousel: false,
    collectInput: true,
    // Channel-agnostic by construction: a question is just a message plus waiting
    // for the next reply, which every channel supports the same way. Omitting these
    // made isNodeSupportedOnPlatform() return false (it treats an absent rule as
    // unsupported), which silently kept them out of every palette.
    runUserInputFlow: true,
    question: true,
    finalAnswer: true,
    // Sequence-related nodes are channel-agnostic for the same reason —
    // "start/stop enrollment" and "wait N minutes" have nothing platform-
    // specific about them; only the Sequence's own message content nodes are
    // capability-checked, the normal way, when authored inside it.
    wait: true,
    startSequenceAction: true,
    stopSequenceAction: true,
    actions: true,
    startAutomation: true,
    messageBlock: true,
    condition: true,
    delay: true,
    webhook: true,
    httpApi: true,
    payment: true,     // WhatsApp In-Chat Payment / Catalog Orders
    handoff: true,
    end: true,
  },
  FACEBOOK: {
    text: true,
    interactive: false,
    image: true,
    video: true,
    audio: true,
    file: true,
    buttons: 3,        // Messenger Button Template (max 3)
    quickReplies: 13,  // Messenger Quick Replies (max 13)
    listMenu: false,
    card: true,        // Generic Template Card
    carousel: 10,      // Generic Template Carousel (max 10 cards)
    collectInput: true,
    // Channel-agnostic by construction: a question is just a message plus waiting
    // for the next reply, which every channel supports the same way. Omitting these
    // made isNodeSupportedOnPlatform() return false (it treats an absent rule as
    // unsupported), which silently kept them out of every palette.
    runUserInputFlow: true,
    question: true,
    finalAnswer: true,
    // Sequence-related nodes are channel-agnostic for the same reason —
    // "start/stop enrollment" and "wait N minutes" have nothing platform-
    // specific about them; only the Sequence's own message content nodes are
    // capability-checked, the normal way, when authored inside it.
    wait: true,
    startSequenceAction: true,
    stopSequenceAction: true,
    actions: true,
    startAutomation: true,
    messageBlock: true,
    condition: true,
    delay: true,
    webhook: true,
    httpApi: true,
    payment: true,
    handoff: true,
    end: true,
  },
  INSTAGRAM: {
    text: true,
    interactive: false,
    image: true,
    video: true,
    audio: true,
    file: false,       // Instagram DM does not support file docs
    buttons: false,    // Standalone buttons not supported outside card
    quickReplies: 13,  // Instagram Quick Replies (max 13)
    listMenu: false,
    card: true,        // Generic Template Card
    carousel: 10,      // Generic Template Carousel (max 10 cards)
    collectInput: true,
    // Channel-agnostic by construction: a question is just a message plus waiting
    // for the next reply, which every channel supports the same way. Omitting these
    // made isNodeSupportedOnPlatform() return false (it treats an absent rule as
    // unsupported), which silently kept them out of every palette.
    runUserInputFlow: true,
    question: true,
    finalAnswer: true,
    // Sequence-related nodes are channel-agnostic for the same reason —
    // "start/stop enrollment" and "wait N minutes" have nothing platform-
    // specific about them; only the Sequence's own message content nodes are
    // capability-checked, the normal way, when authored inside it.
    wait: true,
    startSequenceAction: true,
    stopSequenceAction: true,
    actions: true,
    startAutomation: true,
    messageBlock: true,
    condition: true,
    delay: true,
    webhook: true,
    httpApi: true,
    payment: false,
    handoff: true,
    end: true,
  },
  TELEGRAM: {
    text: true,
    interactive: false,
    image: true,
    video: true,
    audio: true,
    file: true,
    buttons: true,     // Inline Keyboard
    quickReplies: true,// Reply Keyboard
    listMenu: false,
    card: true,
    carousel: false,
    collectInput: true,
    // Channel-agnostic by construction: a question is just a message plus waiting
    // for the next reply, which every channel supports the same way. Omitting these
    // made isNodeSupportedOnPlatform() return false (it treats an absent rule as
    // unsupported), which silently kept them out of every palette.
    runUserInputFlow: true,
    question: true,
    finalAnswer: true,
    // Sequence-related nodes are channel-agnostic for the same reason —
    // "start/stop enrollment" and "wait N minutes" have nothing platform-
    // specific about them; only the Sequence's own message content nodes are
    // capability-checked, the normal way, when authored inside it.
    wait: true,
    startSequenceAction: true,
    stopSequenceAction: true,
    actions: true,
    startAutomation: true,
    messageBlock: true,
    condition: true,
    delay: true,
    webhook: true,
    httpApi: true,
    payment: true,
    handoff: true,
    end: true,
  },
  TIKTOK: {
    text: true,
    interactive: false,
    image: true,
    video: true,
    audio: false,
    file: false,
    buttons: false,
    quickReplies: 3,   // Suggestions
    listMenu: false,
    card: false,
    carousel: false,
    collectInput: true,
    // Channel-agnostic by construction: a question is just a message plus waiting
    // for the next reply, which every channel supports the same way. Omitting these
    // made isNodeSupportedOnPlatform() return false (it treats an absent rule as
    // unsupported), which silently kept them out of every palette.
    runUserInputFlow: true,
    question: true,
    finalAnswer: true,
    // Sequence-related nodes are channel-agnostic for the same reason —
    // "start/stop enrollment" and "wait N minutes" have nothing platform-
    // specific about them; only the Sequence's own message content nodes are
    // capability-checked, the normal way, when authored inside it.
    wait: true,
    startSequenceAction: true,
    stopSequenceAction: true,
    actions: true,
    startAutomation: true,
    messageBlock: true,
    condition: true,
    delay: true,
    webhook: true,
    httpApi: true,
    payment: false,
    handoff: true,
    end: true,
  },
  WEBCHAT: {
    text: true,
    interactive: false,
    image: true,
    video: true,
    audio: true,
    file: true,
    buttons: true,
    quickReplies: true,
    listMenu: true,
    card: true,
    carousel: true,
    collectInput: true,
    // Channel-agnostic by construction: a question is just a message plus waiting
    // for the next reply, which every channel supports the same way. Omitting these
    // made isNodeSupportedOnPlatform() return false (it treats an absent rule as
    // unsupported), which silently kept them out of every palette.
    runUserInputFlow: true,
    question: true,
    finalAnswer: true,
    // Sequence-related nodes are channel-agnostic for the same reason —
    // "start/stop enrollment" and "wait N minutes" have nothing platform-
    // specific about them; only the Sequence's own message content nodes are
    // capability-checked, the normal way, when authored inside it.
    wait: true,
    startSequenceAction: true,
    stopSequenceAction: true,
    actions: true,
    startAutomation: true,
    messageBlock: true,
    condition: true,
    delay: true,
    webhook: true,
    httpApi: true,
    payment: true,
    handoff: true,
    end: true,
  },
};

const NODE_COLORS = {
  start: '#059669',        // Fresh emerald
  text: '#4f46e5',         // Soft indigo
  interactive: '#0284c7',  // WhatsApp blue/teal interactive
  image: '#db2777',        // Soft pink
  video: '#e11d48',        // Soft rose
  audio: '#0891b2',        // Soft cyan
  file: '#475569',         // Slate
  buttons: '#d97706',      // Warm amber
  quickReplies: '#0284c7', // Sky blue
  listMenu: '#7c3aed',     // Violet
  card: '#9333ea',         // Purple
  carousel: '#c026d3',     // Fuchsia
  collectInput: '#0d9488', // Teal
  condition: '#ea580c',    // Warm orange
  delay: '#64748b',        // Slate
  webhook: '#2563eb',      // Royal blue
  httpApi: '#7c3aed',      // Violet (distinct from webhook's blue, matches Automation module's purple elsewhere)
  payment: '#16a34a',      // Green
  handoff: '#6366f1',      // Indigo
  end: '#dc2626',          // Soft red
  question: '#0d9488',           // Teal (same family as Collect Input — same concept)
  finalAnswer: '#16a34a',        // Green (a completion, like "end")
  runUserInputFlow: '#7c3aed',   // Violet (a distinct "module call" color)
  startSequenceAction: '#0891b2', // Cyan (a distinct "enroll" color)
  stopSequenceAction: '#dc2626',  // Same red family as "end" — a stop/halt action
  wait: '#64748b',                // Slate — same family as delay, a timing step not content
  // Header tints match ManyChat (see ActionsNode / StartAutomationNode).
  actions: '#d9480f',
  startAutomation: '#4d7c0f',
  messageBlock: '#0284c7',
};

// Dynamic light-color styling themes per connected channel for the main Save button
const PLATFORM_SAVE_THEMES = {
  WHATSAPP: {
    bg: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #dcfce7 100%)',
    border: '#86efac',
    color: '#065f46',
    hoverBg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
    hoverBorder: '#4ade80',
    shadow: '0 2px 8px -1px rgba(34, 197, 94, 0.2), 0 1px 2px rgba(0, 0, 0, 0.04)',
    hoverShadow: '0 4px 14px -1px rgba(34, 197, 94, 0.35)',
    iconColor: '#16a34a',
    badgeBg: '#bbf7d0',
  },
  FACEBOOK: {
    bg: 'linear-gradient(135deg, #eff6ff 0%, #f0f7ff 50%, #dbeafe 100%)',
    border: '#93c5fd',
    color: '#1e40af',
    hoverBg: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
    hoverBorder: '#60a5fa',
    shadow: '0 2px 8px -1px rgba(59, 130, 246, 0.2), 0 1px 2px rgba(0, 0, 0, 0.04)',
    hoverShadow: '0 4px 14px -1px rgba(59, 130, 246, 0.35)',
    iconColor: '#2563eb',
    badgeBg: '#bfdbfe',
  },
  INSTAGRAM: {
    bg: 'linear-gradient(135deg, #fff1f2 0%, #fdf2f8 50%, #fce7f3 100%)',
    border: '#f9a8d4',
    color: '#9d174d',
    hoverBg: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
    hoverBorder: '#f472b6',
    shadow: '0 2px 8px -1px rgba(244, 114, 182, 0.22), 0 1px 2px rgba(0, 0, 0, 0.04)',
    hoverShadow: '0 4px 14px -1px rgba(244, 114, 182, 0.38)',
    iconColor: '#db2777',
    badgeBg: '#fbcfe8',
  },
  TELEGRAM: {
    bg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)',
    border: '#7dd3fc',
    color: '#0369a1',
    hoverBg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
    hoverBorder: '#38bdf8',
    shadow: '0 2px 8px -1px rgba(14, 165, 233, 0.2), 0 1px 2px rgba(0, 0, 0, 0.04)',
    hoverShadow: '0 4px 14px -1px rgba(14, 165, 233, 0.35)',
    iconColor: '#0284c7',
    badgeBg: '#bae6fd',
  },
  TIKTOK: {
    bg: 'linear-gradient(135deg, #fafafa 0%, #f4f4f5 50%, #e4e4e7 100%)',
    border: '#cbd5e1',
    color: '#18181b',
    hoverBg: 'linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%)',
    hoverBorder: '#94a3b8',
    shadow: '0 2px 8px -1px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
    hoverShadow: '0 4px 14px -1px rgba(0, 0, 0, 0.15)',
    iconColor: '#e11d48',
    badgeBg: '#fecdd3',
  },
  WEBCHAT: {
    bg: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 50%, #e0e7ff 100%)',
    border: '#a5b4fc',
    color: '#3730a3',
    hoverBg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
    hoverBorder: '#818cf8',
    shadow: '0 2px 8px -1px rgba(99, 102, 241, 0.2), 0 1px 2px rgba(0, 0, 0, 0.04)',
    hoverShadow: '0 4px 14px -1px rgba(99, 102, 241, 0.35)',
    iconColor: '#4f46e5',
    badgeBg: '#c7d2fe',
  },
};

const NODE_ICONS = {
  start: Play,
  text: Type,
  interactive: Sparkles,
  image: Image,
  video: Video,
  audio: Music,
  file: FileText,
  buttons: MessageSquare,
  quickReplies: Keyboard,
  listMenu: ListOrdered,
  card: CreditCard,
  carousel: Layers,
  collectInput: Mail,
  condition: GitBranch,
  delay: Clock,
  webhook: Globe,
  httpApi: Network,
  payment: ShoppingBag,
  handoff: Headphones,
  end: CircleStop,
  question: HelpCircle,
  finalAnswer: Flag,
  runUserInputFlow: ClipboardList,
  startSequenceAction: Play,
  stopSequenceAction: CircleStop,
  wait: Clock,
  actions: Zap,
  startAutomation: Workflow,
  messageBlock: MessagesSquare,
};

const PALETTE_CATEGORIES = [
  {
    label: 'Messages',
    items: [
      { type: 'messageBlock', label: 'Send Message' },
      { type: 'interactive', label: 'Interactive (Header/Footer)' },
      { type: 'buttons', label: 'Text Message' },
      { type: 'quickReplies', label: 'Quick Replies' },
      { type: 'listMenu', label: 'List Menu' },
    ],
  },
  {
    label: 'Rich Media',
    items: [
      { type: 'image', label: 'Image' },
      { type: 'video', label: 'Video' },
      { type: 'audio', label: 'Audio' },
      { type: 'file', label: 'File / Document' },
      { type: 'card', label: 'Card' },
      { type: 'carousel', label: 'Carousel' },
    ],
  },
  {
    label: 'Logic & Automations',
    items: [
      { type: 'collectInput', label: 'Collect Input' },
      { type: 'runUserInputFlow', label: 'Run User Input Flow' },
      { type: 'condition', label: 'Condition' },
      { type: 'delay', label: 'Delay' },
      { type: 'webhook', label: 'Webhook / Zapier' },
      { type: 'httpApi', label: 'HTTP API' },
      { type: 'payment', label: 'Catalog / Payment' },
    ],
  },
  {
    label: 'Actions',
    items: [
      { type: 'actions', label: 'Actions' },
      { type: 'startAutomation', label: 'Start Automation' },
      { type: 'startSequenceAction', label: 'Start Sequence' },
      { type: 'stopSequenceAction', label: 'Stop Sequence' },
      { type: 'handoff', label: 'Agent Handoff' },
      { type: 'end', label: 'End Flow' },
    ],
  },
];

// A User Input Flow is a linear Q&A sequence, not a full bot — it only offers the
// nodes that make sense inside one (ask a question, show something, finish).
// Buttons/conditions/handoff/etc. belong to the bot Flow that calls it.
const USER_INPUT_FLOW_PALETTE = [
  {
    label: 'Questions',
    items: [
      { type: 'question', label: 'Question' },
      { type: 'finalAnswer', label: 'Final Answer' },
    ],
  },
  {
    label: 'Messages & Media',
    items: [
      { type: 'text', label: 'Text' },
      { type: 'image', label: 'Image' },
      { type: 'video', label: 'Video' },
      { type: 'audio', label: 'Audio' },
      { type: 'file', label: 'File / Document' },
    ],
  },
];

// A Sequence is a strictly one-way, non-branching broadcast (see the
// Sequence Messages plan) — content nodes plus a `wait` delay node between
// them. No question/collectInput (nothing waits for a reply) and no
// runUserInputFlow/startSequenceAction/stopSequenceAction (no nesting —
// matches the existing "a User Input Flow can't run another one" pattern).
const SEQUENCE_PALETTE = [
  {
    label: 'Timing',
    items: [
      { type: 'wait', label: 'Wait' },
    ],
  },
  {
    label: 'Messages & Media',
    items: [
      { type: 'text', label: 'Text' },
      { type: 'image', label: 'Image' },
      { type: 'video', label: 'Video' },
      { type: 'audio', label: 'Audio' },
      { type: 'file', label: 'File / Document' },
    ],
  },
  {
    label: 'Interactive',
    items: [
      { type: 'buttons', label: 'Buttons' },
      { type: 'quickReplies', label: 'Quick Replies' },
      { type: 'listMenu', label: 'List Menu' },
      { type: 'carousel', label: 'Carousel' },
    ],
  },
];

const DEFAULT_NODE_DATA = {
  start:        { label: 'When...', trigger_type: 'keyword', match_type: 'contains' },
  text:         { label: 'Text Message', message: '' },
  interactive:  { label: 'Interactive Message', headerType: 'text', headerText: '', headerMediaUrl: '', message: '', footerText: '', buttons: [{ title: 'Reply 1', action: 'flow' }] },
  image:        { label: 'Image', imageUrl: '', caption: '' },
  video:        { label: 'Video', mediaUrl: '', caption: '' },
  audio:        { label: 'Audio', mediaUrl: '' },
  file:         { label: 'File / Document', mediaUrl: '', filename: '' },
  buttons:      { label: 'Text Message', message: '', buttons: [] },
  quickReplies: { label: 'Quick Replies', message: '', replies: ['Reply 1'] },
  // `lists` (plural) is the current shape — each entry sends as its own
  // sequential list-style message, letting an author offer more options than
  // any single channel's native list supports (WhatsApp: 10 rows/message,
  // Facebook/Instagram: 10 carousel elements/message). Old flows saved before
  // this existed only have a flat `items` array — normalizeListMenuData()
  // (used by both this panel and flowEngine.js) upgrades that into a single
  // one-item `lists` entry on the fly, so nothing needs a data migration.
  listMenu:     { label: 'List Menu', lists: [{ title: 'Menu Options', buttonText: 'Options', items: ['Option 1', 'Option 2'] }] },
  card:         { label: 'Card', title: '', subtitle: '', imageUrl: '' },
  carousel:     { label: 'Carousel', cards: [{ title: 'Card 1', subtitle: '', imageUrl: '' }] },
  collectInput: { label: 'Collect Input', variable: '', inputType: 'name' },
  condition:    { label: 'Condition', variable: '', operator: 'equals', value: '' },
  delay:        { label: 'Delay', seconds: 3 },
  webhook:      { label: 'Webhook / Zapier Action', url: '', method: 'POST', payloadMode: 'ALL_VARIABLES', customPayload: '', customHeaders: '' },
  httpApi:      { label: 'HTTP API', campaignId: '' },
  payment:      { label: 'Catalog / Payment', productName: 'Order Product / Catalog', amount: 49.99, currency: 'USD', buttonLabel: '🛍️ View Catalog / Pay', successMessage: '🎉 Order received! We will process it shortly.' },
  handoff:      { label: 'Agent Handoff', message: '' },
  end:          { label: 'End', message: '' },
  runUserInputFlow: { label: 'Run User Input Flow', userInputFlowId: null, userInputFlowName: '' },
  startSequenceAction: { label: 'Start Sequence', sequenceId: null, sequenceName: '' },
  stopSequenceAction: { label: 'Stop Sequence', sequenceId: null, sequenceName: '' },
  actions: { label: 'Actions', actions: [] },
  startAutomation: { label: 'Start Automation', flowId: null, flowName: '' },
  messageBlock: { label: 'Send Message', items: [{ id: 'it_first', type: 'buttons', data: { label: 'Text Message', message: '', buttons: [] } }] },
  // Sequence-only delay step, between two content nodes — see SEQUENCE_PALETTE.
  wait: { label: 'Wait', preset: '5m', customValue: '', customUnit: 'minutes' },
  // The following two only ever appear inside a User Input Flow's own mini-builder:
  question:     { label: 'Question', message: '', answerType: 'keyboard', inputType: 'name', options: [], saveToFieldId: null },
  finalAnswer:  { label: 'Final Answer', message: 'Thanks — that\'s everything I needed!' },
};

// Every node type can optionally hold `data.delay: {hours,minutes,seconds}`
// (scheduled — see flowDelayScheduler.js on the backend, never a blocking
// sleep) EXCEPT `start` (a trigger definition, not a runtime step) and `wait`
// (a Sequence's own dedicated delay node — same idea, would be redundant).
const DELAY_EXCLUDED_NODE_TYPES = new Set(['start', 'wait']);

// A "typing…" indicator before sending only makes sense for node types that
// actually send a message to the contact.
const TYPING_ELIGIBLE_NODE_TYPES = new Set([
  'text', 'interactive', 'image', 'video', 'audio', 'file',
  'buttons', 'quickReplies', 'listMenu', 'carousel', 'card', 'messageBlock',
]);

/* ═══════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════ */

const builderStyles = `
  .flow-builder-root {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f0f2f7;
    overflow: hidden;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  /* ── Toolbar ───────────────────────────────────────────────── */
  .fb-toolbar {
    height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: #ffffff;
    border-bottom: 1px solid #e4e4f0;
    z-index: 20;
    flex-shrink: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .fb-toolbar-back {
    height: 36px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    color: #334155;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .fb-toolbar-back:hover {
    background: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }
  .fb-toolbar-name {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a2e;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 4px 10px;
    outline: none;
    transition: all 0.2s;
    min-width: 120px;
    max-width: 300px;
  }
  .fb-toolbar-name:hover,
  .fb-toolbar-name:focus {
    border-color: #e4e4f0;
    background: #f8f8fc;
  }
  .fb-platform-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    background: rgba(99, 102, 241, 0.10);
    color: #6366f1;
    border: 1px solid rgba(99, 102, 241, 0.20);
  }
  .fb-toolbar-spacer { flex: 1; }
  .fb-autosave-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #5c5c80;
    opacity: 0;
    transition: opacity 0.4s;
  }
  .fb-autosave-indicator.visible { opacity: 1; }
  .fb-save-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    border-radius: 8px;
    border: none;
    background: #6366f1;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-save-btn:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
  .fb-save-btn:active { transform: translateY(0); }
  .fb-save-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .fb-save-btn .spin { animation: fb-spin 0.8s linear infinite; }
  @keyframes fb-spin { to { transform: rotate(360deg); } }

  /* ── Main Area ─────────────────────────────────────────────── */
  .fb-main {
    flex: 1;
    display: flex;
    position: relative;
    overflow: hidden;
  }

  /* ── Palette (Left) ────────────────────────────────────────── */
  /* Chromium/Edge: hide the media player's Download item (other browsers ignore this; see controlsList on the players) */
  video::-internal-media-controls-download-button { display: none; }
  video::-webkit-media-controls-enclosure { overflow: hidden; }
  video::-webkit-media-controls-panel { width: calc(100% + 30px); }
  .fb-palette {
    width: 228px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-right: 1px solid #e4e4f0;
    z-index: 10;
    overflow-y: auto;
    box-shadow: 2px 0 8px rgba(0,0,0,0.04);
  }
  .fb-palette::-webkit-scrollbar { width: 4px; }
  .fb-palette::-webkit-scrollbar-thumb { background: #d0d0e8; border-radius: 4px; }
  .fb-palette-header {
    padding: 14px 16px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #94a3b8;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 4px;
  }
  .fb-palette-category {
    padding: 10px 14px 2px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #94a3b8;
  }
  .fb-palette-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    margin: 0 6px;
    border-radius: 6px;
    cursor: grab;
    transition: background 0.12s;
    user-select: none;
    color: #1e293b;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.3;
  }
  .fb-palette-item:hover { background: #f1f5f9; }
  .fb-palette-item:active { cursor: grabbing; }
  .fb-palette-item-icon {
    width: 16px; height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .fb-palette-item-grip {
    margin-left: auto;
    color: #cbd5e1;
    opacity: 0;
    display: flex;
    transition: opacity 0.12s;
  }
  .fb-palette-item:hover .fb-palette-item-grip { opacity: 1; }

  /* ── Canvas ────────────────────────────────────────────────── */
  .fb-canvas {
    flex: 1;
    position: relative;
  }
  .fb-canvas .react-flow__node { cursor: pointer; }
  .fb-canvas .react-flow__minimap { border-radius: 8px; overflow: hidden; border: 1px solid #e4e4f0; }
  .fb-canvas .react-flow__controls { border-radius: 8px; overflow: hidden; border: 1px solid #e4e4f0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .fb-canvas .react-flow__controls button {
    background: #ffffff;
    color: #1a1a2e;
    border-color: #e4e4f0;
  }
  .fb-canvas .react-flow__controls button:hover {
    background: #f0f0fa;
  }

  /* ── Properties Panel (Right Modal / Sidebar) ─────────────── */
  .fb-props {
    width: 320px;
    flex-shrink: 0;
    background: #ffffff;
    border-left: 1.5px solid #e2e8f0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    animation: fb-slide-in 0.2s ease-out;
    overflow-y: auto;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.05);
  }
  @keyframes fb-slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .fb-props::-webkit-scrollbar { width: 5px; }
  .fb-props::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  .fb-props-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }
  .fb-props-header h3 {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fb-props-close {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
  }
  .fb-props-close:hover { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
  .fb-props-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; background: #ffffff; }
  .fb-field { display: flex; flex-direction: column; gap: 6px; }
  .fb-field label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #475569;
  }
  .fb-field input,
  .fb-field textarea,
  .fb-field select {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 12.5px;
    color: #0f172a;
    outline: none;
    transition: all 0.15s;
    font-family: inherit;
    resize: vertical;
  }
  .fb-field input:focus,
  .fb-field textarea:focus,
  .fb-field select:focus {
    border-color: #0f172a;
    box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
    background: #ffffff;
  }
  .fb-field textarea { min-height: 80px; }
  .fb-hint { font-size: 11px; color: #94a3b8; line-height: 1.4; }
  .fb-list-item {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .fb-list-item input { flex: 1; }
  .fb-list-item-del {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .fb-list-item-del:hover { background: #fef2f2; border-color: #fecaca; color: #ef4444; }
  .fb-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1.5px dashed #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .fb-add-btn:hover { background: #f8fafc; border-color: #94a3b8; }
  .fb-done-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #0f172a;
    background: #0f172a;
    color: #ffffff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .fb-done-btn:hover { background: #1e293b; border-color: #1e293b; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15); }
  .fb-delete-node-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px;
    border-radius: 8px;
    border: 1px solid #fee2e2;
    background: #ffffff;
    color: #dc2626;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 6px;
  }
  .fb-delete-node-btn:hover { background: #fef2f2; border-color: #fca5a5; }
  /* ── Hover Node Action Toolbar (Duplicate & Delete) ────────── */
  .fb-node-hover-actions {
    position: absolute;
    top: -30px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #ffffff;
    padding: 3px 6px;
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
    border: 1px solid #e2e8f0;
    z-index: 60;
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }
  .fb-node-hover-actions::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 18px;
  }
  .fb-node:hover .fb-node-hover-actions,
  .fb-node-condition:hover .fb-node-hover-actions,
  .flow-input-node:hover .fb-node-hover-actions {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .fb-node-action-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    padding: 0;
  }
  .fb-node-duplicate-btn {
    color: #475569;
  }
  .fb-node-duplicate-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
  .fb-node-delete-btn {
    color: #ef4444;
  }
  .fb-node-delete-btn:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  /* ── Custom Node Styles ────────────────────────────────────── */
  .fb-node {
    width: 270px;
    min-width: 270px;
    max-width: 270px;
    border-radius: 16px;
    background: #ffffff;
    border: 1.5px solid #e4e4f0;
    box-shadow: 0 2px 12px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04);
    overflow: visible;
    transition: box-shadow 0.2s, border-color 0.2s;
    position: relative;
  }
  .fb-node:hover {
    box-shadow: 0 6px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);
    border-color: #c4c4e0;
  }
  .fb-node.selected {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15), 0 6px 24px rgba(0,0,0,0.10);
  }
  .fb-node.has-error,
  .fb-node-condition.has-error {
    border-color: #ef4444 !important;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.14), 0 2px 8px rgba(0,0,0,0.06) !important;
  }
  .fb-node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: 14px 14px 0 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: #fff;
  }
  .fb-node-body {
    padding: 8px 12px 10px;
    font-size: 12px;
    color: #5c5c80;
    line-height: 1.5;
    background: #ffffff;
    border-radius: 0 0 10px 10px;
  }
  .fb-node-body-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    word-break: break-word;
    color: #5c5c80;
  }
  .fb-node-warning {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px; height: 22px;
    background: #f59e0b;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
    z-index: 2;
  }
  .fb-node-btn-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 12px 10px;
  }
  .fb-node-btn-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-radius: 6px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    font-size: 11px;
    color: #334155;
    font-weight: 500;
    position: relative;
  }
  .fb-node-reply-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 12px 10px;
  }
  .fb-node-reply-chip {
    padding: 3px 8px;
    border-radius: 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    font-size: 10px;
    color: #334155;
    font-weight: 500;
  }

  /* ── Condition node ─────────────────────────────────────────── */
  .fb-node-condition {
    min-width: 270px;
    max-width: 270px;
    border-radius: 16px;
    background: #ffffff;
    border: 1.5px solid #e4e4f0;
    box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    position: relative;
    overflow: visible;
    transition: box-shadow 0.2s, border-color 0.2s;
  }
  .fb-node-condition:hover {
    box-shadow: 0 6px 24px rgba(0,0,0,0.10);
  }
  .fb-node-condition.selected {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15), 0 6px 24px rgba(0,0,0,0.10);
  }

  /* ── React Flow Handle overrides (ManyChat-exact design) ───── */
  .react-flow__handle {
    width: 13px !important;
    height: 13px !important;
    background: #64748b !important;
    border: 2px solid #ffffff !important;
    border-radius: 50% !important;
    transition: all 0.15s ease !important;
    box-shadow: 0 0 0 1px #94a3b8, 0 2px 5px rgba(0,0,0,0.12) !important;
    cursor: pointer !important;
    z-index: 10 !important;
  }
  /* Scoped away from every connector that shouldn't animate on hover — both
     the "from"/source ones (next-step-handle / btn-handle) and the "to"/
     target one (target-handle). Nothing matches this rule anymore, kept
     around only in case a future handle type is added without its own
     explicit hover treatment. */
  .react-flow__handle:hover:not(.next-step-handle):not(.btn-handle):not(.target-handle) {
    background: #0f172a !important;
    border-color: #ffffff !important;
    transform: scale(1.25) !important;
    box-shadow: 0 0 0 2px #6366f1, 0 3px 8px rgba(0,0,0,0.2) !important;
  }
  .react-flow__handle-top { top: -6px !important; }
  .react-flow__handle-bottom { bottom: -6px !important; }
  /* Every "from" (source) connector in this file uses Position.Right — this
     is the one shared rule that positions all of them, moved inward from the
     card/chip/row's edge so the whole circle sits inside it rather than
     straddling the border. Being an !important stylesheet rule, this already
     wins over the couple of per-item handles that also carry their own
     inline right value (buttons-in-a-chip, list items) — nothing further
     needed there. */
  .react-flow__handle-right { right: 10px !important; }
  /* Several per-button/per-item handles carry an inline
     transform: translateY(-50%) which REPLACES React Flow's own
     translate(50%, -50%) — losing the horizontal half-width shift the Next
     Step handle (which has no inline transform) keeps. That is what left every
     button connector ~6px off the Next Step line. Pinning the full transform
     here puts them all on the same vertical line. */
  .react-flow__handle-right { transform: translate(50%, -50%) !important; }
  .react-flow__handle-left { left: 3px !important; }
  /* A per-button/per-item dot lives inside its own small chip, not the card's
     padded content edge the rule above assumes — so "10px inward from the
     chip" landed 14-24px inward from the CARD's true edge (the chip's own
     padding on top), well short of where every other connector (Next Step,
     Then, Yes/No…) sits. That's what made them look misaligned/out of line.
     Pushing these two chip flavors further right (poking just past their own
     chip's border, not stretching the chip itself) lands the dot on the same
     vertical line as every other connector on the canvas — this depends on
     each card family's actual right padding, so the two chip shapes get
     different offsets: the "Send Message card" family (Text/Interactive/
     Image/Video/Audio/File/Buttons) pads 14px, ListMenu's NodeWrapper-based
     card pads 12px (see .fb-node-btn-list). */
  .btn-handle.react-flow__handle-right { right: -4px !important; }
  .fb-node-btn-chip .btn-handle.react-flow__handle-right { right: -2px !important; }

  /* Every outgoing (source) connector circle — Next Step, per-button/
     per-item, Start's own "Then"/"Sequence" branches, Condition's Yes/No —
     one consistent look: blank/hollow while nothing is wired to it, filled
     solid the instant a real edge connects (the .connected class, applied
     per-handle in the node components via useConnectedHandles /
     useNodeConnections). Previously these came in two different, always-on
     looks (a hollow ring for Next Step, an always-filled dot for buttons/
     Then) with no connection-state awareness at all. */
  .react-flow__handle.next-step-handle,
  .react-flow__handle.btn-handle,
  .react-flow__handle[id^="btn-"],
  .react-flow__handle[id^="qr-"],
  .react-flow__handle[id^="item-"],
  .react-flow__handle[id="then"],
  .react-flow__handle[id="attach-sequence"],
  .react-flow__handle[id="next-step"],
  .react-flow__handle[id="next"],
  .react-flow__handle[id="yes"],
  .react-flow__handle[id="no"] {
    width: 13px !important;
    height: 13px !important;
    background: #ffffff !important;
    border: 2px solid #94a3b8 !important;
    border-radius: 50% !important;
    box-shadow: none !important;
    cursor: pointer !important;
  }
  .react-flow__handle.next-step-handle.connected,
  .react-flow__handle.btn-handle.connected,
  .react-flow__handle[id^="btn-"].connected,
  .react-flow__handle[id^="qr-"].connected,
  .react-flow__handle[id^="item-"].connected,
  .react-flow__handle[id="then"].connected,
  .react-flow__handle[id="attach-sequence"].connected,
  .react-flow__handle[id="next-step"].connected,
  .react-flow__handle[id="next"].connected,
  .react-flow__handle[id="yes"].connected,
  .react-flow__handle[id="no"].connected {
    background: #64748b !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 0 0 1px #94a3b8 !important;
  }
  /* No hover animation on these — hovering looks identical to not hovering,
     for both the blank and filled state. Deliberately NOT declaring
     transform here at all (unlike an earlier version of this rule that set
     transform: none — that actually wiped out React Flow's own positioning
     transform on the element, which is applied inline and only takes effect
     when nothing more specific overrides it, causing the circle to visibly
     jump on hover, the opposite of "no animation"). Excluding these classes
     from the base hover rule above is what actually stops the scale;
     nothing here needs to fight it. */
  .react-flow__handle.next-step-handle:hover,
  .react-flow__handle.btn-handle:hover,
  .react-flow__handle[id^="btn-"]:hover,
  .react-flow__handle[id^="qr-"]:hover,
  .react-flow__handle[id^="item-"]:hover,
  .react-flow__handle[id="then"]:hover,
  .react-flow__handle[id="attach-sequence"]:hover,
  .react-flow__handle[id="next-step"]:hover,
  .react-flow__handle[id="next"]:hover,
  .react-flow__handle[id="yes"]:hover,
  .react-flow__handle[id="no"]:hover {
    background: #ffffff !important;
    border: 2px solid #94a3b8 !important;
    box-shadow: none !important;
  }
  .react-flow__handle.next-step-handle.connected:hover,
  .react-flow__handle.btn-handle.connected:hover,
  .react-flow__handle[id^="btn-"].connected:hover,
  .react-flow__handle[id^="qr-"].connected:hover,
  .react-flow__handle[id^="item-"].connected:hover,
  .react-flow__handle[id="then"].connected:hover,
  .react-flow__handle[id="attach-sequence"].connected:hover,
  .react-flow__handle[id="next-step"].connected:hover,
  .react-flow__handle[id="next"].connected:hover,
  .react-flow__handle[id="yes"].connected:hover,
  .react-flow__handle[id="no"].connected:hover {
    background: #64748b !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 0 0 1px #94a3b8 !important;
  }

  /* Target connector on node left side (discreet circle matching card border,
     always filled — the "receiving" side isn't part of the blank/filled
     connection-state treatment above, it's always visually present). */
  .react-flow__handle-left,
  .react-flow__handle.target-handle,
  .react-flow__handle[type="target"] {
    width: 9px !important;
    height: 9px !important;
    background: #64748b !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 0 0 1px #cbd5e1 !important;
    left: 3px !important;
  }
  /* No hover animation here either — restates the same resting look above,
     no transform, so hovering the receiving side looks identical to not
     hovering it (same treatment as the "from" connectors, just also applied
     to "to"). */
  .react-flow__handle.target-handle:hover,
  .react-flow__handle[type="target"]:hover {
    background: #64748b !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 0 0 1px #cbd5e1 !important;
  }

  /* Red "remove button" cross on a button chip: hidden until the chip is
     hovered (or the cross itself is keyboard-focused). */
  .fb-btn-remove { opacity: 0; pointer-events: none; transition: opacity 0.12s; }
  *:hover > .fb-btn-remove,
  .fb-btn-remove:focus-visible { opacity: 1; pointer-events: auto; }

  /* ── Next Step row (bottom of card) ────────────────────────── */
  .fb-next-step-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    /* Extra right padding (up from 14px) so the label has real breathing
       room before the circle — the circle itself is absolutely positioned
       (React Flow's own Handle behavior) so it doesn't participate in this
       row's flex gap at all; padding-right is what actually keeps it clear
       of the text. */
    padding: 8px 28px 10px 14px;
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    position: relative;
    background: transparent;
    border-top: 1px dashed #f1f5f9;
  }

  /* ── Edge styling (ManyChat smooth slate curved connection lines) */
  /* Raise edge SVG layer so wires starting from inside buttons are visible over container backgrounds */
  .react-flow__edges {
    z-index: 4 !important;
  }
  .react-flow__edge {
    z-index: 4 !important;
  }
  .react-flow__edge-path {
    stroke: #94a3b8 !important;
    stroke-width: 1.75 !important;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: stroke 0.15s ease, stroke-width 0.15s ease;
  }
  .react-flow__edge.selected .react-flow__edge-path {
    stroke: #0f172a !important;
    stroke-width: 2.5 !important;
  }
  .react-flow__edge:hover .react-flow__edge-path {
    stroke: #475569 !important;
    stroke-width: 2.5 !important;
  }

  /* ── Loading State ─────────────────────────────────────────── */
  .fb-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: var(--bg-base, #0f1117);
    color: var(--text-primary, #e2e8f0);
    gap: 16px;
  }
  .fb-loading-spinner {
    animation: fb-spin 1s linear infinite;
    color: var(--primary, #6366f1);
  }

  /* ── Condition label badges ────────────────────────────────── */
  .fb-condition-outputs {
    display: flex;
    justify-content: space-between;
    padding: 0 14px 10px;
    gap: 8px;
  }
  .fb-condition-label {
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .fb-condition-yes {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }
  .fb-condition-no {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* ═══════════════════════════════════════════════════════════════════
     FLOW BUILDER ENHANCEMENTS
     ═══════════════════════════════════════════════════════════════════ */

  /* ── Top Bar ───────────────────────────────────────────────── */
  .flow-topbar {
    height: 52px;
    padding: 0 16px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  }
  .flow-tool-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1.5px solid #e2e8f0;
    background: #ffffff;
    color: #475569;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    transition: all 0.2s ease;
  }
  .flow-tool-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    transform: translateY(-0.5px);
  }
  .flow-layout-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 16px;
    border-radius: 8px;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    color: #334155;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    transition: all 0.2s ease;
    height: 34px;
    position: relative;
    overflow: hidden;
  }
  .flow-layout-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    transform: translateY(-0.5px);
  }
  .flow-preview-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 18px;
    border-radius: 8px;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    color: #0f172a;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    transition: all 0.2s ease;
    height: 34px;
    position: relative;
    overflow: hidden;
  }
  .flow-preview-toggle-btn:hover,
  .flow-preview-toggle-btn.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.18);
    transform: translateY(-0.5px);
  }
  /* ── Canvas Floating Hint Tooltip ──────────────────────────── */
  .flow-canvas-hint {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(254, 240, 138, 0.95);
    border: 1px solid #fde047;
    color: #854d0e;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 11.5px;
    font-weight: 600;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* ── Interactive Smartphone Device Simulator ─────────────────── */
  .flow-preview-wrapper {
    width: 360px;
    height: calc(100vh - 56px);
    position: absolute;
    right: 16px;
    top: 56px;
    z-index: 30;
    pointer-events: none;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 18px;
    box-sizing: border-box;
  }
  .flow-phone-device {
    pointer-events: auto;
    width: 336px;
    height: 740px;
    max-height: calc(100vh - 96px);
    background: #0b0f19;
    border-radius: 44px;
    padding: 11px;
    box-shadow: 0 25px 60px -12px rgba(0,0,0,0.5), 0 0 0 3px #1f293d, 0 0 0 7px #0f172a;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }
  .flow-phone-notch {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: 85px;
    height: 18px;
    background: #000000;
    border-radius: 20px;
    z-index: 15;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    box-sizing: border-box;
  }
  .flow-phone-speaker {
    width: 34px;
    height: 3px;
    background: #262626;
    border-radius: 2px;
  }
  .flow-phone-camera {
    width: 8px;
    height: 8px;
    background: #171717;
    border-radius: 50%;
    border: 1px solid #262626;
  }
  .flow-phone-screen {
    width: 100%;
    height: 100%;
    background: #0f172a;
    border-radius: 34px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .flow-phone-header {
    padding: 30px 14px 10px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .flow-phone-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .flow-phone-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #0084ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #fff;
    flex-shrink: 0;
  }
  .flow-phone-header-info {
    min-width: 0;
  }
  .flow-phone-header-name {
    font-size: 12px;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .flow-phone-header-status {
    font-size: 10px;
    color: #94a3b8;
    line-height: 1.2;
  }
  .flow-phone-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .flow-phone-header-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: #334155;
    border: none;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .flow-phone-header-btn:hover {
    background: #475569;
    color: #ffffff;
  }
  .flow-phone-chat-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .flow-phone-msg-row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    width: 100%;
  }
  .flow-phone-msg-row.user-row {
    justify-content: flex-end;
  }
  .flow-phone-chat-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #0084ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    flex-shrink: 0;
    margin-bottom: 2px;
  }
  .flow-phone-bubble {
    max-width: 84%;
    border-radius: 16px;
    padding: 9px 12px;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
  }
  .flow-phone-bubble.bot-bubble {
    background: #1e293b;
    color: #f1f5f9;
    border-bottom-left-radius: 4px;
  }
  .flow-phone-bubble.user-bubble {
    background: #0084ff;
    color: #ffffff;
    border-bottom-right-radius: 4px;
  }
  .flow-phone-text {
    font-size: 12px;
  }
  .flow-phone-image-box {
    margin-top: 6px;
    border-radius: 10px;
    overflow: hidden;
  }
  .flow-phone-img {
    width: 100%;
    max-height: 140px;
    object-fit: cover;
    display: block;
  }
  .flow-phone-img-placeholder {
    height: 90px;
    background: #334155;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: #94a3b8;
    font-size: 11px;
  }
  .flow-phone-caption {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 4px;
  }
  .flow-phone-btn-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .flow-phone-choice-btn {
    width: 100%;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #253349;
    color: #38bdf8;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
  }
  .flow-phone-choice-btn:hover {
    background: #334155;
    color: #ffffff;
  }
  .flow-phone-qr-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }
  .flow-phone-qr-btn {
    padding: 4px 10px;
    border-radius: 14px;
    border: 1px solid #0084ff;
    background: transparent;
    color: #38bdf8;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .flow-phone-qr-btn:hover {
    background: #0084ff;
    color: #ffffff;
  }
  .flow-phone-typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
  }
  .flow-phone-typing .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #94a3b8;
    animation: flow-typing 1.4s infinite ease-in-out;
  }
  .flow-phone-typing .dot:nth-child(1) { animation-delay: 0s; }
  .flow-phone-typing .dot:nth-child(2) { animation-delay: 0.2s; }
  .flow-phone-typing .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes flow-typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }
  /* Compact "typing indicator is on" badge shown in a node card's own header
     (NodeWrapper) — reuses the same three-dot animation/keyframe as the phone
     preview's typing bubble above, just smaller. */
  .fb-node-typing-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgba(14, 165, 233, 0.12);
  }
  .fb-node-typing-badge .dot {
    width: 3.5px;
    height: 3.5px;
    border-radius: 50%;
    background: #0ea5e9;
    animation: flow-typing 1.4s infinite ease-in-out;
  }
  .fb-node-typing-badge .dot:nth-child(1) { animation-delay: 0s; }
  .fb-node-typing-badge .dot:nth-child(2) { animation-delay: 0.2s; }
  .fb-node-typing-badge .dot:nth-child(3) { animation-delay: 0.4s; }
  .flow-phone-input-bar {
    padding: 8px 10px;
    background: #1e293b;
    border-top: 1px solid #334155;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .flow-phone-input-field {
    flex: 1;
    height: 32px;
    border-radius: 16px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #f8fafc;
    font-size: 11.5px;
    padding: 0 12px;
    outline: none;
  }
  .flow-phone-send-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: #0084ff;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .flow-phone-send-btn:hover:not(:disabled) {
    background: #0073e6;
  }
  .flow-phone-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/* ═══════════════════════════════════════════════════════════════════
   HELPER: Platform validation
   ═══════════════════════════════════════════════════════════════════ */

/* ── "Message Block" node ──────────────────────────────────────────────
   One card that holds an ordered list of ordinary message elements
   (data.items = [{ id, type, data }]) — text, media, card/carousel, and (last)
   one that waits for a reply. Each element keeps exactly the data shape of the
   standalone node of that type, and the backend expands the block into that
   chain of nodes at load time (utils/flowGraph.js expandMessageBlocks), so every
   element sends through the same per-channel code as a normal node.
   Only an ENDING element may wait for a reply, so it is always last. */
// 'buttons' is the "Text" element: a message with 0-3 optional buttons, each with its own
// connector — buttons on a text/image do not stop the block, later elements still send.
const BLOCK_CONTENT_TYPES = ['buttons', 'image', 'video', 'audio', 'file', 'card', 'carousel', 'delay'];
const BLOCK_ENDING_TYPES = ['quickReplies', 'listMenu', 'interactive'];
const BLOCK_ITEM_LABELS = {
  text: 'Text',
  buttons: 'Text',
  delay: 'Delay',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  file: 'File / Document',
  card: 'Card',
  carousel: 'Carousel',
  quickReplies: 'Quick Replies',
  listMenu: 'List Menu',
  interactive: 'Interactive (Header/Footer)',
};

// A text element with a message and no buttons — the only thing quick replies can attach to.
function isPlainBlockText(item) {
  return !!item && (item.type === 'buttons' || item.type === 'text')
    && !!(item.data?.message || '').trim() && !(item.data?.buttons || []).length;
}

function newBlockItem(type) {
  return {
    id: `it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type,
    data: JSON.parse(JSON.stringify(DEFAULT_NODE_DATA[type] || {})),
  };
}

/* ── "Actions" node: the individual side-effects it can run ────────────
   One Actions node holds an ordered list of these (ManyChat-style), each
   {id, type, ...target}. Names are snapshotted onto the action so the canvas
   card can show them without re-fetching; the engine only reads the ids. */
const ACTION_TYPES = {
  add_label:       { label: 'Add Label',             group: 'Labels',        icon: Tag,       target: 'label' },
  remove_label:    { label: 'Remove Label',          group: 'Labels',        icon: Tag,       target: 'label' },
  add_sequence:    { label: 'Add to Sequence',       group: 'Sequences',     icon: Layers,    target: 'sequence' },
  remove_sequence: { label: 'Remove from Sequence',  group: 'Sequences',     icon: Layers,    target: 'sequence' },
  set_field:       { label: 'Set Custom Field',      group: 'Custom Fields', icon: Settings2, target: 'field', hasValue: true },
  clear_field:     { label: 'Clear Custom Field',    group: 'Custom Fields', icon: Settings2, target: 'field' },
};

function isActionConfigured(a) {
  const t = ACTION_TYPES[a?.type];
  if (!t) return false;
  if (t.target === 'label') return !!a.labelId;
  if (t.target === 'sequence') return !!a.sequenceId;
  if (t.target === 'field') return !!a.fieldId && (!t.hasValue || String(a.value ?? '').trim() !== '');
  return false;
}

function describeAction(a) {
  const t = ACTION_TYPES[a?.type];
  if (!t) return '';
  if (t.target === 'label') return a.labelName || '';
  if (t.target === 'sequence') return a.sequenceName || '';
  if (t.hasValue) return a.fieldName ? `${a.fieldName} = ${a.value ?? ''}` : '';
  return a.fieldName || '';
}

function isNodeSupportedOnPlatform(nodeType, platform) {
  if (!platform) return true;
  const p = (platform || 'WEBCHAT').toUpperCase();
  const rules = PLATFORM_RULES[p] || PLATFORM_RULES.WEBCHAT;
  if (nodeType === 'start') return true;
  const rule = rules[nodeType];
  return rule !== false && rule !== undefined;
}

// PLATFORM_RULES already carries a numeric item cap for some node types (e.g.
// WHATSAPP.listMenu = 10, FACEBOOK.quickReplies = 13) alongside the plain
// true/false support flags isNodeSupportedOnPlatform() reads — this is the
// first place anything actually reads the number itself, so the builder UI
// can enforce it instead of only hinting at it. Returns null when the
// platform has no numeric cap for that node type (either unsupported, or
// supported without a hard limit).
// Sequences must stay a single linear chain (no branching, no waiting for a
// reply — see the Sequence Messages plan). Mirrors flowGraph.js's
// findFirstBranchingNodeId on the backend (frontend/backend can't share a
// module in this codebase) — returns the first node with more than one
// outgoing edge, or null if the graph is already linear.
function findFirstBranchingNodeId(nodes, edges) {
  const outgoingCount = new Map();
  for (const edge of edges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) || 0) + 1);
  }
  for (const node of nodes) {
    if ((outgoingCount.get(node.id) || 0) > 1) return node.id;
  }
  return null;
}

function getNodeItemCap(nodeType, platform) {
  const p = (platform || 'WEBCHAT').toUpperCase();
  const rules = PLATFORM_RULES[p] || PLATFORM_RULES.WEBCHAT;
  const rule = rules[nodeType];
  return typeof rule === 'number' ? rule : null;
}

// A list item used to be a plain string. It's now an object carrying the same
// action shape a button has (plus `description`, which WhatsApp rows support
// natively) — this coerces either shape into the current one, defaulting a
// bare string (or an object with no `.action` at all) to 'flow' so an old
// item, wired only by its canvas edge, keeps behaving exactly as before.
function normalizeListItem(item) {
  if (typeof item === 'string') return { title: item, action: 'flow' };
  return { action: 'flow', ...item };
}

// Upgrades a listMenu node's data to the current `lists: [{title, buttonText,
// sections: [{title, items}]}]` shape — `sections` is WhatsApp's own native
// grouping (up to 10 sections, 10 rows total, all within ONE message), which
// is a different axis from `lists` itself (each *list* is a separate
// sequential MESSAGE, used to go past that 10-row cap). A list saved before
// section support only has a flat `items` array — that becomes one untitled
// section here, and a flat top-level `items` (pre-multi-list data) becomes a
// single list with one section — so old data keeps working with zero
// migration. flowEngine.js keeps its own copy of this (frontend/backend can't
// share a module in this codebase), hand-kept in sync — see the note there.
function normalizeListMenuData(data) {
  let lists;
  if (Array.isArray(data?.lists) && data.lists.length > 0) {
    lists = data.lists;
  } else if (Array.isArray(data?.items)) {
    lists = [{ title: data.title || 'Menu Options', buttonText: data.buttonText || 'Options', items: data.items }];
  } else {
    lists = [{ title: 'Menu Options', buttonText: 'Options', items: [] }];
  }

  return lists.map((list) => {
    const rawSections = Array.isArray(list.sections) && list.sections.length > 0
      ? list.sections
      : [{ title: '', items: list.items || [] }];
    const sections = rawSections.map((s) => ({ ...s, items: (s.items || []).map(normalizeListItem) }));
    // `items` kept as a flattened convenience view alongside `sections` — the
    // source of truth is `sections`, but a handful of call sites still read
    // the flat list (cap counts, dimension estimates) and this keeps them
    // correct without having to touch every one of them.
    return { ...list, sections, items: sections.flatMap((s) => s.items) };
  });
}

/* ═══════════════════════════════════════════════════════════════════
   HELPER: Generate node ID
   ═══════════════════════════════════════════════════════════════════ */

let nodeIdCounter = 0;
function generateNodeId(type) {
  nodeIdCounter += 1;
  return `${type}_${Date.now()}_${nodeIdCounter}`;
}

/* ═══════════════════════════════════════════════════════════════════
   HELPER: Component Data Validation
   ═══════════════════════════════════════════════════════════════════ */

/* ── Bot scope, checked in the browser too ─────────────────────────────
   A flow may only use Sequences / User Input Flows / Flows of ITS OWN bot account (the server
   enforces it — utils/botScope.js). The builder's pickers only load this bot's own items, so any
   reference whose id isn't in those lists is foreign: flag the exact element instead of waiting
   for the server to refuse the save. */
const BOT_REF_KEYS = {
  sequenceId: { kind: 'Sequence', nameKey: 'sequenceName' },
  userInputFlowId: { kind: 'User Input Flow', nameKey: 'userInputFlowName' },
  flowId: { kind: 'Flow', nameKey: 'flowName' },
};

function findForeignRefs(nodes, { sequences, userInputFlows, flows }) {
  const setOf = (list) => (list ? new Set(list.map((x) => Number(x.id))) : null); // null = list not loaded → skip that kind
  const own = { sequenceId: setOf(sequences), userInputFlowId: setOf(userInputFlows), flowId: setOf(flows) };
  const out = [];
  for (const n of nodes || []) {
    const nodeLabel = n?.data?.label || n?.type;
    const walk = (v, itemId, where) => {
      if (Array.isArray(v)) { v.forEach((x) => walk(x, itemId, where)); return; }
      if (!v || typeof v !== 'object') return;
      const here = v.title || v.label || where;
      for (const [k, val] of Object.entries(v)) {
        const ref = BOT_REF_KEYS[k];
        if (ref && val !== null && val !== undefined && /^\d+$/.test(String(val))) {
          if (own[k] && !own[k].has(Number(val))) {
            const name = v[ref.nameKey] ? ` "${v[ref.nameKey]}"` : ` #${val}`;
            const label = [nodeLabel, here && here !== nodeLabel ? `"${here}"` : null].filter(Boolean).join(' → ');
            out.push({ nodeId: n.id, itemId, message: `${label}: ${ref.kind}${name} isn't one of this bot's own — pick this bot's own ${ref.kind} or remove it` });
          }
        } else {
          walk(val, itemId, here);
        }
      }
    };
    if (n?.type === 'messageBlock') {
      for (const item of Array.isArray(n.data?.items) ? n.data.items : []) walk(item?.data, item?.id || null, null);
    } else {
      walk(n?.data, null, null);
    }
  }
  return out;
}

const escapeHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Message Block: the error text AND the id of the element that has it (so the panel can open it).
function validateMessageBlock(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) return { error: 'Add at least one element', itemId: null };
  const endIdx = items.findIndex((i) => BLOCK_ENDING_TYPES.includes(i.type));
  if (endIdx >= 0 && endIdx !== items.length - 1) {
    return { error: 'Quick replies, lists and interactive messages must be the last element', itemId: items[endIdx].id };
  }
  for (let i = 0; i < items.length; i += 1) {
    let itemData = items[i].data || {};
    // Quick replies with no text of their own attach to the plain message right above them.
    if (items[i].type === 'quickReplies' && !(itemData.message || '').trim() && isPlainBlockText(items[i - 1])) {
      itemData = { ...itemData, message: items[i - 1].data.message };
    }
    const err = validateNodeData({ type: items[i].type, data: itemData });
    if (err) return { error: `${BLOCK_ITEM_LABELS[items[i].type] || 'Element'} ${i + 1}: ${err}`, itemId: items[i].id };
  }
  return { error: null, itemId: null };
}

function validateNodeData(node) {
  if (!node) return null;
  const data = node.data || {};

  // A button (or list item, which shares the same action shape) whose "when
  // pressed" action needs a destination but doesn't have one — e.g. left on
  // "Open Website" with no URL typed in — used to save silently and just do
  // nothing when tapped. Surfaced here so it blocks save instead.
  const validateActionTarget = (btn) => {
    if (typeof btn === 'string') return null; // legacy plain item, always 'flow'
    const action = btn?.action || 'flow';
    const label = (btn?.title || 'Untitled').trim() || 'Untitled';
    if (action === 'url' && !(btn.url || '').trim()) {
      return `"${label}" is set to open a website but has no URL — add one or change what it does`;
    }
    if (action === 'phone' && !(btn.phone || '').trim()) {
      return `"${label}" is set to call a number but has no phone number — add one or change what it does`;
    }
    if (action === 'goToFlow' && !btn.flowId) {
      return `"${label}" is set to go to another flow but none is selected — pick one or change what it does`;
    }
    return null;
  };

  // Per-node optional Delay — sanity-checked regardless of node type (except
  // the two types that don't offer it at all — see DELAY_EXCLUDED_NODE_TYPES).
  if (!DELAY_EXCLUDED_NODE_TYPES.has(node.type) && data.delay && typeof data.delay === 'object') {
    const { hours = 0, minutes = 0, seconds = 0 } = data.delay;
    if ([hours, minutes, seconds].some((n) => !Number.isFinite(n) || n < 0)) {
      return 'Delay values must be zero or a positive number';
    }
    if (hours * 3600 + minutes * 60 + seconds > 48 * 3600) {
      return 'Delay cannot be longer than 48 hours';
    }
  }

  switch (node.type) {
    case 'start': {
      // User Input Flows, Sequences, Broadcasts, and Chat Widgets don't use keyword triggers:
      // - UIF is invoked by a bot Flow's "Run User Input Flow" node
      // - Sequence is enrolled via Start Sequence actions
      // - Broadcast is dispatched via the broadcast engine
      // - Chat Widget is launched via the website embed widget
      if (
        data.uifStart ||
        data.sequenceStart ||
        data.broadcastStart ||
        data.chatWidgetStart ||
        data.trigger_type === 'CHAT_WIDGET' ||
        data.trigger_type === 'chat_widget'
      ) return null;
      if (data.triggers && data.triggers.length > 0) {
        for (const trg of data.triggers) {
          if (
            trg.match_type !== 'thumbs_up' &&
            trg.type !== 'first_contact' &&
            trg.type !== 'any' &&
            trg.type !== 'chat_widget' &&
            trg.type !== 'CHAT_WIDGET'
          ) {
            const raw = trg.keywords || (trg.trigger_keyword ? trg.trigger_keyword.split(',') : []);
            const kwList = Array.isArray(raw) ? raw.filter((k) => k && String(k).trim()) : [];
            if (kwList.length === 0) return 'Please set at least one trigger keyword';
          }
        }
        return null;
      }
      if (data.trigger_type === 'keyword' || (!data.trigger_type && !data.chatWidgetStart && !data.broadcastStart && !data.uifStart && !data.sequenceStart)) {
        if (data.match_type === 'thumbs_up') return null;
        const rawKw = data.keywords || (data.trigger_keyword ? data.trigger_keyword.split(',') : []);
        const kwList = Array.isArray(rawKw) ? rawKw.filter((k) => k && String(k).trim()) : [];
        if (kwList.length === 0) return 'Please set at least one trigger keyword';
      }
      return null;
    }

    case 'text': {
      if (!data.message || !data.message.trim()) {
        return 'Text Message cannot be empty';
      }
      for (const btn of data.buttons || []) {
        const err = validateActionTarget(btn);
        if (err) return err;
      }
      return null;
    }

    case 'interactive': {
      if (!data.message || !data.message.trim()) {
        return 'Message body cannot be empty for Interactive Message';
      }
      if (data.headerType && data.headerType !== 'none' && data.headerType === 'text' && !(data.headerText || '').trim()) {
        return 'Header text is required when Text header is selected';
      }
      if (data.headerType && ['image', 'video', 'document'].includes(data.headerType) && !(data.headerMediaUrl || '').trim()) {
        return 'Header media attachment or URL is required';
      }
      for (const btn of data.buttons || []) {
        const err = validateActionTarget(btn);
        if (err) return err;
      }
      return null;
    }

    case 'image': {
      if (!(data.imageUrl || data.mediaUrl || '').trim()) {
        return 'Image URL or uploaded image is required';
      }
      for (const btn of data.buttons || []) {
        const err = validateActionTarget(btn);
        if (err) return err;
      }
      return null;
    }

    case 'video':
      if (!(data.mediaUrl || '').trim()) {
        return 'Video URL or uploaded video is required';
      }
      return null;

    case 'audio':
      if (!(data.mediaUrl || '').trim()) {
        return 'Audio URL or uploaded audio is required';
      }
      return null;

    case 'file':
      if (!(data.mediaUrl || data.filename || '').trim()) {
        return 'Document file or filename is required';
      }
      return null;

    case 'buttons': {
      if (!data.message || !data.message.trim()) {
        return 'Text Message cannot be empty';
      }
      for (const btn of data.buttons || []) {
        const err = validateActionTarget(btn);
        if (err) return err;
      }
      return null;
    }

    case 'quickReplies':
      if (!data.message || !data.message.trim()) {
        return 'Quick replies message cannot be empty';
      }
      if ((data.replies || []).filter((r) => (typeof r === 'string' ? r : r?.title || '').trim()).length === 0) {
        return 'At least one quick reply option is required';
      }
      return null;

    case 'listMenu': {
      const lists = normalizeListMenuData(data);
      if (lists.length === 0) {
        return 'At least one list is required';
      }
      for (const list of lists) {
        if (!list.title || !list.title.trim()) {
          return 'Every list needs a title';
        }
        // WhatsApp's own native caps for a single list MESSAGE — up to 10
        // sections, 10 rows total across all of them combined (not per
        // section) — see normalizeListMenuData's note on `lists` vs
        // `sections`. Add another list (a separate message) for real overflow.
        if (list.sections.length > 10) {
          return `"${list.title}" has more than 10 sections — split the rest into another list instead`;
        }
        const validItems = list.items.filter((it) => (it?.title || '').trim());
        if (validItems.length === 0) {
          return `"${list.title}" needs at least one item`;
        }
        if (validItems.length > 10) {
          return `"${list.title}" has more than 10 items total — add another list instead`;
        }
        for (const section of list.sections) {
          if (section.items.length > 0 && !(section.title || '').trim() && list.sections.length > 1) {
            return `"${list.title}" has an untitled section — give every section a name, or merge it into one`;
          }
          for (const item of section.items) {
            const err = validateActionTarget(item);
            if (err) return err;
          }
        }
      }
      return null;
    }

    case 'card':
      if (!(data.title || '').trim() && !(data.imageUrl || '').trim()) {
        return 'Card requires at least a title or image';
      }
      return null;

    case 'carousel':
      if (!data.cards || data.cards.length === 0) {
        return 'Carousel requires at least one card';
      }
      if (!data.cards.some((c) => (c.title || '').trim() || (c.imageUrl || '').trim())) {
        return 'At least one card needs a title or image';
      }
      return null;

    case 'collectInput':
      if (!data.variable || !data.variable.trim()) {
        return 'Variable name to save input is required';
      }
      return null;

    case 'question':
      // A question is identified solely by its Custom Field now (no separate
      // variable name) — the field's own field_key/name serve both roles.
      if (!data.saveToFieldId || data.saveToFieldId === 'CREATE_NEW') {
        return 'Select or create a Custom Field for this question';
      }
      if (data.answerType === 'choice') {
        const validOptions = (data.options || []).filter((o) => o && o.trim());
        if (validOptions.length < 2) {
          return 'Add at least 2 options for a Multiple Choice question';
        }
        if (validOptions.length > 10) {
          return 'A Multiple Choice question cannot have more than 10 options';
        }
      }
      return null;

    case 'runUserInputFlow':
      if (!data.userInputFlowId) {
        return 'Select or create a User Input Flow to run';
      }
      return null;

    case 'startSequenceAction':
    case 'stopSequenceAction':
      if (!data.sequenceId) {
        return `Select ${node.type === 'stopSequenceAction' ? 'a Sequence to stop' : 'or create a Sequence to start'}`;
      }
      return null;

    case 'messageBlock':
      return validateMessageBlock(data).error;

    case 'actions': {
      const list = Array.isArray(data.actions) ? data.actions : [];
      if (list.length === 0) return 'Add at least one action';
      const bad = list.find((a) => !isActionConfigured(a));
      if (bad) return `Finish setting up "${ACTION_TYPES[bad.type]?.label || 'action'}"`;
      return null;
    }

    case 'startAutomation':
      if (!data.flowId) return 'Choose an automation to start';
      return null;

    case 'wait':
      if (data.preset === 'custom' && !(Number(data.customValue) > 0)) {
        return 'Enter a custom wait duration greater than 0';
      }
      return null;

    case 'finalAnswer':
      return null;

    case 'condition':
      if (data.compareSource === 'customField') {
        if (!data.customFieldId) {
          return 'Select a Custom Field to compare';
        }
      } else if (!data.variable || !data.variable.trim()) {
        return 'Variable to evaluate is required';
      }
      if (data.value === undefined || String(data.value).trim() === '') {
        return 'Comparison value is required';
      }
      return null;

    case 'delay': {
      // A Delay node's own wait now comes from the same generic "Delay
      // before this step" field every node type has (see DelaySettings) —
      // data.seconds is only read here as a fallback for older saved flows
      // that set it before that field existed.
      const d = data.delay;
      const total = d && typeof d === 'object'
        ? (Number(d.hours) || 0) * 3600 + (Number(d.minutes) || 0) * 60 + (Number(d.seconds) || 0)
        : (Number(data.seconds) || 0);
      if (total <= 0) return 'Set how long this Delay node should wait';
      return null;
    }

    case 'webhook':
      if (!data.url || !data.url.trim()) {
        return 'Webhook URL endpoint is required';
      }
      return null;

    case 'httpApi':
      if (!data.campaignId) {
        return 'Select an HTTP API Campaign';
      }
      return null;

    case 'payment':
      if (!data.productName || !data.productName.trim()) {
        return 'Product or service name is required';
      }
      if (!data.amount || Number(data.amount) <= 0) {
        return 'Payment amount must be greater than 0';
      }
      return null;

    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HELPER: Auto-Layout (Overlap-Free, Handle-Ordered Left-to-Right Flow)
   ═══════════════════════════════════════════════════════════════════ */

function getNodeDimensions(node) {
  const width = 270;
  if (!node) return { width, height: 110 };

  switch (node.type) {
    case 'start': {
      const kws = node.data?.keywords || [];
      return { width, height: kws.length > 2 ? 120 : 100 };
    }
    case 'text':
      return { width, height: (node.data?.message?.length || 0) > 60 ? 140 : 110 };
    case 'image': {
      const hasCap = Boolean(node.data?.caption);
      // Give image node ample allocated height and extra breathing room
      return { width, height: hasCap ? 205 : 175 };
    }
    case 'quickReplies': {
      const count = (node.data?.replies || []).length;
      return { width, height: 95 + Math.max(1, count) * 34 };
    }
    case 'interactive': {
      const count = (node.data?.buttons || []).length;
      const hasHdr = node.data?.headerType && node.data?.headerType !== 'none';
      const hasFtr = !!(node.data?.footerText || '').trim();
      return { width, height: 110 + (hasHdr ? 32 : 0) + (hasFtr ? 24 : 0) + Math.max(1, count) * 34 };
    }
    case 'buttons': {
      const count = (node.data?.buttons || []).length;
      return { width, height: 90 + Math.max(1, count) * 34 };
    }
    case 'listMenu': {
      const lists = normalizeListMenuData(node.data);
      const count = lists.reduce((sum, l) => sum + l.items.length, 0);
      // Every section beyond the first (per list) gets its own little title
      // row above its items — the section itself, not just its rows, needs
      // height reserved for it.
      const namedSections = lists.reduce((sum, l) => sum + l.sections.filter((s) => (s.title || '').trim()).length, 0);
      // Each list under the section/item cap renders a dashed "Add Section"
      // drag-affordance row of its own — reserve height for it too.
      const addSectionRows = lists.filter((l) => l.sections.length < 10 && l.items.length < 10).length;
      // + a little extra per list beyond the first, for each list's own title row.
      return { width, height: 90 + Math.max(1, count) * 34 + Math.max(0, lists.length - 1) * 26 + namedSections * 20 + addSectionRows * 26 };
    }
    case 'card':
      return { width, height: 185 };
    case 'condition':
      return { width, height: 145 };
    case 'httpApi':
      return { width, height: 135 };
    case 'startAutomation':
      return { width, height: 170 };
    case 'messageBlock':
      return { width, height: 90 + 78 * Math.max(1, (node?.data?.items || []).length) };
    case 'actions':
      return { width, height: 120 + 44 * Math.max(1, (node?.data?.actions || []).length) };
    case 'collectInput':
    case 'question':
    case 'payment':
    case 'webhook':
    case 'runUserInputFlow':
      return { width, height: 130 };
    case 'delay':
    case 'video':
    case 'audio':
    case 'file':
      return { width, height: 120 };
    case 'handoff':
    case 'end':
    case 'finalAnswer':
    default:
      return { width, height: 100 };
  }
}

function getAutoLayoutedNodes(nodes, edges) {
  if (!nodes || nodes.length === 0) return [];

  const H_GAP = 46; // Compact horizontal gap between stages (still enough to see the wire/arrow)
  const V_GAP = 22; // Compact vertical gap between adjacent cards — the collision sweep below
                     // still guarantees no overlap no matter how tight this is, so it's safe to shrink.
  const OVERLAP_BUFFER = 1; // Tight nudge used only to resolve a collision — not a second V_GAP

  // Calculate actual dimensions for each node. Prefer the size the card
  // actually measured on canvas — the estimates below can't account for
  // attached buttons, media previews or extra connector rows, and an
  // under-estimate is exactly what lets auto-arranged siblings overlap.
  const dimMap = {};
  nodes.forEach((n) => {
    const est = getNodeDimensions(n);
    dimMap[n.id] = {
      width: n.measured?.width || n.width || est.width,
      height: n.measured?.height || n.height || est.height,
    };
  });

  // Build edge mappings and handle-aware child ordering
  const inDegree = {};
  const outgoingEdges = {};
  nodes.forEach((n) => {
    inDegree[n.id] = 0;
    outgoingEdges[n.id] = [];
  });

  edges.forEach((e) => {
    if (inDegree[e.target] !== undefined) {
      inDegree[e.target] += 1;
    }
    if (outgoingEdges[e.source] !== undefined) {
      outgoingEdges[e.source].push(e);
    }
  });

  // Sort outgoing edges strictly by handle order so child nodes match the UI handles top-to-bottom
  nodes.forEach((n) => {
    const list = outgoingEdges[n.id];
    if (!list || list.length <= 1) return;

    list.sort((a, b) => {
      const hA = a.sourceHandle || '';
      const hB = b.sourceHandle || '';

      const getIdx = (h, prefix) => {
        if (!h.startsWith(prefix)) return 999;
        const num = parseInt(h.replace(prefix, ''), 10);
        return isNaN(num) ? 999 : num;
      };

      if (hA.startsWith('qr-') || hB.startsWith('qr-')) {
        return getIdx(hA, 'qr-') - getIdx(hB, 'qr-');
      }
      if (hA.startsWith('btn-') || hB.startsWith('btn-')) {
        return getIdx(hA, 'btn-') - getIdx(hB, 'btn-');
      }
      if (hA.startsWith('item-') || hB.startsWith('item-')) {
        return getIdx(hA, 'item-') - getIdx(hB, 'item-');
      }
      if (hA === 'yes' || hB === 'yes' || hA === 'no' || hB === 'no') {
        if (hA === 'yes' && hB === 'no') return -1;
        if (hA === 'no' && hB === 'yes') return 1;
      }
      return 0;
    });
  });

  // Map of unique ordered child nodes
  const childrenMap = {};
  nodes.forEach((n) => {
    childrenMap[n.id] = [];
    const list = outgoingEdges[n.id] || [];
    list.forEach((e) => {
      if (!childrenMap[n.id].includes(e.target)) {
        childrenMap[n.id].push(e.target);
      }
    });
  });

  // Identify root nodes (prefer start node)
  let rootNodes = nodes.filter((n) => n.type === 'start');
  if (rootNodes.length === 0) {
    rootNodes = nodes.filter((n) => inDegree[n.id] === 0);
  }
  if (rootNodes.length === 0 && nodes.length > 0) {
    rootNodes = [nodes[0]];
  }

  // Layout assignment with global monotonic Y tracking (guarantees zero overlap)
  const positions = {};
  const visited = new Set();
  let globalCurrentY = 60;

  function layoutSubtree(nodeId, depthX) {
    if (visited.has(nodeId)) {
      if (positions[nodeId]) {
        positions[nodeId].x = Math.max(positions[nodeId].x, depthX);
      }
      return positions[nodeId] ? positions[nodeId].y : globalCurrentY;
    }
    visited.add(nodeId);

    const children = childrenMap[nodeId] || [];
    const myDim = dimMap[nodeId] || { width: 220, height: 110 };

    if (children.length === 0) {
      // Leaf node: place at current available global Y
      const nodeY = globalCurrentY;
      positions[nodeId] = { x: Math.round(depthX), y: Math.round(nodeY) };
      globalCurrentY += myDim.height + V_GAP;
      return nodeY;
    }

    if (children.length === 1) {
      // Single child: layout child in next column and align vertical centers
      const childId = children[0];
      const childDim = dimMap[childId] || { width: 220, height: 110 };
      const nextX = depthX + myDim.width + H_GAP;
      const childY = layoutSubtree(childId, nextX);
      const parentY = Math.round(childY + (childDim.height - myDim.height) / 2);
      positions[nodeId] = { x: Math.round(depthX), y: parentY };
      return parentY;
    }

    // Multiple children (branching node like Quick Replies, Buttons, Condition):
    const nextX = depthX + myDim.width + H_GAP;
    const childYs = [];

    children.forEach((childId) => {
      const cY = layoutSubtree(childId, nextX);
      childYs.push(cY);
    });

    // Parent is vertically centered between first and last child
    const firstY = childYs[0];
    const lastY = childYs[childYs.length - 1];
    const parentY = Math.round((firstY + lastY) / 2);

    positions[nodeId] = { x: Math.round(depthX), y: parentY };
    return parentY;
  }

  // Layout all root trees
  rootNodes.forEach((root) => {
    layoutSubtree(root.id, 60);
    globalCurrentY += 40;
  });

  // Handle any disconnected orphan nodes
  const unreached = nodes.filter((n) => !positions[n.id]);
  if (unreached.length > 0) {
    unreached.forEach((n) => {
      const myDim = dimMap[n.id] || { width: 230, height: 110 };
      positions[n.id] = { x: 60, y: Math.round(globalCurrentY) };
      globalCurrentY += myDim.height + V_GAP;
    });
  }

  // Final collision sweep. Centering a parent against its children can sag a
  // tall card down into the one below it, and columns aren't perfectly aligned
  // (a stage's X depends on its own parent's width), so walk everything
  // top-to-bottom and push down anything still overlapping a card already
  // settled above it. Only downward nudges, so a single pass converges.
  const placed = Object.keys(positions).sort(
    (a, b) => positions[a].y - positions[b].y || positions[a].x - positions[b].x
  );
  for (let i = 1; i < placed.length; i++) {
    const me = positions[placed[i]];
    const myDim = dimMap[placed[i]] || { width: 220, height: 110 };
    let minY = me.y;

    for (let j = 0; j < i; j++) {
      const other = positions[placed[j]];
      const otherDim = dimMap[placed[j]] || { width: 220, height: 110 };

      const sharesColumn =
        me.x < other.x + otherDim.width + H_GAP / 2 &&
        other.x < me.x + myDim.width + H_GAP / 2;
      if (!sharesColumn) continue;

      const collides =
        me.y < other.y + otherDim.height + OVERLAP_BUFFER &&
        other.y < me.y + myDim.height + OVERLAP_BUFFER;
      if (collides) minY = Math.max(minY, other.y + otherDim.height + OVERLAP_BUFFER);
    }

    me.y = Math.round(minY);
  }

  return nodes.map((node) => ({
    ...node,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    position: positions[node.id] || node.position,
  }));
}

/* ═══════════════════════════════════════════════════════════════════
   CUSTOM NODE COMPONENTS (Clean Light Theme)
   ═══════════════════════════════════════════════════════════════════ */

// eslint-disable-next-line react-refresh/only-export-components -- shared with the node components defined in this file
export const FlowNodeActionsContext = createContext({
  onDuplicate: () => {},
  onDelete: () => {},
  onSelectNode: () => {},
  onUpdateNodeData: () => {},
  onAddQuestionAfter: () => {},
  buttonTargetNodes: new Set(),
  emptySourceNodes: new Set(),
  sequencesList: [],
  flowsList: [],
  currentFlowId: null,
  currentIntegrationId: null,
});

/* ── Node Hover Actions Toolbar (Duplicate & Delete, + guided actions on a Question node) ── */
function NodeHoverActions({ nodeId, nodeType, data }) {
  const { onDuplicate, onDelete, onUpdateNodeData, onAddQuestionAfter } = useContext(FlowNodeActionsContext);

  return (
    <div
      className="fb-node-hover-actions"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {nodeType === 'question' && (
        <>
          <button
            type="button"
            className="fb-node-action-btn"
            title="Add Question — creates and connects the next question"
            onClick={(e) => {
              e.stopPropagation();
              onAddQuestionAfter?.(nodeId);
            }}
          >
            <Plus size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="fb-node-action-btn"
            title={data?.endFlow ? 'Final Answer set — click to unset' : 'Set as Final Answer — ends the form here'}
            style={data?.endFlow ? { color: '#16a34a' } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onUpdateNodeData?.(nodeId, { ...data, endFlow: !data?.endFlow });
            }}
          >
            <Flag size={15} strokeWidth={2} />
          </button>
        </>
      )}
      <button
        type="button"
        className="fb-node-action-btn fb-node-duplicate-btn"
        title="Duplicate"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate?.(nodeId);
        }}
      >
        <Copy size={15} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="fb-node-action-btn fb-node-delete-btn"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(nodeId);
        }}
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Every outgoing (source) connector circle on the canvas should render
 * blank/hollow while nothing is wired to it, and filled solid the moment a
 * real edge is connected — one consistent look everywhere (Next Step,
 * per-button/per-item, Start's own "Then"/"Sequence" branches), rather than
 * always looking the same regardless of connection state. One
 * useNodeConnections call per node (not per handle — hooks can't be called
 * inside a .map() for nodes with a variable number of items) returns every
 * outgoing connection that node has; callers just do connectedHandles.has(id)
 * per Handle they render, including inside a loop.
 */
function useConnectedHandles(nodeId) {
  const connections = useNodeConnections({ id: nodeId, handleType: 'source' });
  return useMemo(() => {
    const set = new Set();
    for (const c of connections) {
      if (c.sourceHandle) {
        set.add(c.sourceHandle);
      } else {
        // Edges saved before every node's primary handle carried an explicit
        // id (back when a node had only one source handle to draw from) never
        // stamped a sourceHandle at all — flowGraph.js's resolveNextNodeId on
        // the backend already treats that exactly the same as "next-step"/
        // "then" via its no-handle fallback, so this does the same here.
        // Blindly marking both as connected is safe: no node in this file
        // has both a "then" and a "next-step" handle, so only the one that
        // actually exists on a given node ever gets checked.
        set.add('next-step');
        set.add('then');
      }
    }
    return set;
  }, [connections]);
}

/* ── Base wrapper for standard nodes ─────────────────────────── */
function NodeWrapper({ children, color, label, icon: Icon, selected, data, type, id, hideNextStep = false, width, headerBg, iconColor }) {
  const connectedHandles = useConnectedHandles(id);
  const unsupported = data?._unsupported;
  const validationError = data?._validationError;

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderColor: validationError ? '#ef4444' : selected ? color : '#e2e8f0',
        background: '#ffffff',
        ...(width ? { width, minWidth: width, maxWidth: width } : {}),
      }}
    >
      <NodeHoverActions nodeId={id} nodeType={type} />
      {validationError ? (
        <div
          className="fb-node-warning"
          style={{ background: '#ef4444' }}
          title={`Missing Data: ${validationError}`}
        >
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : unsupported ? (
        <div className="fb-node-warning" title="Not permitted on current channel">
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : null}
      <div
        className="fb-node-header"
        style={{
          background: validationError ? '#fef2f2' : (headerBg || `${color}12`),
          borderBottom: `1px solid ${validationError ? '#fecaca' : (headerBg ? 'transparent' : `${color}22`)}`,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: validationError ? '#fee2e2' : (headerBg ? 'transparent' : `${color}1e`),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon && <Icon size={13} style={{ color: validationError ? '#ef4444' : (iconColor || color) }} />}
        </div>
        <span style={{ fontWeight: 600, fontSize: '11.5px', color: validationError ? '#b91c1c' : '#1e293b', flex: 1 }}>{label}</span>
        {data?.showTyping && (
          <span className="fb-node-typing-badge" title="Shows a typing indicator right before this sends">
            <span className="dot" /><span className="dot" /><span className="dot" />
          </span>
        )}
      </div>
      {type !== 'delay' && <DelayPill data={data} style={{ margin: '10px 12px 0' }} />}
      {children}
      {!hideNextStep && type !== 'end' && (
        <div className="fb-next-step-row">
          <span>{type === 'question' ? 'Next Question' : 'Next Step'}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="next-step"
            className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
          />
        </div>
      )}
    </div>
  );
}

/* ── Start Node ("When...") ──────────────────────────────────── */
function StartNode({ id, data = {}, selected }) {
  const { onSelectNode, currentPlatform, isChatWidgetFlow: ctxIsChatWidget } = useContext(FlowNodeActionsContext);
  const connectedHandles = useConnectedHandles(id);

  // A User Input Flow's Start node has no keyword trigger at all (it's invoked
  // by a bot Flow's "Run User Input Flow" node, never by a subscriber's message)
  // — this only ever rendered the keyword-trigger preview below regardless of
  // context, defaulting to "hi, hello" once `data.triggers`/`keywords` were both
  // empty, which is exactly what made every form's Start node misleadingly look
  // like a real keyword trigger on the canvas (the properties panel already
  // branched on this via isUserInputFlow; this card never did).
  if (data.uifStart) {
    return (
      <div
        className={`fb-node${selected ? ' selected' : ''}`}
        style={{
          borderColor: selected ? '#7c3aed' : '#e2e8f0', background: '#ffffff',
          minWidth: 270, maxWidth: 270, width: 270, borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '16px 16px 14px 16px',
          position: 'relative',
        }}
      >
        <NodeHoverActions nodeId={id} nodeType="start" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 2 }}>
          <ClipboardList size={18} strokeWidth={2.5} color="#7c3aed" />
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Form Start</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
          borderRadius: 12, background: '#faf5ff', border: '1px solid #f3e8ff',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#7c3aed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }}>
            <ClipboardList size={11} color="#fff" />
          </div>
          <div style={{ fontSize: 11.5, color: '#6b21a8', lineHeight: 1.4 }}>
            Starts when a bot flow runs this form — click here to set its name, label, webhook and Google Sheet.
          </div>
        </div>
        {/* Negative right margin cancels the card's own 16px padding so this
            row (and its connector) reach the true card edge, exactly like
            every other node's Next Step row does — those cards apply padding
            per-section instead of once around the whole card, so their
            footer row was never inset like this one was. */}
        <div className="fb-next-step-row" style={{ marginTop: 14, marginRight: -16, marginLeft: -16, paddingLeft: 16 }}>
          <span>First Question</span>
          <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
        </div>
      </div>
    );
  }

  // A Sequence's Start node has no keyword trigger either — it's entered only
  // via a "Start Sequence" action (a Flow node, or a Bot Flow's own Start node
  // "Attach Sequence" shortcut) elsewhere. Same reasoning/fix as uifStart just
  // above — this card used to fall straight through to the generic
  // keyword-trigger card below regardless of context.
  if (data.sequenceStart) {
    return (
      <div
        className={`fb-node${selected ? ' selected' : ''}`}
        style={{
          borderColor: selected ? '#0891b2' : '#e2e8f0', background: '#ffffff',
          minWidth: 270, maxWidth: 270, width: 270, borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '16px 16px 14px 16px',
          position: 'relative',
        }}
      >
        <NodeHoverActions nodeId={id} nodeType="start" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 2 }}>
          <Play size={18} strokeWidth={2.5} color="#0891b2" />
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Sequence Start</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
          borderRadius: 12, background: '#ecfeff', border: '1px solid #cffafe',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#0891b2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }}>
            <Play size={11} color="#fff" />
          </div>
          <div style={{ fontSize: 11.5, color: '#0e7490', lineHeight: 1.4 }}>
            Starts when a subscriber is enrolled via a "Start Sequence" action — click here to set this sequence's name.
          </div>
        </div>
        <div className="fb-next-step-row" style={{ marginTop: 14, marginRight: -16, marginLeft: -16, paddingLeft: 16 }}>
          <span>First Step</span>
          <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
        </div>
      </div>
    );
  }

  // A Broadcast campaign's Start node holds the whole campaign (audience,
  // schedule, send) — configured in the properties panel — rather than a
  // keyword trigger, since it's never triggered by an inbound message at
  // all; it's invoked directly by routes/broadcasts.js's send engine. Same
  // reasoning/fix as uifStart/sequenceStart above.
  if (data.broadcastStart) {
    return (
      <div
        className={`fb-node${selected ? ' selected' : ''}`}
        style={{
          borderColor: selected ? '#2563eb' : '#e2e8f0', background: '#ffffff',
          minWidth: 270, maxWidth: 270, width: 270, borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '16px 16px 14px 16px',
          position: 'relative',
        }}
      >
        <NodeHoverActions nodeId={id} nodeType="start" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 2 }}>
          <Megaphone size={18} strokeWidth={2.5} color="#2563eb" />
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Broadcast</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
          borderRadius: 12, background: '#eff6ff', border: '1px solid #dbeafe',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#2563eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }}>
            <Megaphone size={11} color="#fff" />
          </div>
          <div style={{ fontSize: 11.5, color: '#1d4ed8', lineHeight: 1.4 }}>
            Click here to set the audience, tag label, and Send Now / Schedule for this campaign.
          </div>
        </div>
        <div className="fb-next-step-row" style={{ marginTop: 14, marginRight: -16, marginLeft: -16, paddingLeft: 16 }}>
          <span>Message</span>
          <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
        </div>
      </div>
    );
  }

  // A Chat Widget flow's Start node configures the website floating chat widget
  // (appearance, branding, colors, logo, greeting, prefill message, offsets, domains)
  // and routes directly into the flow's bot reply nodes.
  const isWidgetStart = Boolean(
    data.chatWidgetStart ||
    ctxIsChatWidget ||
    (data.targetPlatform && data.targetPlatform.toUpperCase() === 'WEBCHAT')
  );

  if (isWidgetStart) {
    const plat = (data.targetPlatform || currentPlatform || 'WEBCHAT').toUpperCase();
    const isWc = plat === 'WEBCHAT';
    const platColor = plat === 'WHATSAPP' ? '#25D366' : plat === 'FACEBOOK' ? '#0084FF' : plat === 'TELEGRAM' ? '#26A5E4' : plat === 'INSTAGRAM' ? '#E1306C' : '#6366f1';
    const WidgetIcon = isWc ? Globe : MessageCircle;
    return (
      <div
        className={`fb-node${selected ? ' selected' : ''}`}
        style={{
          borderColor: selected ? platColor : '#e2e8f0', background: '#ffffff',
          minWidth: 265, maxWidth: 295, width: 280, borderRadius: 20,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '16px 16px 14px 16px',
          position: 'relative',
        }}
      >
        <NodeHoverActions nodeId={id} nodeType="start" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingLeft: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${platColor}15`, color: platColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WidgetIcon size={15} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{isWc ? 'Live Webchat' : 'Chat Widget'}</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: platColor, background: `${platColor}15`, padding: '2px 7px', borderRadius: 999 }}>
            {plat}
          </span>
        </div>
        <div style={{
          padding: '9px 11px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.displayName || data.widgetName || (isWc ? 'Live Webchat Widget' : 'Website Chat Widget')}
          </div>
          {data.greetingMessage && (
            <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{data.greetingMessage}"
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
              background: data.buttonBgColor || platColor, color: '#ffffff', fontSize: 10, fontWeight: 700,
            }}>
              <MessageCircle size={10} /> {data.buttonText || 'Chat with us'}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
          Click to configure widget styling & behavior
        </div>
        <div className="fb-next-step-row" style={{ marginTop: 12, marginRight: -16, marginLeft: -16, paddingLeft: 16 }}>
          <span>Next Step (Bot Reply)</span>
          <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
        </div>
      </div>
    );
  }

  const triggers = (data.triggers && Array.isArray(data.triggers) && data.triggers.length > 0)
    ? data.triggers
    : [
        {
          id: 'trig-1',
          type: data.trigger_type || 'keyword',
          match_type: data.match_type || 'contains',
          keywords: Array.isArray(data.keywords)
            ? data.keywords
            : (data.trigger_keyword ? data.trigger_keyword.split(',').map((s) => s.trim()).filter(Boolean) : ['hi', 'hello']),
        },
      ];

  const getTriggerTitle = (trg) => {
    if (trg.match_type === 'thumbs_up') return 'User sends a thumbs up';
    if (trg.type === 'first_contact' || trg.type === 'first_message') return 'First contact';
    if (trg.type === 'any' || trg.type === 'any_message') return 'Any message received';
    return 'User sends a message';
  };

  const getTriggerSub = (trg) => {
    if (trg.match_type === 'thumbs_up') return 'Message is thumbs up';
    if (trg.type === 'first_contact' || trg.type === 'first_message') return 'Welcome new users';
    if (trg.type === 'any' || trg.type === 'any_message') return 'Fallback on any text';
    const kws = Array.isArray(trg.keywords) ? trg.keywords : [];
    const match = trg.match_type || 'contains';
    const label = match === 'contains' ? 'Message contains' : match === 'is' ? 'Message is' : match.replace(/_/g, ' ');
    const kwStr = kws.slice(0, 3).join(', ');
    return `${label} ${kwStr || '...'}`;
  };

  const validationError = data?._validationError;

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderColor: validationError ? '#ef4444' : selected ? '#10b981' : '#e2e8f0',
        background: '#ffffff',
        minWidth: 260,
        maxWidth: 280,
        width: 270,
        borderRadius: 20,
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        padding: '16px 16px 14px 16px',
        position: 'relative',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="start" />
      {validationError && (
        <div className="fb-node-warning" style={{ background: '#ef4444' }} title={`Missing Data: ${validationError}`}>
          <AlertTriangle size={12} color="#fff" />
        </div>
      )}

      {/* Header — "⚡ When..." */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          paddingLeft: 2,
        }}
      >
        <Zap size={18} strokeWidth={2.5} className="text-slate-900 fill-slate-900" />
        <span style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
          When...
        </span>
      </div>

      {/* Trigger rows: each is a light-gray rounded block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {triggers.map((trg, i) => (
          <div
            key={trg.id || i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #f1f5f9',
            }}
          >
            {/* Blue circle user icon */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <User size={12} color="#ffffff" strokeWidth={2.5} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', lineHeight: 1.25 }}>
                {getTriggerTitle(trg)}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: '#94a3b8',
                  marginTop: 2,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {getTriggerSub(trg)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* + New Trigger button: rounded-xl dashed border */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectNode?.(id, 'addTrigger');
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          width: '100%',
          padding: '10px 14px',
          background: '#ffffff',
          border: '1.5px dashed #cbd5e1',
          color: '#334155',
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: 12,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#64748b';
          e.currentTarget.style.background = '#f8fafc';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#cbd5e1';
          e.currentTarget.style.background = '#ffffff';
        }}
      >
        <Plus size={14} strokeWidth={2.5} />
        New Trigger
      </button>

      {/* Bottom right: "Then" label with connector dot. Same shared
          .fb-next-step-row class every other node's footer uses, with a
          negative right margin canceling this card's own 16px padding so
          the connector reaches the true card edge instead of sitting inset
          from it (this card applies padding once around the whole thing,
          unlike NodeWrapper's cards which pad per-section and so never have
          this problem). */}
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -16, marginLeft: -16, paddingLeft: 16, paddingTop: 4, paddingBottom: 4 }}>
        <span>Then</span>
        <Handle
          type="source"
          position={Position.Right}
          id="then"
          className={`next-step-handle${connectedHandles.has('then') ? ' connected' : ''}`}
        />
      </div>

      {/* Second, independent connector for "Attach Sequence" (see
          StartNodeSequenceAttach / handleAttachSequenceToStart) — a real
          branch off Start, not part of the "Then" conversation path, so it
          needs its own handle rather than sharing "then"/"next-step". Always
          present (not just once attached) so the wire has somewhere to
          render the moment the node is created. */}
      <div className="fb-next-step-row" style={{ marginTop: 0, marginRight: -16, marginLeft: -16, paddingLeft: 16, paddingTop: 2, paddingBottom: 6, borderTop: 'none' }}>
        <span>Sequence</span>
        <Handle
          type="source"
          position={Position.Right}
          id="attach-sequence"
          className={`next-step-handle${connectedHandles.has('attach-sequence') ? ' connected' : ''}`}
        />
      </div>
    </div>
  );
}


/* ── Text Node (Send Message card style matching screenshot) ─── */
function TextNode({ id, data, selected }) {
  const buttons = data.buttons || [];
  const validationError = data?._validationError;
  const messageText = data.message || '';
  const { onSelectNode, onUpdateNodeData } = useContext(FlowNodeActionsContext);
  const connectedHandles = useConnectedHandles(id);

  const handleAddButton = (e) => {
    e.stopPropagation();
    if (buttons.length >= 3) return;
    const newBtn = {
      title: `Button ${buttons.length + 1}`,
      action: 'flow',
      url: '',
      phone: '',
      reply_text: '',
    };
    onUpdateNodeData(id, { ...data, buttons: [...buttons, newBtn] });
    onSelectNode(id);
  };

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? `1.5px solid ${NODE_COLORS.text}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.text}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="text" />
      <DelayPill data={data} />

      {/* Target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{
          position: 'absolute',
          left: -5,
          top: 24,
        }}
      />

      {/* Card Header: Channel icon + Title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: NODE_COLORS.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Type size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
            Text Message
          </div>
        </div>
      </div>

      {/* Text Content Box (Dashed rounded box when empty or text block) */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: messageText ? '#f8fafc' : '#ffffff',
          border: messageText ? '1px solid #f1f5f9' : '1.5px dashed #cbd5e1',
          fontSize: 12,
          color: messageText ? '#334155' : '#94a3b8',
          textAlign: messageText ? 'left' : 'center',
          lineHeight: 1.4,
          marginBottom: 8,
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: messageText ? 'flex-start' : 'center',
        }}
      >
        {messageText || 'Add a text'}
      </div>

      {/* Attached Buttons & Add Button option */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {buttons.map((btn, i) => {
          const btnTitle = typeof btn === 'string' ? btn : (btn?.title || `Button ${i + 1}`);
          const btnAction = typeof btn === 'object' ? btn?.action : 'flow';
          const isPhone = btnAction === 'phone';
          const isUrl = btnAction === 'url';
          const isGoToFlow = btnAction === 'goToFlow';

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px 14px',
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {btn?.sequenceId && <SeqBadge />}
              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isGoToFlow && (
                <Workflow
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {!isPhone && !isUrl && !isGoToFlow && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn-${i}`}
                  className={`btn-handle${connectedHandles.has(`btn-${i}`) ? ' connected' : ''}`}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              <button
                type="button"
                title="Remove button"
                className="fb-btn-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNodeData(id, { ...data, buttons: buttons.filter((_, bi) => bi !== i) });
                }}
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -7,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: '1.5px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: 10,
                  fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Option to Add Button directly on the card */}
        {buttons.length < 3 && (
          <button
            type="button"
            onClick={handleAddButton}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              color: '#334155',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#334155';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>Add Button</span>
          </button>
        )}
      </div>

      {/* Next Step row — negative right/left margin cancels this card's own
          14px outer padding so the connector reaches the true card edge,
          matching every NodeWrapper-based card (those pad per-section
          instead of once around the whole card, so never have this inset). */}
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next-step"
          className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
        />
      </div>
    </div>
  );
}

/* ── Interactive Node (WhatsApp Interactive Message: Header + Body + Footer + Buttons) ── */
function InteractiveNode({ id, data, selected }) {
  const buttons = data.buttons || [];
  const validationError = data?._validationError;
  const messageText = data.message || '';
  const headerType = data.headerType || 'text';
  const headerText = data.headerText || '';
  const headerMediaUrl = data.headerMediaUrl || '';
  const footerText = data.footerText || '';
  const { onSelectNode, onUpdateNodeData } = useContext(FlowNodeActionsContext);
  const connectedHandles = useConnectedHandles(id);

  // Real thumbnail/player once a header image or video is uploaded, matching
  // ImageNode/VideoNode's own preview — this card only ever showed an
  // "Image Attached"/"Video Attached" text label regardless of upload state.
  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  const fullHeaderMediaUrl = headerMediaUrl && !headerMediaUrl.startsWith('http')
    ? `${backendUrl}${headerMediaUrl}`
    : headerMediaUrl;

  const handleAddButton = (e) => {
    e.stopPropagation();
    if (buttons.length >= 3) return;
    const newBtn = {
      title: `Reply ${buttons.length + 1}`,
      action: 'flow',
      url: '',
      phone: '',
      reply_text: '',
    };
    onUpdateNodeData(id, { ...data, buttons: [...buttons, newBtn] });
    onSelectNode(id);
  };

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? '1.5px solid #334155' : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.interactive}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="interactive" />
      <DelayPill data={data} />

      {/* Target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{
          position: 'absolute',
          left: -5,
          top: 24,
        }}
      />

      {/* Card Header: WhatsApp Interactive Message */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: NODE_COLORS.interactive,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
            Interactive Message
          </div>
        </div>
      </div>

      {/* WhatsApp Message Card: Header, Body & Footer container */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: '#f8fafc',
          border: '1px solid #f1f5f9',
          marginBottom: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {/* Optional Header */}
        {headerType && headerType !== 'none' && (
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
            {headerType === 'text' ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                {headerText || 'Header Text'}
              </span>
            ) : headerType === 'image' && fullHeaderMediaUrl ? (
              <img draggable={false} onContextMenu={(e) => e.preventDefault()}
                src={fullHeaderMediaUrl}
                alt="Header preview"
                style={{ width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
            ) : headerType === 'video' && fullHeaderMediaUrl ? (
              <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
                src={fullHeaderMediaUrl}
                controls
                muted
                style={{ width: '100%', maxHeight: 110, borderRadius: 8, background: '#000', display: 'block' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: headerMediaUrl ? '#334155' : '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                {headerType === 'image' && <Image size={14} />}
                {headerType === 'video' && <Video size={14} />}
                {headerType === 'document' && <FileText size={14} />}
                <span style={{ textTransform: 'capitalize' }}>
                  {headerMediaUrl ? `${headerType} attached` : `Header ${headerType} — not uploaded yet`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Message Body */}
        <div
          style={{
            fontSize: 12,
            color: messageText ? '#334155' : '#94a3b8',
            lineHeight: 1.4,
            minHeight: 30,
          }}
        >
          {messageText || 'Enter message body...'}
        </div>

        {/* Optional Footer */}
        {footerText && (
          <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
            {footerText}
          </div>
        )}
      </div>

      {/* Attached Reply Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {buttons.map((btn, i) => {
          const btnTitle = typeof btn === 'string' ? btn : (btn?.title || `Reply ${i + 1}`);
          const btnAction = typeof btn === 'object' ? btn?.action : 'flow';
          const isPhone = btnAction === 'phone';
          const isUrl = btnAction === 'url';
          const isGoToFlow = btnAction === 'goToFlow';

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px 14px',
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#334155',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {btn?.sequenceId && <SeqBadge />}
              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isGoToFlow && (
                <Workflow
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {!isPhone && !isUrl && !isGoToFlow && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn-${i}`}
                  className={`btn-handle${connectedHandles.has(`btn-${i}`) ? ' connected' : ''}`}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              <button
                type="button"
                title="Remove button"
                className="fb-btn-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNodeData(id, { ...data, buttons: buttons.filter((_, bi) => bi !== i) });
                }}
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -7,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: '1.5px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: 10,
                  fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Option to Add Button directly on the card */}
        {buttons.length < 3 && (
          <button
            type="button"
            onClick={handleAddButton}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              color: '#334155',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#334155';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>+ Add Reply Button</span>
          </button>
        )}
      </div>

      {/* Next Step row — negative right/left margin cancels this card's own
          14px outer padding so the connector reaches the true card edge,
          matching every NodeWrapper-based card (those pad per-section
          instead of once around the whole card, so never have this inset). */}
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next-step"
          className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
        />
      </div>
    </div>
  );
}

/* ── Image Node (Matching ManyChat Send Message card with buttons) ── */
function ImageNode({ id, data, selected }) {
  const buttons = data.buttons || [];
  const validationError = data?._validationError;
  const caption = data.caption || data.message || '';
  const imageUrl = data.imageUrl || data.mediaUrl || '';
  const { onSelectNode, onUpdateNodeData } = useContext(FlowNodeActionsContext);
  const connectedHandles = useConnectedHandles(id);

  const handleAddButton = (e) => {
    e.stopPropagation();
    if (buttons.length >= 3) return;
    const newBtn = {
      title: `Button ${buttons.length + 1}`,
      action: 'flow',
      url: '',
      phone: '',
      reply_text: '',
    };
    onUpdateNodeData(id, { ...data, buttons: [...buttons, newBtn] });
    onSelectNode(id);
  };

  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  const fullUrl = imageUrl && !imageUrl.startsWith('http') ? `${backendUrl}${imageUrl}` : imageUrl;

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? `1.5px solid ${NODE_COLORS.image}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.image}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="image" />
      <DelayPill data={data} />

      {/* Left target handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{
          position: 'absolute',
          left: -5,
          top: 24,
        }}
      />

      {/* Card Header: Facebook Messenger */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: NODE_COLORS.image,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Image size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
            Image
          </div>
        </div>
      </div>

      {/* Optional Caption / Text block */}
      {caption && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            background: '#f8fafc',
            border: '1px solid #f1f5f9',
            fontSize: 12,
            color: '#334155',
            lineHeight: 1.35,
            marginBottom: 8,
          }}
        >
          {caption}
        </div>
      )}

      {/* Image Preview Container */}
      <div style={{ marginBottom: buttons.length ? 8 : 0 }}>
        {fullUrl ? (
          <img draggable={false} onContextMenu={(e) => e.preventDefault()}
            src={fullUrl}
            alt="Preview"
            style={{
              width: '100%',
              maxHeight: 150,
              objectFit: 'cover',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              padding: '24px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: '#94a3b8',
            }}
          >
            <Image size={24} style={{ opacity: 0.45, color: '#64748b' }} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Image</span>
          </div>
        )}
      </div>

      {/* Attached Buttons & Add Button option */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: buttons.length ? 8 : 6 }}>
        {buttons.map((btn, i) => {
          const btnTitle = typeof btn === 'string' ? btn : (btn?.title || `Button ${i + 1}`);
          const btnAction = typeof btn === 'object' ? btn?.action : 'flow';
          const isPhone = btnAction === 'phone';
          const isUrl = btnAction === 'url';
          const isGoToFlow = btnAction === 'goToFlow';

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px 14px',
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {btn?.sequenceId && <SeqBadge />}
              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isGoToFlow && (
                <Workflow
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {!isPhone && !isUrl && !isGoToFlow && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn-${i}`}
                  className={`btn-handle${connectedHandles.has(`btn-${i}`) ? ' connected' : ''}`}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              <button
                type="button"
                title="Remove button"
                className="fb-btn-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNodeData(id, { ...data, buttons: buttons.filter((_, bi) => bi !== i) });
                }}
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -7,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: '1.5px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: 10,
                  fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Option to Add Button directly on the card */}
        {buttons.length < 3 && (
          <button
            type="button"
            onClick={handleAddButton}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              color: '#334155',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#334155';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>Add Button</span>
          </button>
        )}
      </div>

      {/* Next Step row — negative right/left margin cancels this card's own
          14px outer padding so the connector reaches the true card edge,
          matching every NodeWrapper-based card (those pad per-section
          instead of once around the whole card, so never have this inset). */}
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next-step"
          className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
        />
      </div>
    </div>
  );
}

/* ── Video Node (Send Message card style) ─────────────────────── */
function VideoNode({ id, data, selected }) {
  const buttons = data.buttons || [];
  const validationError = data?._validationError;
  const caption = data.caption || data.message || '';
  const videoUrl = data.videoUrl || data.mediaUrl || '';
  const connectedHandles = useConnectedHandles(id);

  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  const fullVideoUrl = videoUrl && !videoUrl.startsWith('http') ? `${backendUrl}${videoUrl}` : videoUrl;

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? `1.5px solid ${NODE_COLORS.video}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.video}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="video" />
      <DelayPill data={data} />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ position: 'absolute', left: -5, top: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: NODE_COLORS.video, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Video size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>Video</div>
        </div>
      </div>
      {caption && (
        <div style={{ padding: '8px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: 12, color: '#334155', lineHeight: 1.35, marginBottom: 8 }}>
          {caption}
        </div>
      )}
      {fullVideoUrl ? (
        <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
          src={fullVideoUrl}
          controls
          muted
          style={{ width: '100%', maxHeight: 160, borderRadius: 12, background: '#000', marginBottom: buttons.length ? 8 : 0, display: 'block' }}
        />
      ) : (
        <div style={{ padding: '24px 12px', borderRadius: 12, background: '#f8fafc', border: '1.5px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8', marginBottom: buttons.length ? 8 : 0 }}>
          <Video size={24} style={{ opacity: 0.5, color: '#64748b' }} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Video</span>
        </div>
      )}
      {buttons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {buttons.map((btn, i) => {
            const btnTitle = typeof btn === 'string' ? btn : (btn?.title || `Button ${i + 1}`);
            const btnAction = typeof btn === 'object' ? btn?.action : 'flow';
            const isPhone = btnAction === 'phone';
            const isUrl = btnAction === 'url';
            const isGoToFlow = btnAction === 'goToFlow';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 14px', borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', position: 'relative' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {btnTitle}
                </span>
                {btn?.sequenceId && <SeqBadge />}
                {isPhone && <Phone size={14} style={{ position: 'absolute', right: 12, color: '#334155' }} />}
                {isUrl && <ExternalLink size={14} style={{ position: 'absolute', right: 12, color: '#334155' }} />}
                {isGoToFlow && <Workflow size={14} style={{ position: 'absolute', right: 12, color: '#334155' }} />}
                {!isPhone && !isUrl && !isGoToFlow && (
                  <Handle type="source" position={Position.Right} id={`btn-${i}`} className={`btn-handle${connectedHandles.has(`btn-${i}`) ? ' connected' : ''}`} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
      </div>
    </div>
  );
}

/* ── Audio Node (Send Message card style) ─────────────────────── */
function AudioNode({ id, data, selected }) {
  const validationError = data?._validationError;
  const audioUrl = data.audioUrl || data.mediaUrl || '';
  const connectedHandles = useConnectedHandles(id);

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? `1.5px solid ${NODE_COLORS.audio}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.audio}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="audio" />
      <DelayPill data={data} />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ position: 'absolute', left: -5, top: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: NODE_COLORS.audio, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Music size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>Audio Clip</div>
        </div>
      </div>
      <div style={{ padding: '20px 12px', borderRadius: 12, background: '#f8fafc', border: '1.5px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8' }}>
        <Music size={24} style={{ color: NODE_COLORS.audio }} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>{audioUrl ? 'Audio Attached' : 'Audio Clip'}</span>
      </div>
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
      </div>
    </div>
  );
}

/* ── File Node (Send Message card style) ──────────────────────── */
function FileNode({ id, data, selected }) {
  const validationError = data?._validationError;
  const filename = data.filename || 'Document';
  const connectedHandles = useConnectedHandles(id);

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? `1.5px solid ${NODE_COLORS.file}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.file}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="file" />
      <DelayPill data={data} />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ position: 'absolute', left: -5, top: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: NODE_COLORS.file, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>File / Document</div>
        </div>
      </div>
      <div style={{ padding: '16px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, color: '#334155' }}>
        <FileText size={22} style={{ color: NODE_COLORS.file, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
      </div>
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
      </div>
    </div>
  );
}

/* ── Buttons Node (Send Message card style matching screenshot) ─ */
function ButtonsNode({ id, data, selected }) {
  const buttons = data.buttons || [];
  const validationError = data?._validationError;
  const messageText = data.message || '';
  const { onSelectNode, onUpdateNodeData } = useContext(FlowNodeActionsContext);
  const connectedHandles = useConnectedHandles(id);

  const handleAddButton = (e) => {
    e.stopPropagation();
    if (buttons.length >= 3) return;
    const newBtn = {
      title: `Button ${buttons.length + 1}`,
      action: 'flow',
      url: '',
      phone: '',
      reply_text: '',
    };
    onUpdateNodeData(id, { ...data, buttons: [...buttons, newBtn] });
    onSelectNode(id);
  };

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 16,
        background: '#ffffff',
        border: selected ? `1.5px solid ${NODE_COLORS.buttons}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.buttons}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 270,
        maxWidth: 270,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="buttons" />
      <DelayPill data={data} />

      {/* Target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{
          position: 'absolute',
          left: -5,
          top: 24,
        }}
      />

      {/* Card Header: Channel icon + Title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: NODE_COLORS.buttons,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MessageSquare size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
            Text Message
          </div>
        </div>
      </div>

      {/* Text Content Box */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: messageText ? '#f8fafc' : '#ffffff',
          border: messageText ? '1px solid #f1f5f9' : '1.5px dashed #cbd5e1',
          fontSize: 12,
          color: messageText ? '#334155' : '#94a3b8',
          textAlign: messageText ? 'left' : 'center',
          lineHeight: 1.4,
          marginBottom: 8,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: messageText ? 'flex-start' : 'center',
        }}
      >
        {messageText || 'Add a text'}
      </div>

      {/* Attached Buttons & Add Button option */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {buttons.map((btn, i) => {
          const btnTitle = typeof btn === 'string' ? btn : (btn?.title || `Button ${i + 1}`);
          const btnAction = typeof btn === 'object' ? btn?.action : 'flow';
          const isPhone = btnAction === 'phone';
          const isUrl = btnAction === 'url';
          const isGoToFlow = btnAction === 'goToFlow';

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px 14px',
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {btn?.sequenceId && <SeqBadge />}
              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {isGoToFlow && (
                <Workflow
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#334155',
                  }}
                />
              )}
              {!isPhone && !isUrl && !isGoToFlow && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn-${i}`}
                  className={`btn-handle${connectedHandles.has(`btn-${i}`) ? ' connected' : ''}`}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              <button
                type="button"
                title="Remove button"
                className="fb-btn-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNodeData(id, { ...data, buttons: buttons.filter((_, bi) => bi !== i) });
                }}
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -7,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: '1.5px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: 10,
                  fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Option to Add Button directly on the card */}
        {buttons.length < 3 && (
          <button
            type="button"
            onClick={handleAddButton}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              color: '#334155',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#334155';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>Add Button</span>
          </button>
        )}
      </div>

      {/* Next Step row — negative right/left margin cancels this card's own
          14px outer padding so the connector reaches the true card edge,
          matching every NodeWrapper-based card (those pad per-section
          instead of once around the whole card, so never have this inset). */}
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next-step"
          className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
        />
      </div>
    </div>
  );
}


/* ── Quick Replies Node (With individual branch handles) ─────── */
function QuickRepliesNode({ id, data, selected }) {
  const replies = data.replies || [];
  const connectedHandles = useConnectedHandles(id);
  return (
    <NodeWrapper id={id} color={NODE_COLORS.quickReplies} label="Quick Replies" icon={Keyboard} selected={selected} data={data} type="quickReplies">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      {data.message && (
        <div className="fb-node-body" style={{ paddingBottom: replies.length ? 6 : 10 }}>
          <div className="fb-node-body-preview">{data.message}</div>
        </div>
      )}
      <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
        {replies.map((r, i) => (
          <div key={i} className="fb-node-btn-chip">
            <span style={{ fontSize: '11px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r || `Reply ${i + 1}`}</span>
            <ChevronRight size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
            <Handle
              type="source"
              position={Position.Right}
              id={`qr-${i}`}
              className={`btn-handle${connectedHandles.has(`qr-${i}`) ? ' connected' : ''}`}
              style={{ top: '50%', right: -7, transform: 'translateY(-50%)', position: 'absolute' }}
            />
          </div>
        ))}
      </div>
    </NodeWrapper>
  );
}


/* ── List Menu Node (WhatsApp Interactive List) ──────────────── */
function ListMenuNode({ id, data, selected }) {
  // Multiple lists send as separate sequential messages; sections group items
  // WITHIN one message (WhatsApp's own native "sections" concept — a
  // different axis, see normalizeListMenuData). Every item across every
  // section of every list still shares one flat "which option was picked"
  // index space — both for the per-item outgoing edge below (item-{gi}) and
  // for the routing token flowEngine.js encodes into each option — so an
  // item in list 2's 2nd section still resolves even though it's the 11th
  // item overall.
  const lists = normalizeListMenuData(data);
  const connectedHandles = useConnectedHandles(id);
  let globalIndex = -1;
  return (
    <NodeWrapper id={id} color={NODE_COLORS.listMenu} label="List Menu" icon={ListOrdered} selected={selected} data={data} type="listMenu">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      {lists.map((list, li) => (
        <div key={li}>
          <div className="fb-node-body" style={{ paddingBottom: 4, paddingTop: li > 0 ? 6 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>
              {list.title || `Menu ${li + 1}`}
            </div>
          </div>
          {list.sections.map((section, si) => (
            <div key={si}>
              {(section.title || '').trim() && (
                <div style={{ padding: '3px 12px 2px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {section.title}
                </div>
              )}
              <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
                {section.items.map((item, ii) => {
                  globalIndex += 1;
                  const gi = globalIndex;
                  // Same idea as a button: an action that jumps elsewhere on
                  // its own (Go to Flow) doesn't route through a canvas wire,
                  // so it gets a small indicator instead of a connector dot.
                  const isGoToFlow = item.action === 'goToFlow';
                  return (
                    <div key={ii} className="fb-node-btn-chip">
                      <span style={{ fontSize: '11px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || `Option ${ii + 1}`}</span>
                      {item.sequenceId && <SeqBadge inline />}
                      {isGoToFlow ? (
                        <Workflow size={12} style={{ opacity: 0.8, flexShrink: 0, color: '#334155' }} />
                      ) : (
                        <>
                          <ChevronRight size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                          <Handle
                            type="source"
                            position={Position.Right}
                            id={`item-${gi}`}
                            className={`btn-handle${connectedHandles.has(`item-${gi}`) ? ' connected' : ''}`}
                            style={{ top: '50%', right: -7, transform: 'translateY(-50%)', position: 'absolute' }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {(list.sections.length < 10 && list.items.length < 10) && (
            <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
              <div
                className="fb-node-btn-chip"
                style={{ background: 'transparent', borderStyle: 'dashed', borderColor: '#cbd5e1', color: '#64748b' }}
                title="Drag from here to add a section"
              >
                <Plus size={12} style={{ opacity: 0.8, flexShrink: 0 }} />
                <span style={{ fontSize: '10.5px', fontWeight: 600, flex: 1 }}>Add Section</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`add-section-${li}`}
                  className="btn-handle"
                  style={{ top: '50%', right: -7, transform: 'translateY(-50%)', position: 'absolute' }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </NodeWrapper>
  );
}


/* ── Card Node ───────────────────────────────────────────────── */
function CardNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.card} label="Card" icon={CreditCard} selected={selected} data={data} type="card">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        {data.imageUrl && (
          <div style={{
            width: '100%', height: 60, borderRadius: 6, marginBottom: 8,
            background: `url(${data.imageUrl}) center/cover no-repeat`,
            backgroundColor: '#f8fafc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!data.imageUrl && <Image size={20} style={{ opacity: 0.3 }} />}
          </div>
        )}
        {!data.imageUrl && (
          <div style={{
            width: '100%', height: 50, borderRadius: 6, marginBottom: 8,
            background: '#f8fafc', border: '1px dashed #cbd5e1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Image size={18} style={{ opacity: 0.35, color: '#64748b' }} />
          </div>
        )}
        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
          {data.title || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No title</span>}
        </div>
        {data.subtitle && (
          <div style={{ fontSize: 11, opacity: 0.7, color: '#475569' }}>{data.subtitle}</div>
        )}
      </div>
    </NodeWrapper>
  );
}

/* ── Carousel Node ───────────────────────────────────────────── */
function CarouselNode({ id, data, selected }) {
  const cardCount = data.cards?.length || 0;
  return (
    <NodeWrapper id={id} color={NODE_COLORS.carousel} label="Carousel" icon={Layers} selected={selected} data={data} type="carousel">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: 'rgba(192, 38, 211, 0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 15, color: NODE_COLORS.carousel,
        }}>
          {cardCount}
        </div>
        <span style={{ fontWeight: 600, color: '#1e293b' }}>{cardCount === 1 ? '1 card' : `${cardCount} cards`}</span>
      </div>
    </NodeWrapper>
  );
}

/* ── Collect Input Node ─────────────────────────────────────── */
function CollectInputNode({ id, data, selected, type }) {
  const typeIcons = { name: User, email: Mail, phone: Phone, custom: Settings2 };
  const TypeIcon = typeIcons[data.inputType] || Settings2;
  const promptText = data.message || data.prompt || 'Please enter your reply...';
  // A "question" (User Input Flow) node is identified by its Custom Field alone
  // (see PropertiesPanel) — data.fieldLabel mirrors that field's name for display
  // here. A "collectInput" (main flow) node still uses its own free-typed variable.
  const saveVariable = data.fieldLabel || data.variable || 'contact_reply';
  const connectedHandles = useConnectedHandles(id);

  return (
    <div
      className={`flow-input-node ${selected ? 'selected' : ''}`}
      style={{
        background: '#ffffff',
        borderRadius: 20,
        border: selected ? `1.5px solid ${NODE_COLORS.collectInput}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.collectInput}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 14px rgba(0,0,0,0.06)',
        width: 270,
        position: 'relative',
        overflow: 'visible',
        transition: 'all 0.2s ease',
      }}
    >
      {/* This card is shared by "collectInput" (main flow) and "question" (User
          Input Flow) — nodeType was hardcoded to "collectInput" here regardless,
          which silently hid the guided +Add Question/Final Answer actions below
          on every real Question node. `type` is a prop React Flow already passes
          to every custom node component. */}
      <NodeHoverActions nodeId={id} nodeType={type} data={data} />
      <DelayPill data={data} />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{
          position: 'absolute',
          left: -5,
          top: 22,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '9px 12px',
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
          borderBottom: '1px solid #e9d5ff',
          borderRadius: '19px 19px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: '#8b5cf6',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={12} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>User Input</span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#7c3aed',
            background: '#ffffff',
            padding: '2px 8px',
            borderRadius: 10,
            border: '1px solid #ddd6fe',
            textTransform: 'capitalize',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <TypeIcon size={10} />
          {data.inputType || 'text'}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            fontSize: 12,
            color: '#1e293b',
            lineHeight: 1.4,
            fontWeight: 500,
            wordBreak: 'break-word',
          }}
        >
          {promptText}
        </div>

        {/* Target custom field badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderRadius: 6,
            background: '#faf5ff',
            border: '1px dashed #d8b4fe',
            fontSize: 11,
            color: '#6b21a8',
          }}
        >
          <span style={{ fontWeight: 600 }}>Save to:</span>
          <code
            style={{
              fontWeight: 700,
              background: '#f3e8ff',
              padding: '1px 5px',
              borderRadius: 4,
              color: '#7e22ce',
            }}
          >
            {saveVariable}
          </code>
        </div>

        {/* Reply waiting bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 6,
            background: '#f8fafc',
            border: '1px solid #f1f5f9',
            fontSize: 10.5,
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={12} style={{ color: '#8b5cf6' }} />
            <span>Waiting for reply</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6' }}>⚡ Action on reply</span>
        </div>
      </div>

      {/* Next Step row matching the ManyChat design */}
      <div className="fb-next-step-row" style={{ marginTop: 4, borderTop: '1px dashed #ede9fe' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next-step"
          className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
          style={{
            position: 'absolute',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
        {/* Support backward-compatible id="next" */}
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          className={`next-step-handle${connectedHandles.has('next') ? ' connected' : ''}`}
          style={{
            position: 'absolute',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

/* ── Condition Node ──────────────────────────────────────────── */
function ConditionNode({ id, data, selected }) {
  const unsupported = data?._unsupported;
  const validationError = data?._validationError;
  const connectedHandles = useConnectedHandles(id);

  return (
    <div
      className={`fb-node-condition${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        background: '#ffffff',
        borderRadius: 20,
        borderColor: validationError ? '#ef4444' : selected ? NODE_COLORS.condition : '#e2e8f0',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="condition" />
      <DelayPill data={data} />
      {validationError ? (
        <div className="fb-node-warning" style={{ background: '#ef4444' }} title={`Missing Data: ${validationError}`}>
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : unsupported ? (
        <div className="fb-node-warning" title="Not permitted on current channel">
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : null}
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div
        className="fb-node-header"
        style={{
          background: validationError ? '#fef2f2' : `${NODE_COLORS.condition}12`,
          borderBottom: `1px solid ${validationError ? '#fecaca' : `${NODE_COLORS.condition}22`}`,
          borderRadius: '19px 19px 0 0',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: validationError ? '#fee2e2' : `${NODE_COLORS.condition}1e`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <GitBranch size={13} style={{ color: validationError ? '#ef4444' : NODE_COLORS.condition }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '11.5px', color: validationError ? '#b91c1c' : '#1e293b' }}>Condition</span>
      </div>
      <div className="fb-node-body">
        {data.compareSource === 'customField' ? (
          data.customFieldName ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
              <span style={{ color: '#6366f1' }}>{data.customFieldName}</span> {data.operator || '=='} {data.value || '?'}
            </span>
          ) : (
            <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>No field selected</span>
          )
        ) : data.variable ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
            {data.variable} {data.operator || '=='} {data.value || '?'}
          </span>
        ) : (
          <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>No condition set</span>
        )}
      </div>
      <div className="fb-condition-outputs" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span className="fb-condition-label fb-condition-yes">Yes / True</span>
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            className={`btn-handle${connectedHandles.has('yes') ? ' connected' : ''}`}
            style={{ right: 8, top: '50%', transform: 'translateY(-50%)', position: 'absolute' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span className="fb-condition-label fb-condition-no">No / False</span>
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            className={`btn-handle${connectedHandles.has('no') ? ' connected' : ''}`}
            style={{ right: 8, top: '50%', transform: 'translateY(-50%)', position: 'absolute' }}
          />
        </div>
      </div>
      {/* Fallback Next Step handle */}
      <div className="fb-next-step-row" style={{ marginTop: 2, padding: '6px 12px 8px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next-step"
          className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`}
          style={{
            position: 'absolute',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
      </div>
    </div>
  );
}

/* ── Delay Node ──────────────────────────────────────────────── */
function DelayNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.delay} label="Delay" icon={Clock} selected={selected} data={data} type="delay">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        <DelayPill data={data} always style={{ marginBottom: 0 }} />
      </div>
    </NodeWrapper>
  );
}

/* ── Webhook / Zapier Node ───────────────────────────────────── */
function WebhookNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.webhook} label="Webhook / Zapier" icon={Globe} selected={selected} data={data} type="webhook">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#2563eb', color: '#ffffff' }}>
            {data.method || 'POST'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
            {data.url ? data.url.replace(/^https?:\/\//, '') : 'Set Endpoint URL'}
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          {data.payloadMode === 'CUSTOM_JSON' ? '📦 Custom JSON Payload' : '⚡ All Contact Variables'}
        </div>
      </div>
    </NodeWrapper>
  );
}

/* ── HTTP API Node — calls a saved HTTP API Campaign, branches on whether
   the request succeeded, same two-handle shape as ConditionNode ─────── */
function HttpApiNode({ id, data, selected }) {
  const unsupported = data?._unsupported;
  const validationError = data?._validationError;
  const connectedHandles = useConnectedHandles(id);

  return (
    <div
      className={`fb-node-condition${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        background: '#ffffff',
        borderRadius: 20,
        borderColor: validationError ? '#ef4444' : selected ? NODE_COLORS.httpApi : '#e2e8f0',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="httpApi" />
      <DelayPill data={data} />
      {validationError ? (
        <div className="fb-node-warning" style={{ background: '#ef4444' }} title={`Missing Data: ${validationError}`}>
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : unsupported ? (
        <div className="fb-node-warning" title="Not permitted on current channel">
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : null}
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div
        className="fb-node-header"
        style={{
          background: validationError ? '#fef2f2' : `${NODE_COLORS.httpApi}12`,
          borderBottom: `1px solid ${validationError ? '#fecaca' : `${NODE_COLORS.httpApi}22`}`,
          borderRadius: '19px 19px 0 0',
        }}
      >
        <div
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: validationError ? '#fee2e2' : `${NODE_COLORS.httpApi}1e`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Network size={13} style={{ color: validationError ? '#ef4444' : NODE_COLORS.httpApi }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '11.5px', color: validationError ? '#b91c1c' : '#1e293b' }}>HTTP API</span>
      </div>
      <div className="fb-node-body">
        {data.campaignName ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{data.campaignName}</span>
        ) : (
          <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>No campaign selected</span>
        )}
      </div>
      <div className="fb-condition-outputs" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span className="fb-condition-label fb-condition-yes">Success</span>
          <Handle
            type="source"
            position={Position.Right}
            id="success"
            className={`btn-handle${connectedHandles.has('success') ? ' connected' : ''}`}
            style={{ right: 8, top: '50%', transform: 'translateY(-50%)', position: 'absolute' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span className="fb-condition-label fb-condition-no">Fail</span>
          <Handle
            type="source"
            position={Position.Right}
            id="fail"
            className={`btn-handle${connectedHandles.has('fail') ? ' connected' : ''}`}
            style={{ right: 8, top: '50%', transform: 'translateY(-50%)', position: 'absolute' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Collect Payment Node ────────────────────────────────────── */
function PaymentNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.payment} label="In-Chat Payment" icon={ShoppingBag} selected={selected} data={data} type="payment">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <strong style={{ fontSize: 11, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
            {data.productName || 'Order Product'}
          </strong>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a' }}>
            ${Number(data.amount || 0).toFixed(2)}
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          {data.buttonLabel || '💳 Pay Now'}
        </div>
      </div>
    </NodeWrapper>
  );
}

/* ── Handoff Node ────────────────────────────────────────────── */
function HandoffNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.handoff} label="Agent Handoff" icon={Headphones} selected={selected} data={data} type="handoff">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        {data.message ? (
          <div className="fb-node-body-preview">{data.message}</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Headphones size={16} style={{ opacity: 0.4, color: '#6366f1' }} />
            <span style={{ opacity: 0.6, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>Transfer to agent</span>
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

/* ── End Node ────────────────────────────────────────────────── */
function EndNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.end} label="End" icon={CircleStop} selected={selected} data={data} type="end">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        {data.message ? (
          <div className="fb-node-body-preview">{data.message}</div>
        ) : (
          <span style={{ opacity: 0.6, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>End of flow</span>
        )}
      </div>
    </NodeWrapper>
  );
}

/* ── Wait Node (only used inside a Sequence) ────────────────────── */
function WaitNode({ id, data, selected }) {
  const label = data.preset === 'custom'
    ? `${data.customValue || 0} ${data.customUnit || 'minutes'}`
    : (data.preset === 'immediate' ? 'Immediately' : (data.preset || '5m').replace('m', ' min').replace('h', ' hr'));
  return (
    <NodeWrapper id={id} color={NODE_COLORS.wait} label="Wait" icon={Clock} selected={selected} data={data} type="wait">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clock size={18} style={{ color: NODE_COLORS.wait, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{label}</span>
      </div>
    </NodeWrapper>
  );
}

/* ── Start / Stop Sequence action nodes (main Flow Builder only) ── */
// Both Start/Stop Sequence are one-shot side-effect actions, not a step in a
// conversation path — they have nothing to continue into, so hideNextStep
// (same as FinalAnswerNode) rather than showing an output connector that
// doesn't lead anywhere. Attached off a Start node's own Sequence branch,
// this is a true dead end; placed mid-flow via the palette, the engine
// already treats it as ending execution there once it fires (same as an End
// node), so this matches what actually happens either way.
function StartSequenceActionNode({ id, data, selected }) {
  // Live-looked-up from the agency's fetched Sequences (via context, same
  // list the Start-node picker itself uses) rather than trusting a snapshot
  // on the node's own data — so renaming/rebuilding the sequence elsewhere
  // shows up here without needing to re-touch this node.
  const { sequencesList } = useContext(FlowNodeActionsContext);
  const sequence = sequencesList.find((s) => s.id === data.sequenceId);
  const messageCount = sequence?.message_count;

  return (
    <NodeWrapper id={id} color={NODE_COLORS.startSequenceAction} label="Start Sequence" icon={Play} selected={selected} data={data} type="startSequenceAction" hideNextStep>
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        {data.sequenceName ? (
          <>
            <div className="fb-node-body-preview">{data.sequenceName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, color: '#0891b2', fontWeight: 600 }}>
              <MessageSquare size={12} />
              {typeof messageCount === 'number'
                ? `${messageCount} message${messageCount === 1 ? '' : 's'}`
                : 'Loading...'}
            </div>
          </>
        ) : (
          <span style={{ opacity: 0.6, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>No sequence selected</span>
        )}
      </div>
    </NodeWrapper>
  );
}

function StopSequenceActionNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.stopSequenceAction} label="Stop Sequence" icon={CircleStop} selected={selected} data={data} type="stopSequenceAction" hideNextStep>
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        {data.sequenceName ? (
          <div className="fb-node-body-preview">{data.sequenceName}</div>
        ) : (
          <span style={{ opacity: 0.6, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>No sequence selected</span>
        )}
      </div>
    </NodeWrapper>
  );
}

/* ── Automation picker modal (Start Automation) ─────────────────────
   Lists the bot flows that already exist for this channel. Plain
   black/white/grey on purpose — no accent colour. */
function AutomationPickerModal({ flows, currentFlowId, platform, selectedId, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const p = (platform || '').toUpperCase();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const available = flows.filter(
    (f) => f.id !== currentFlowId && (!p || (f.platform || '').toUpperCase() === p)
  );
  const q = search.trim().toLowerCase();
  const visible = q ? available.filter((f) => (f.name || '').toLowerCase().includes(q)) : available;

  return createPortal(
    <div
      className="nodrag nopan"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Start Automation</div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>Pick the flow this contact should be moved into.</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '10px 16px 6px' }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search automations..."
            style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', outline: 'none' }}
          />
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 10px 12px' }}>
          {visible.length === 0 ? (
            <div style={{ padding: '28px 12px', textAlign: 'center', fontSize: 12.5, color: '#94a3b8' }}>
              {available.length === 0
                ? `No other ${p || ''} flows yet — create one first, then come back and pick it here.`
                : 'No automations match your search.'}
            </div>
          ) : visible.map((f) => {
            const on = f.id === selectedId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px',
                  marginTop: 4, borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${on ? '#0f172a' : '#e2e8f0'}`, background: on ? '#f8fafc' : '#ffffff',
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f1f5f9', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Workflow size={15} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{f.is_active === 0 || f.is_active === false ? 'Draft' : 'Published'}</div>
                </div>
                {on && <Check size={16} color="#0f172a" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* Small "seq" tag on a canvas button/list item that also enrolls the contact in a
   Sequence when tapped (btn.sequenceId). Neutral grey. */
function SeqBadge({ inline = false }) {
  return (
    <span
      title="Enrolls the contact in a Sequence when tapped"
      style={{
        ...(inline ? {} : { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }),
        flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 1,
        padding: '3px 5px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155',
      }}
    >
      seq
    </span>
  );
}

/* ── Message Block Node ───────────────────────────────────────── */
// Same URL rule the standalone Image/Video cards use for uploaded files.
function blockMediaSrc(url) {
  if (!url) return '';
  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  return url.startsWith('http') ? url : `${backendUrl}${url}`;
}

// A tappable option (button) drawn like the standalone cards' buttons. Its
// connector id is prefixed with the element id ("<itemId>:btn-0") so the backend
// can route each option of each element separately.
function BlockButtonRow({ title, handleId, connected, seq = false, icon: OwnIcon = null }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 14px', borderRadius: 12,
        background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', position: 'relative',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
      {seq && <SeqBadge />}
      {OwnIcon ? (
        <OwnIcon size={14} style={{ position: 'absolute', right: 12, color: '#334155' }} />
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id={handleId}
          className={`btn-handle${connected ? ' connected' : ''}`}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
        />
      )}
    </div>
  );
}

// Dashed "+ ..." control drawn on the card itself. `nodrag` keeps a click from starting a canvas drag.
function BlockAddButton({ label, onClick, align = 'stretch', pill = false }) {
  return (
    <button
      type="button"
      className="nodrag"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: align,
        padding: pill ? '5px 14px' : '8px 12px', borderRadius: pill ? 999 : 12, background: '#f8fafc',
        border: '1.5px dashed #cbd5e1', color: '#334155', fontSize: pill ? 11.5 : 11.5, fontWeight: 700, cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#64748b'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; }}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

// One "Add Element" button on the card; its menu floats in a portal so neighbouring
// cards can't cover it. groups: [[title, [type...], disabled]]
function BlockAddElementMenu({ groups, onPick }) {
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const open = !!rect;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setRect(null);
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openUp = rect && rect.bottom + 330 > window.innerHeight && rect.top > 330;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="nodrag"
        onClick={(e) => {
          e.stopPropagation();
          setRect(open ? null : triggerRef.current.getBoundingClientRect());
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', borderRadius: 12,
          background: '#f8fafc', border: '1.5px dashed #cbd5e1', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        <Plus size={14} /> Add Element
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="nodrag nopan"
          style={{
            position: 'fixed', left: rect.left, width: Math.max(rect.width, 220), zIndex: 10001,
            ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            maxHeight: 320, overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0',
            borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 6,
          }}
        >
          {groups.map(([title, types, disabled]) => (
            <div key={title}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 8px 2px' }}>{title}</div>
              {disabled && <div style={{ fontSize: 11, color: '#94a3b8', padding: '2px 8px 4px' }}>This block already ends with one.</div>}
              {types.map((type) => {
                const Icon = NODE_ICONS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={disabled}
                    onClick={() => { setRect(null); onPick(type); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontSize: 12.5, color: '#1e293b', textAlign: 'left' }}
                    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  >
                    <Icon size={13} style={{ color: NODE_COLORS[type] }} /> {BLOCK_ITEM_LABELS[type]}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function BlockItemView({ item, connectedHandles, onAddButton, onAddReply, attachedToPrev = false }) {
  const d = item.data || {};
  const color = NODE_COLORS[item.type];
  const bubble = { padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: 12, color: '#334155', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
  const hint = { color: '#94a3b8' };
  const emptyMedia = (Icon, label) => (
    <div style={{ padding: '24px 12px', borderRadius: 12, background: '#f8fafc', border: '1.5px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
      <Icon size={24} style={{ color, opacity: 0.6 }} />
      <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
    </div>
  );
  const caption = (text) => (text ? <div style={{ ...bubble, padding: '8px 12px', marginBottom: 8 }}>{text}</div> : null);
  const actionOf = (b) => (typeof b === 'string' ? 'flow' : (b?.action || 'flow'));
  const titleOf = (b, fallback) => (typeof b === 'string' ? b : (b?.title || fallback));
  const ownIconOf = (a) => (a === 'phone' ? Phone : a === 'url' ? ExternalLink : a === 'goToFlow' ? Workflow : null);

  const canAddButton = !!onAddButton && ['buttons', 'text', 'image'].includes(item.type);
  const buttonRows = (list) => ((list.length > 0 || canAddButton) && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {list.map((b, i) => (
        <BlockButtonRow
          key={i}
          title={titleOf(b, `Button ${i + 1}`)}
          handleId={`${item.id}:btn-${i}`}
          connected={connectedHandles.has(`${item.id}:btn-${i}`)}
          icon={ownIconOf(actionOf(b))}
          seq={!!(typeof b === 'object' && b?.sequenceId)}
        />
      ))}
      {canAddButton && list.length < 3 && <BlockAddButton label="Add Button" onClick={() => onAddButton(item.id)} />}
    </div>
  ));

  const cardImage = (url, height) => (url ? (
    <div style={{ width: '100%', height, borderRadius: 8, background: `url(${blockMediaSrc(url)}) center/cover no-repeat #f8fafc` }} />
  ) : (
    <div style={{ width: '100%', height, borderRadius: 8, background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Image size={18} style={{ opacity: 0.4, color: '#64748b' }} />
    </div>
  ));

  switch (item.type) {
    case 'text':
      return <div style={bubble}>{(d.message || '').trim() || <span style={hint}>Enter message...</span>}</div>;

    case 'delay': {
      const secs = Number(d.seconds) || (d.delay ? (Number(d.delay.hours) || 0) * 3600 + (Number(d.delay.minutes) || 0) * 60 + (Number(d.delay.seconds) || 0) : 0);
      return <DelayPill data={{ delay: { seconds: secs || 0 } }} always style={{ marginBottom: 0 }} />;
    }

    case 'image': {
      const src = blockMediaSrc(d.imageUrl || d.mediaUrl);
      return (
        <div>
          {caption(d.caption || d.message)}
          {src ? (
            <img draggable={false} onContextMenu={(e) => e.preventDefault()} src={src} alt="Preview" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 12, border: '1px solid #e2e8f0', display: 'block' }} />
          ) : emptyMedia(Image, 'Image')}
          {buttonRows(d.buttons || [])}
        </div>
      );
    }

    case 'video': {
      const src = blockMediaSrc(d.mediaUrl || d.videoUrl);
      return (
        <div>
          {caption(d.caption)}
          {src ? (
            <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} src={src} controls muted style={{ width: '100%', maxHeight: 160, borderRadius: 12, background: '#000', display: 'block' }} />
          ) : emptyMedia(Video, 'Video')}
          {buttonRows(d.buttons || [])}
        </div>
      );
    }

    case 'audio': {
      const src = blockMediaSrc(d.audioUrl || d.mediaUrl);
      return (
        <div>
          <div style={{ padding: '14px 12px', borderRadius: 12, background: '#f8fafc', border: '1.5px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8' }}>
            <Music size={22} style={{ color, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: src ? '#334155' : '#94a3b8' }}>{src ? 'Audio Attached' : 'Audio Clip'}</span>
          </div>
          {src && <audio controlsList="nodownload noremoteplayback" onContextMenu={(e) => e.preventDefault()} src={src} controls style={{ width: '100%', height: 32, marginTop: 6, display: 'block' }} />}
        </div>
      );
    }

    case 'file':
      return (
        <div style={{ padding: '16px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, color: '#334155' }}>
          <FileText size={22} style={{ color, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename || 'Document'}</span>
        </div>
      );

    case 'card':
      return (
        <div style={{ padding: 10, borderRadius: 14, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {cardImage(d.imageUrl, 90)}
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1e293b', marginTop: 8 }}>
            {d.title || <span style={{ ...hint, fontWeight: 500, fontStyle: 'italic' }}>No title</span>}
          </div>
          {d.subtitle && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.subtitle}</div>}
          {buttonRows(d.buttons || [])}
        </div>
      );

    case 'carousel': {
      const cards = d.cards || [];
      return (
        <div>
          <div style={{ display: 'flex', gap: 8, overflow: 'hidden' }}>
            {cards.slice(0, 3).map((c, i) => (
              <div key={i} style={{ flex: '0 0 116px', padding: 8, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                {cardImage(c.imageUrl, 62)}
                <div style={{ fontWeight: 700, fontSize: 11.5, color: '#1e293b', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || `Card ${i + 1}`}</div>
                {c.subtitle && <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subtitle}</div>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8', marginTop: 6 }}>
            {cards.length} card{cards.length === 1 ? '' : 's'}{cards.length > 3 ? ` · +${cards.length - 3} more` : ''}
          </div>
        </div>
      );
    }

    case 'buttons':
      return (
        <div>
          <div style={bubble}>{(d.message || '').trim() || <span style={hint}>Enter message...</span>}</div>
          {buttonRows(d.buttons || [])}
        </div>
      );

    case 'interactive': {
      const headerType = d.headerType && d.headerType !== 'none' ? d.headerType : null;
      const headerSrc = blockMediaSrc(d.headerMediaUrl);
      return (
        <div>
          <div style={{ ...bubble, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {headerType && (
              <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                {headerType === 'text' ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{d.headerText || 'Header Text'}</span>
                ) : headerType === 'image' && headerSrc ? (
                  <img draggable={false} onContextMenu={(e) => e.preventDefault()} src={headerSrc} alt="Header" style={{ width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                ) : headerType === 'video' && headerSrc ? (
                  <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} src={headerSrc} controls muted style={{ width: '100%', maxHeight: 110, borderRadius: 8, background: '#000', display: 'block' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                    {headerType === 'image' && <Image size={14} />}
                    {headerType === 'video' && <Video size={14} />}
                    {headerType === 'document' && <FileText size={14} />}
                    <span style={{ textTransform: 'capitalize' }}>{headerSrc ? `${headerType} attached` : `Header ${headerType} — not uploaded yet`}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ minHeight: 24, color: d.message ? '#334155' : '#94a3b8' }}>{d.message || 'Enter message body...'}</div>
            {d.footerText && <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>{d.footerText}</div>}
          </div>
          {buttonRows(d.buttons || [])}
        </div>
      );
    }

    case 'quickReplies':
      return (
        <div>
          {!attachedToPrev && <div style={bubble}>{(d.message || '').trim() || <span style={hint}>Enter message...</span>}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginTop: 8 }}>
            {(d.replies || []).map((r, i) => (
              <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '6px 34px 6px 14px', borderRadius: 999, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontSize: 12, fontWeight: 600, color: '#1e293b', maxWidth: '100%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(r, `Reply ${i + 1}`)}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${item.id}:qr-${i}`}
                  className={`btn-handle${connectedHandles.has(`${item.id}:qr-${i}`) ? ' connected' : ''}`}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            ))}
            {onAddReply && (d.replies || []).length < 10 && <BlockAddButton label="Quick reply" pill align="flex-end" onClick={() => onAddReply(item.id)} />}
          </div>
        </div>
      );

    case 'listMenu': {
      let gi = -1;
      return (
        <div>
          {normalizeListMenuData(d).map((list, li) => (
            <div key={li} style={{ marginTop: li > 0 ? 8 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', marginBottom: 4 }}>{list.title || `Menu ${li + 1}`}</div>
              {list.sections.map((section, si) => (
                <div key={si}>
                  {(section.title || '').trim() && (
                    <div style={{ padding: '3px 0 2px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>{section.title}</div>
                  )}
                  <div className="fb-node-btn-list" style={{ padding: 0, marginTop: 2 }}>
                    {section.items.map((it, ii) => {
                      gi += 1;
                      const own = it.action === 'goToFlow';
                      return (
                        <div key={ii} className="fb-node-btn-chip">
                          <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title || `Option ${ii + 1}`}</span>
                          {it.sequenceId && <SeqBadge inline />}
                          {own ? (
                            <Workflow size={12} style={{ flexShrink: 0, color: '#334155' }} />
                          ) : (
                            <>
                              <ChevronRight size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                              <Handle
                                type="source"
                                position={Position.Right}
                                id={`${item.id}:item-${gi}`}
                                className={`btn-handle${connectedHandles.has(`${item.id}:item-${gi}`) ? ' connected' : ''}`}
                                style={{ top: '50%', right: -7, transform: 'translateY(-50%)', position: 'absolute' }}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

function MessageBlockNode({ id, data, selected }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const connectedHandles = useConnectedHandles(id);
  const { currentPlatform, onUpdateNodeData } = useContext(FlowNodeActionsContext);
  const validationError = data?._validationError;

  const setItems = (next) => onUpdateNodeData(id, { ...data, items: next });
  const patchItem = (itemId, fn) => setItems(items.map((it) => (it.id === itemId ? { ...it, data: fn(it.data || {}) } : it)));
  const addButton = (itemId) => patchItem(itemId, (d) => {
    const list = d.buttons || [];
    return { ...d, buttons: [...list, { title: `Button ${list.length + 1}`, action: 'flow', url: '', phone: '', reply_text: '' }] };
  });
  const addReply = (itemId) => patchItem(itemId, (d) => {
    const list = d.replies || [];
    return { ...d, replies: [...list, `Reply ${list.length + 1}`] };
  });
  const addElement = (type) => {
    const item = newBlockItem(type);
    if (type === 'quickReplies') item.data = { ...item.data, replies: ['Reply 1'] };
    const endIdx = items.findIndex((i) => BLOCK_ENDING_TYPES.includes(i.type));
    setItems(BLOCK_ENDING_TYPES.includes(type) || endIdx < 0
      ? [...items, item]
      : [...items.slice(0, endIdx), item, ...items.slice(endIdx)]);
  };
  const hasEnding = items.some((i) => BLOCK_ENDING_TYPES.includes(i.type));
  const addGroups = [
    ['Content', BLOCK_CONTENT_TYPES.filter((t) => isNodeSupportedOnPlatform(t, currentPlatform)), false],
    ['Wait for a reply (closes the block)', BLOCK_ENDING_TYPES.filter((t) => isNodeSupportedOnPlatform(t, currentPlatform)), hasEnding],
  ].filter(([, types]) => types.length > 0);
  const platformLabel = getPlatformMeta(currentPlatform).label || '';
  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderRadius: 20, background: '#ffffff', width: 320, minWidth: 320, maxWidth: 320,
        border: validationError ? '1.5px solid #ef4444' : selected ? `1.5px solid ${NODE_COLORS.messageBlock}` : '1.5px solid #e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${NODE_COLORS.messageBlock}26, 0 6px 24px rgba(0,0,0,0.10)` : '0 4px 20px rgba(0,0,0,0.06)',
        overflow: 'visible', position: 'relative', padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="messageBlock" />
      <DelayPill data={data} />
      {validationError && (
        <div className="fb-node-warning" style={{ background: '#ef4444' }} title={`Missing Data: ${validationError}`}>
          <AlertTriangle size={12} color="#fff" />
        </div>
      )}
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 24 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <PlatformIcon platform={currentPlatform} size={22} />
        <div style={{ minWidth: 0, lineHeight: 1.2 }}>
          {platformLabel && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{platformLabel}</div>}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{data.label || 'Send Message'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 ? (
          <div style={{ padding: '18px 10px', borderRadius: 12, border: '1.5px dashed #cbd5e1', background: '#f8fafc', color: '#94a3b8', fontSize: 11.5, fontWeight: 600, textAlign: 'center' }}>
            Empty — click to add elements
          </div>
        ) : items.map((item, idx) => (
          <BlockItemView
            key={item.id}
            item={item}
            connectedHandles={connectedHandles}
            onAddButton={addButton}
            onAddReply={addReply}
            attachedToPrev={item.type === 'quickReplies' && !(item.data?.message || '').trim() && isPlainBlockText(items[idx - 1])}
          />
        ))}
        <BlockAddElementMenu groups={addGroups} onPick={addElement} />
      </div>
      <div className="fb-next-step-row" style={{ marginTop: 8, marginRight: -14, marginLeft: -14, paddingLeft: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Next Step</span>
        <Handle type="source" position={Position.Right} id="next-step" className={`next-step-handle${connectedHandles.has('next-step') ? ' connected' : ''}`} />
      </div>
    </div>
  );
}

/* ── Actions Node ─────────────────────────────────────────────── */
function ActionsNode({ id, data, selected }) {
  const list = Array.isArray(data.actions) ? data.actions : [];
  return (
    <NodeWrapper id={id} color={NODE_COLORS.actions} label="Actions" icon={Zap} selected={selected} data={data} type="actions" headerBg="#fdebb0" iconColor="#d9480f">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 96, padding: '14px 14px' }}>
        {list.length === 0 ? (
          <div style={{
            padding: '22px 10px', borderRadius: 8, border: '1.5px dashed #cbd5e1', background: '#f8fafc',
            color: '#94a3b8', fontSize: 11.5, fontWeight: 600, textAlign: 'center',
          }}>
            No actions yet — click to add
          </div>
        ) : list.map((a) => {
          const t = ACTION_TYPES[a.type];
          if (!t) return null;
          const Icon = t.icon;
          const detail = describeAction(a);
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8,
              background: '#f8fafc', border: '1px solid #e2e8f0',
            }}>
              <Icon size={13} style={{ color: '#475569', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b' }}>{t.label}</div>
                <div style={{ fontSize: 10.5, color: detail ? '#64748b' : '#ef4444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {detail || 'Not set'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </NodeWrapper>
  );
}

/* ── Start Automation Node ────────────────────────────────────── */
// Hands the contact over to another existing flow, so nothing continues from
// this card (hideNextStep) — same reasoning as Start/Stop Sequence above.
function StartAutomationNode({ id, data, selected }) {
  const { flowsList, currentFlowId, currentPlatform, onUpdateNodeData } = useContext(FlowNodeActionsContext);
  const [open, setOpen] = useState(false);
  const target = flowsList.find((f) => f.id === data.flowId);
  const name = target?.name || data.flowName;

  return (
    <NodeWrapper id={id} color={NODE_COLORS.startAutomation} label="Start Automation" icon={Workflow} selected={selected} data={data} type="startAutomation" hideNextStep headerBg="#e7f7a8" iconColor="#4d7c0f">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body" style={{ padding: '14px 14px' }}>
        <button
          type="button"
          className="nodrag"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          style={{
            width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 8, padding: '16px 12px', borderRadius: 8, cursor: 'pointer',
            border: name ? '1px solid #e2e8f0' : '1.5px dashed #cbd5e1', background: name ? '#f8fafc' : '#ffffff', textAlign: 'left',
          }}
        >
          <Workflow size={14} style={{ color: name ? '#475569' : '#94a3b8', flexShrink: 0 }} />
          <span style={{
            fontSize: 12, fontWeight: 700, color: name ? '#1e293b' : '#94a3b8', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name || 'Choose an automation'}
          </span>
          <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
        </button>
      </div>
      {open && (
        <AutomationPickerModal
          flows={flowsList}
          currentFlowId={currentFlowId}
          platform={currentPlatform}
          selectedId={data.flowId}
          onClose={() => setOpen(false)}
          onSelect={(f) => {
            onUpdateNodeData(id, { ...data, flowId: f.id, flowName: f.name });
            setOpen(false);
          }}
        />
      )}
    </NodeWrapper>
  );
}

/* ── Final Answer Node (only used inside a User Input Flow) ────── */
function FinalAnswerNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.finalAnswer} label="Final Answer" icon={Flag} selected={selected} data={data} type="finalAnswer" hideNextStep>
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body">
        {data.message ? (
          <div className="fb-node-body-preview">{data.message}</div>
        ) : (
          <span style={{ opacity: 0.6, fontStyle: 'italic', fontSize: 11, color: '#64748b' }}>Closing message — ends this Q&A sequence</span>
        )}
      </div>
    </NodeWrapper>
  );
}

/* ── Run User Input Flow Node ───────────────────────────────────── */
function RunUserInputFlowNode({ id, data, selected }) {
  // Larger than a standard 220px node — this card is a doorway into a whole
  // separate reusable form, not a one-line message, so it needs room to show
  // which one is selected at a glance rather than just an id/name in small type.
  return (
    <NodeWrapper id={id} color={NODE_COLORS.runUserInputFlow} label="Run User Input Flow" icon={ClipboardList} selected={selected} data={data} type="runUserInputFlow">
      <Handle type="target" position={Position.Left} className="target-handle" style={{ position: 'absolute', left: -5, top: 22 }} />
      <div className="fb-node-body" style={{ padding: '10px 12px' }}>
        {data.userInputFlowId ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 10, background: `${NODE_COLORS.runUserInputFlow}0e`,
            border: `1px solid ${NODE_COLORS.runUserInputFlow}2a`,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: NODE_COLORS.runUserInputFlow, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ClipboardList size={15} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: '#1e293b',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {data.userInputFlowName || `Form #${data.userInputFlowId}`}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600, marginTop: 1 }}>
                Tap to select, create, view, or edit →
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px',
            borderRadius: 10, border: '1.5px dashed #cbd5e1', background: '#f8fafc',
            color: '#94a3b8', fontSize: 12, fontWeight: 600,
          }}>
            <ClipboardList size={16} />
            No form selected — click to choose or create one
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIA UPLOAD HELPERS FOR PROPERTIES PANEL
   ═══════════════════════════════════════════════════════════════════ */

function ImageUploadField({ label = 'Image', value, onChange, placeholder = 'https://...' }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  const fullUrl = value && !value.startsWith('http') ? `${backendUrl}${value}` : value;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAPI.uploadFile(formData);
      if (res.data?.url) {
        onChange(res.data.url);
      }
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fb-field">
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {value && (
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: 0 }}
            onClick={() => onChange('')}
          >
            Remove
          </button>
        )}
      </label>

      {/* Image Preview Thumbnail if value exists */}
      {value ? (
        <div style={{ position: 'relative', marginBottom: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <img draggable={false} onContextMenu={(e) => e.preventDefault()}
            src={fullUrl}
            alt="Preview"
            style={{ width: '100%', maxHeight: 130, objectFit: 'cover', display: 'block' }}
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="fb-add-btn"
          style={{ padding: '6px 10px', fontSize: 11, flexShrink: 0, gap: 4 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 size={12} className="fb-loading-spinner" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : value ? 'Replace Image' : 'Upload Image'}
        </button>

        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
        />
      </div>
    </div>
  );
}

function MediaUploadField({ label = 'Media File', value, onChange, accept = '*/*', placeholder = 'https://...' }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  const fullUrl = value && !value.startsWith('http') ? `${backendUrl}${value}` : value;
  const isVideo = accept.includes('video');
  const isAudio = accept.includes('audio');

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAPI.uploadFile(formData);
      if (res.data?.url) {
        onChange(res.data.url);
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
      alert('Failed to upload media file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fb-field">
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {value && (
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: 0 }}
            onClick={() => onChange('')}
          >
            Remove
          </button>
        )}
      </label>

      {/* Preview once uploaded — video/audio players, same idea as the image thumbnail above */}
      {value && isVideo ? (
        <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} src={fullUrl} controls style={{ width: '100%', maxHeight: 160, borderRadius: 8, background: '#000', marginBottom: 8, display: 'block' }} />
      ) : value && isAudio ? (
        <audio controlsList="nodownload noremoteplayback" onContextMenu={(e) => e.preventDefault()} src={fullUrl} controls style={{ width: '100%', marginBottom: 8, display: 'block' }} />
      ) : null}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="file"
          ref={fileInputRef}
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="fb-add-btn"
          style={{ padding: '6px 10px', fontSize: 11, flexShrink: 0, gap: 4 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 size={12} className="fb-loading-spinner" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : value ? 'Replace File' : 'Upload File'}
        </button>

        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
        />
      </div>
    </div>
  );
}

/* ── Start Node Properties with Multi-Trigger & Dotted Buttons ──── */
function StartNodeProperties({ data = {}, onUpdateNode, sequences = [], onSequenceCreated, platform, onAttachSequence, attachedSequenceNode, onSelectSequenceNode }) {
  const rawTriggers = (data.triggers && Array.isArray(data.triggers) && data.triggers.length > 0)
    ? data.triggers
    : [
        {
          id: 'trig-1',
          type: data.trigger_type || 'keyword',
          match_type: data.match_type || 'contains',
          keywords: Array.isArray(data.keywords)
            ? data.keywords
            : (data.trigger_keyword ? data.trigger_keyword.split(',').map((s) => s.trim()).filter(Boolean) : ['hi', 'hello']),
        },
      ];

  const [triggers, setTriggers] = useState(rawTriggers);
  const [keywordInputs, setKeywordInputs] = useState({});
  const availableLabels = useAvailableLabels();
  const selectedLabelIds = Array.isArray(data.labelIds) ? data.labelIds : [];
  const toggleStartLabel = (labelId) => {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((l) => l !== labelId)
      : [...selectedLabelIds, labelId];
    onUpdateNode({ ...data, labelIds: next });
  };

  useEffect(() => {
    if (data.triggers && Array.isArray(data.triggers) && data.triggers.length > 0) {
      setTriggers(data.triggers);
    }
    if (data._addTriggerNow) {
      const newTrig = {
        id: `trig-${Date.now().toString(36)}`,
        type: 'keyword',
        match_type: 'contains',
        keywords: ['hello'],
      };
      const currentList = (data.triggers && Array.isArray(data.triggers) && data.triggers.length > 0)
        ? data.triggers
        : rawTriggers;
      const nextTriggers = [...currentList, newTrig];
      setTriggers(nextTriggers);
      const cleanData = { ...data };
      delete cleanData._addTriggerNow;
      onUpdateNode({
        ...cleanData,
        triggers: nextTriggers,
      });
    }
    // Intentionally keyed on the one-shot "add a trigger now" request only — re-running on every data change would keep adding triggers.
  }, [data.triggers, data._addTriggerNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncTriggers = (newTriggers) => {
    setTriggers(newTriggers);
    const firstTrig = newTriggers[0] || {};
    const firstKws = Array.isArray(firstTrig.keywords) ? firstTrig.keywords : [];
    onUpdateNode({
      ...data,
      triggers: newTriggers,
      trigger_type: firstTrig.type || 'keyword',
      match_type: firstTrig.match_type || 'contains',
      keywords: firstKws,
      trigger_keyword: firstKws.join(','),
    });
  };

  const handleAddTriggerRule = () => {
    const newTrig = {
      id: `trig-${Date.now().toString(36)}`,
      type: 'keyword',
      match_type: 'contains',
      keywords: ['hello'],
    };
    syncTriggers([...triggers, newTrig]);
  };

  const handleRemoveTriggerRule = (indexToRemove) => {
    if (triggers.length <= 1) return;
    const updated = triggers.filter((_, idx) => idx !== indexToRemove);
    syncTriggers(updated);
  };

  const handleUpdateRule = (index, field, value) => {
    const updated = triggers.map((trg, idx) => {
      if (idx !== index) return trg;
      return { ...trg, [field]: value };
    });
    syncTriggers(updated);
  };

  const handleAddKeywordToRule = (ruleIndex) => {
    const inputVal = (keywordInputs[ruleIndex] || '').trim();
    if (!inputVal) return;
    const currentRule = triggers[ruleIndex];
    const currentKws = Array.isArray(currentRule.keywords) ? currentRule.keywords : [];
    const newItems = inputVal.split(',').map((k) => k.trim()).filter(Boolean);
    const updatedKeywords = Array.from(new Set([...currentKws, ...newItems]));

    const updated = triggers.map((trg, idx) => {
      if (idx !== ruleIndex) return trg;
      return { ...trg, keywords: updatedKeywords };
    });
    syncTriggers(updated);
    setKeywordInputs((prev) => ({ ...prev, [ruleIndex]: '' }));
  };

  const handleRemoveKeywordFromRule = (ruleIndex, kwIndexToRemove) => {
    const currentRule = triggers[ruleIndex];
    const currentKws = Array.isArray(currentRule.keywords) ? currentRule.keywords : [];
    const updatedKeywords = currentKws.filter((_, idx) => idx !== kwIndexToRemove);

    const updated = triggers.map((trg, idx) => {
      if (idx !== ruleIndex) return trg;
      return { ...trg, keywords: updatedKeywords };
    });
    syncTriggers(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#5c5c80' }}>
          Flow Triggers ({triggers.length})
        </span>
        <span style={{ fontSize: 10, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
          Starts automation
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {triggers.map((trg, rIdx) => {
          const tType = trg.type || 'keyword';
          const mType = trg.match_type || 'contains';
          const kws = Array.isArray(trg.keywords) ? trg.keywords : [];

          return (
            <div
              key={trg.id || rIdx}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Trigger header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={13} style={{ color: '#0f172a' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                    Rule #{rIdx + 1}
                  </span>
                </div>
                {triggers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTriggerRule(rIdx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Delete trigger rule"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Trigger Type */}
              <div className="fb-field">
                <label>When this happens</label>
                <select
                  value={tType}
                  onChange={(e) => handleUpdateRule(rIdx, 'type', e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  <option value="keyword">User sends a message (Keyword)</option>
                  <option value="first_message">First contact (Welcome new users)</option>
                  <option value="any_message">Any incoming message (Fallback)</option>
                </select>
              </div>

              {tType === 'keyword' && (
                <>
                  {/* Match Type */}
                  <div className="fb-field">
                    <label>Condition</label>
                    <select
                      value={mType}
                      onChange={(e) => handleUpdateRule(rIdx, 'match_type', e.target.value)}
                      style={{ fontSize: 12 }}
                    >
                      <option value="contains">Message contains</option>
                      <option value="is">Message is</option>
                      <option value="contains_whole_word">Message contains whole word</option>
                      <option value="begins_with">Message begins with</option>
                      <option value="thumbs_up">Message is thumbs up</option>
                      <option value="does_not_contain">Message doesn't contain</option>
                    </select>
                  </div>

                  {/* If Thumbs up, special banner */}
                  {mType === 'thumbs_up' ? (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        fontSize: 11,
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        lineHeight: 1.3,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>👍</span>
                      <span>Triggers when contact sends a thumbs up emoji, like button, or (y).</span>
                    </div>
                  ) : (
                    /* Keywords editor */
                    <div className="fb-field">
                      <label>Keywords ({kws.length})</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 24, marginBottom: 6 }}>
                        {kws.length === 0 ? (
                          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                            No keywords added yet.
                          </span>
                        ) : (
                          kws.map((kw, kIdx) => (
                            <span
                              key={`${kw}_${kIdx}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 5,
                                background: '#f1f5f9',
                                color: '#0f172a',
                                fontSize: 11,
                                fontWeight: 600,
                                border: '1px solid #cbd5e1',
                              }}
                            >
                              {kw}
                              <button
                                type="button"
                                onClick={() => handleRemoveKeywordFromRule(rIdx, kIdx)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#64748b',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: 11,
                                  fontWeight: 'bold',
                                  lineHeight: 1,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                                title={`Remove "${kw}"`}
                              >
                                ✕
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Keyword Input and Dotted Add Button */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={keywordInputs[rIdx] || ''}
                          onChange={(e) => setKeywordInputs({ ...keywordInputs, [rIdx]: e.target.value })}
                          placeholder="Type keyword..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddKeywordToRule(rIdx);
                            }
                          }}
                          style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddKeywordToRule(rIdx)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1.5px dashed #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <Plus size={13} /> Add
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Dotted button to add trigger rule */}
      <button
        type="button"
        onClick={handleAddTriggerRule}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          width: '100%',
          padding: '9px 12px',
          borderRadius: 8,
          border: '1.5px dashed #cbd5e1',
          background: '#ffffff',
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#94a3b8';
          e.currentTarget.style.background = '#f8fafc';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#cbd5e1';
          e.currentTarget.style.background = '#ffffff';
        }}
      >
        <Plus size={14} /> + Add Trigger Rule
      </button>

      <div className="fb-field" style={{ margin: 0 }}>
        <label>Tag with Label (optional)</label>
        <LabelTagPicker
          labels={availableLabels}
          selectedIds={selectedLabelIds}
          onToggle={toggleStartLabel}
          hint="Applied to the contact the moment this Flow's trigger fires."
        />
      </div>

      <StartNodeSequenceAttach
        sequences={sequences}
        onSequenceCreated={onSequenceCreated}
        platform={platform}
        onAttachSequence={onAttachSequence}
        attachedSequenceNode={attachedSequenceNode}
        onSelectSequenceNode={onSelectSequenceNode}
      />
    </div>
  );
}

/* ── Auto-enroll into a Sequence right when this Flow starts ─────────
   A separate "Start Sequence" action node already covers mid-flow
   enrollment; this is the common shortcut for "enroll them the moment they
   trigger this flow" without needing an extra node wired after Start. */
// Picking a sequence here doesn't hide the enrollment inside the Start node's
// own data — it adds a real, visible "Start Sequence" node as its OWN branch
// off Start (wired via onAttachSequence, implemented in FlowBuilderInner as
// handleAttachSequenceToStart), on a second dedicated connector separate from
// Start's "Then" edge into the real conversation. Two independent wires out
// of Start — one to the flow's own first step (untouched), one to this
// Sequence — rather than inserting a step into the conversation path itself.
function StartNodeSequenceAttach({ sequences, onSequenceCreated, platform, onAttachSequence, attachedSequenceNode, onSelectSequenceNode }) {
  const { currentIntegrationId } = useContext(FlowNodeActionsContext);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await sequenceAPI.create({ name: newName.trim(), platform, integrationId: currentIntegrationId });
      const created = res.data?.sequence;
      onSequenceCreated?.(created);
      onAttachSequence(created.id, created.name);
      setCreating(false);
      setNewName('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create Sequence');
    } finally {
      setSaving(false);
    }
  };

  // Already wired — the picker's job is done, editing from here on happens on
  // the "Start Sequence" node itself (same place any other node is edited).
  if (attachedSequenceNode) {
    return (
      <div style={{ paddingTop: 4, borderTop: '1px solid #e2e8f0' }}>
        <div className="fb-field" style={{ marginTop: 10 }}>
          <label>Attached Sequence</label>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '8px 10px', border: '1px solid #cffafe', borderRadius: 8, background: '#ecfeff',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0e7490' }}>
              {attachedSequenceNode.data?.sequenceName || 'Sequence'}
            </span>
            <button type="button" className="fb-add-btn" style={{ padding: '4px 10px' }} onClick={() => onSelectSequenceNode(attachedSequenceNode.id)}>
              Edit →
            </button>
          </div>
          <span className="fb-hint">
            That's the "Start Sequence" node wired to Start's own Sequence branch on the canvas — click Edit to
            change or remove it (deleting that node removes the auto-enrollment; the flow itself is unaffected).
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 4, borderTop: '1px solid #e2e8f0' }}>
      <div className="fb-field" style={{ marginTop: 10 }}>
        <label>Attach Sequence (optional)</label>
        {creating ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Welcome Series"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button type="button" className="fb-add-btn" disabled={saving || !newName.trim()} onClick={handleCreate}>
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button type="button" className="fb-add-btn" style={{ background: 'transparent' }} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === 'CREATE_NEW') { setCreating(true); return; }
              if (!e.target.value) return;
              const id = Number(e.target.value);
              const seq = sequences.find((s) => s.id === id);
              onAttachSequence(id, seq?.name || '');
            }}
          >
            <option value="">None</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="CREATE_NEW">+ Create new Sequence...</option>
          </select>
        )}
        {error && <span className="fb-hint" style={{ color: '#ef4444' }}>{error}</span>}
        <span className="fb-hint">
          Adds a "Start Sequence" node as its own branch off Start (a separate wire, below) — the subscriber
          is enrolled the moment they trigger this flow, while the flow's own conversation continues
          completely unaffected. The Sequence sends its messages on its own schedule, independent of the flow.
        </span>
      </div>
    </div>
  );
}

/* ── Button Action Editor: a collapsed row + a focused "Edit Button"
   submenu (modeled on ManyChat's own button editor) that opens over the
   canvas when the row is clicked. Action type is a plain vertical list of
   rows — not tabs, not a native <select> — per how this was asked for. ── */
function ButtonActionEditor({
  btn, index, onChange, onRemove, platform,
  flows = [], currentFlowId = null,
  sequences = [], onSequenceCreated,
  variant = 'button', // 'button' | 'item' — a list item shares this whole editor,
                       // just with a Description field and (on WhatsApp) a
                       // narrower action set — see the isWA exclusion below.
}) {
  const { currentIntegrationId } = useContext(FlowNodeActionsContext);
  const p = (platform || 'WEBCHAT').toUpperCase();
  const isItem = variant === 'item';
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingSeq, setCreatingSeq] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [savingSeq, setSavingSeq] = useState(false);
  const availableLabels = useAvailableLabels();

  const btnObj = typeof btn === 'string'
    ? { title: btn, action: 'flow', url: '', phone: '', reply_text: '' }
    : { action: 'flow', url: '', phone: '', reply_text: '', ...btn };

  const isFB = p === 'FACEBOOK';
  const isWA = p === 'WHATSAPP';

  // Same-platform flows only — jumping into a flow built for a different
  // channel would just fail to send there. Excludes the flow being edited:
  // that's what "Continue Flow (Next Step)" already is.
  const availableFlows = flows.filter(
    (f) => (f.platform || '').toUpperCase() === p && f.id !== currentFlowId
  );

  // Allowed action types, per Meta's own WhatsApp Cloud API docs: a reply
  // button AND a list row are BOTH fundamentally postback-only — tapping
  // either just sends a reply, full stop. A button's "Open Website" only
  // really works as a genuine link when it's the single button on the
  // message (Meta's separate cta_url message type — see platformSender.js);
  // a list ROW has no such exception at all, there's no per-row URL/call
  // capability on WhatsApp under any configuration — so a list item on
  // WhatsApp doesn't get offered options it structurally cannot do.
  const skipUrlPhoneOnWA = isWA && isItem;
  const actionOptions = [
    { value: 'flow', label: 'Continue Flow (Next Step)', description: 'Follows the wire connected to this button on the canvas.', Icon: CornerDownRight },
    { value: 'goToFlow', label: 'Go to Existing Flow', description: "Jumps straight to another flow's start — no wire needed.", Icon: Workflow },
    ...(skipUrlPhoneOnWA ? [] : [{ value: 'url', label: 'Open Website / URL', description: 'Opens a link — never replies back to the bot.', Icon: ExternalLink }]),
    ...(!skipUrlPhoneOnWA && (isFB || p === 'WEBCHAT') ? [{ value: 'phone', label: 'Call Phone Number', description: 'Dials a number — never replies back to the bot.', Icon: Phone }] : []),
  ];

  const updateProp = (field, val) => {
    onChange({ ...btnObj, [field]: val });
  };

  const getActionBadge = () => {
    switch (btnObj.action) {
      case 'url': return { label: 'URL', bg: '#f1f5f9', color: '#334155' };
      case 'phone': return { label: 'Call', bg: '#f1f5f9', color: '#334155' };
      case 'goToFlow': return { label: 'Go to Flow', bg: '#eef2ff', color: '#4338ca' };
      default: return { label: 'Flow', bg: '#f1f5f9', color: '#334155' };
    }
  };

  const badge = getActionBadge();

  const handleCreateSequence = async () => {
    if (!newSeqName.trim() || savingSeq) return;
    setSavingSeq(true);
    try {
      const res = await sequenceAPI.create({ name: newSeqName.trim(), platform: p, integrationId: currentIntegrationId });
      const seq = res.data?.sequence;
      if (seq) {
        onSequenceCreated?.(seq);
        onChange({ ...btnObj, sequenceId: seq.id, sequenceName: seq.name });
      }
      setCreatingSeq(false);
      setNewSeqName('');
    } catch {
      // Swallowed — the picker just stays open so the user can retry, same
      // as the other inline "create new" pickers in this file.
    } finally {
      setSavingSeq(false);
    }
  };

  return (
    <>
      {/* Collapsed row — click anywhere on it (not just a tiny toggle) to
          reopen the submenu and change what's already set. */}
      <div
        onClick={() => setMenuOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          background: '#ffffff',
          marginBottom: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', width: 16, flexShrink: 0 }}>
          {index + 1}.
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: '#0f172a',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {btnObj.title || (isItem ? `Option ${index + 1}` : `Button ${index + 1}`)}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 4,
            background: badge.bg,
            color: badge.color,
            border: '1px solid #e2e8f0',
            flexShrink: 0,
          }}
        >
          {badge.label}
        </span>
        {btnObj.sequenceId && (
          <span
            title={`Also enrolls in "${btnObj.sequenceName || 'a Sequence'}"`}
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: '#ecfeff', color: '#0e7490', border: '1px solid #e2e8f0', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <Play size={9} /> Seq
          </span>
        )}
        {Array.isArray(btnObj.labelIds) && btnObj.labelIds.length > 0 && (
          <span
            title={`Tags contact with ${btnObj.labelIds.length} label${btnObj.labelIds.length > 1 ? 's' : ''} on tap`}
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: '#fdf4ff', color: '#a21caf', border: '1px solid #e2e8f0', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <Tag size={9} /> {btnObj.labelIds.length}
          </span>
        )}
        <span
          title={`Edit ${isItem ? 'item' : 'button'}`}
          style={{ color: '#64748b', display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}
        >
          <Settings2 size={13} />
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
          title={isItem ? 'Remove item' : 'Remove button'}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* "Edit Button" submenu */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.35)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '64px 340px 24px 24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 320,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              borderRadius: 14,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid #e2e8f0',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{isItem ? 'Edit List Item' : 'Edit Button'}</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  width: 26,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {isItem ? 'Set up this item' : 'Set up this button'}
              </div>

              <div className="fb-field" style={{ margin: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{isItem ? 'Item title' : 'Button title'}</label>
                <input
                  autoFocus
                  value={btnObj.title || ''}
                  onChange={(e) => updateProp('title', e.target.value)}
                  placeholder={isItem ? `Option ${index + 1} text...` : `Button ${index + 1} text...`}
                  maxLength={isItem ? 24 : 20}
                  style={{ fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#ffffff' }}
                />
              </div>

              {isItem && (
                <div className="fb-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Description (optional)</label>
                  <input
                    value={btnObj.description || ''}
                    onChange={(e) => updateProp('description', e.target.value)}
                    placeholder="A short line shown under the title..."
                    maxLength={72}
                    style={{ fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#ffffff' }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  When this button is pressed
                </label>
                {/* Plain vertical list of rows — not tabs, not a dropdown. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {actionOptions.map((opt) => {
                    const active = (btnObj.action || 'flow') === opt.value;
                    const OptIcon = opt.Icon;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => updateProp('action', opt.value)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 10px',
                          borderRadius: 8,
                          border: active ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                          background: active ? '#eef2ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            background: active ? '#4f46e5' : '#f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <OptIcon size={13} color={active ? '#ffffff' : '#64748b'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>{opt.label}</div>
                          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>{opt.description}</div>
                        </div>
                        {active && <Check size={15} color="#4f46e5" style={{ flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action: Go to Existing Flow */}
              {btnObj.action === 'goToFlow' && (
                <div className="fb-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
                    Flow to open
                  </label>
                  <DropdownSelect
                    placeholder="Select a flow…"
                    options={availableFlows.map((f) => ({ value: f.id, label: f.name }))}
                    value={btnObj.flowId || null}
                    emptyText={`No other ${p} flows yet.`}
                    onChange={(fid) => {
                      const target = availableFlows.find((f) => f.id === fid);
                      onChange({ ...btnObj, flowId: fid, flowName: target?.name || '' });
                    }}
                  />
                  {availableFlows.length === 0 && (
                    <span style={{ fontSize: 9.5, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>
                      No other {p} flows yet — create one first, then come back and pick it here.
                    </span>
                  )}
                  <span style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                    Jumps the subscriber straight to the start of this flow — no wire needed on the canvas.
                  </span>
                </div>
              )}

              {/* Action: Open Website */}
              {btnObj.action === 'url' && (
                <div className="fb-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
                    Website URL (https://)
                  </label>
                  <input
                    type="url"
                    value={btnObj.url || ''}
                    onChange={(e) => updateProp('url', e.target.value)}
                    placeholder="https://example.com"
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, background: '#ffffff' }}
                  />
                  {isWA && (
                    <span style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                      ℹ️ WhatsApp CTA URL button: opens browser directly upon tap.
                    </span>
                  )}
                </div>
              )}

              {/* Action: Call Phone Number */}
              {btnObj.action === 'phone' && (
                <div className="fb-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
                    Phone Number (E.164 with country code)
                  </label>
                  <input
                    type="tel"
                    value={btnObj.phone || ''}
                    onChange={(e) => updateProp('phone', e.target.value)}
                    placeholder="+1234567890"
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, background: '#ffffff' }}
                  />
                  <span style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                    Format: +[Country Code][Number] without spaces or dashes.
                  </span>
                </div>
              )}

              {/* Attach a Sequence — independent of the action above (enrolls
                  the subscriber in the background; whatever the tap DOES —
                  continue, jump to a flow, open a link — still happens too).
                  Same additive relationship the Start node's own "Attach
                  Sequence" branch already has to the rest of that flow. */}
              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Also enroll in a Sequence (optional)
                </label>
                {creatingSeq ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      value={newSeqName}
                      onChange={(e) => setNewSeqName(e.target.value)}
                      placeholder="e.g. Welcome Series"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateSequence()}
                      style={{ flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                    <button type="button" className="fb-add-btn" disabled={savingSeq || !newSeqName.trim()} onClick={handleCreateSequence}>
                      {savingSeq ? 'Creating...' : 'Create'}
                    </button>
                    <button type="button" className="fb-add-btn" style={{ background: 'transparent' }} onClick={() => setCreatingSeq(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <select
                    value={btnObj.sequenceId || ''}
                    onChange={(e) => {
                      if (e.target.value === 'CREATE_NEW') { setCreatingSeq(true); return; }
                      const sid = e.target.value ? Number(e.target.value) : null;
                      const seq = sequences.find((s) => s.id === sid);
                      onChange({ ...btnObj, sequenceId: sid, sequenceName: seq?.name || '' });
                    }}
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, background: '#ffffff' }}
                  >
                    <option value="">None</option>
                    {sequences.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value="CREATE_NEW">+ Create new Sequence...</option>
                  </select>
                )}
                <span style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginTop: 4, display: 'block' }}>
                  Enrolls the subscriber the moment this {isItem ? 'item' : 'button'} is tapped — the Sequence sends
                  on its own schedule, separate from whatever else this {isItem ? 'item' : 'button'} does.
                </span>
              </div>

              {/* Tag with Label — same additive, independent-of-the-action
                  relationship as the Sequence block above. */}
              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Tag with Label (optional)
                </label>
                <LabelTagPicker
                  labels={availableLabels}
                  selectedIds={Array.isArray(btnObj.labelIds) ? btnObj.labelIds : []}
                  onToggle={(labelId) => {
                    const current = Array.isArray(btnObj.labelIds) ? btnObj.labelIds : [];
                    updateProp('labelIds', current.includes(labelId) ? current.filter((l) => l !== labelId) : [...current, labelId]);
                  }}
                  hint={`Tags the contact the moment this ${isItem ? 'item' : 'button'} is tapped.`}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => { onRemove(); setMenuOpen(false); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 4px',
                }}
              >
                <Trash2 size={13} /> {isItem ? 'Delete item' : 'Delete button'}
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{
                  background: '#4f46e5',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '7px 18px',
                  borderRadius: 8,
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROPERTIES PANEL
   ═══════════════════════════════════════════════════════════════════ */

// Mirrors utils/flowEngine.js's inputTypeToFieldType() on the backend — kept in
// sync manually since frontend/backend can't share a module here.
function inputTypeToFieldType(inputType) {
  if (inputType === 'number') return 'NUMBER';
  if (inputType === 'date') return 'DATE';
  return 'TEXT'; // name / email / phone / custom
}

/* ── Inline "create a new custom field" mini-form (used from a Question node) ── */
function NewCustomFieldInline({ fieldType, options, onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      // For a Multiple Choice question, the field's own options ARE the
      // question's options — one list, defined once (same principle as the
      // Custom-Field-only simplification: no separate copy to keep in sync).
      const res = await customFieldAPI.create({ name: name.trim(), fieldType, options });
      onCreated(res.data.field);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`New ${fieldType.toLowerCase()} field name...`}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button type="button" className="fb-add-btn" disabled={saving || !name.trim()} onClick={handleCreate}>
          {saving ? 'Creating...' : 'Create'}
        </button>
        <button type="button" className="fb-add-btn" onClick={onCancel} style={{ background: 'transparent' }}>
          Cancel
        </button>
      </div>
      {error && <span className="fb-hint" style={{ color: '#ef4444' }}>{error}</span>}
    </div>
  );
}

/* ── "Run User Input Flow" node config: pick an existing one or create new ── */
function RunUserInputFlowFields({ data, updateFields, userInputFlows, onCreated, platform, onDrillIn }) {
  const { currentIntegrationId } = useContext(FlowNodeActionsContext);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      // Created against THIS flow's channel — a User Input Flow is locked to one
      // channel, so it can only ever be reused by other automations on the same one.
      const res = await userInputFlowAPI.create({
        name: newName.trim(),
        platform,
        integrationId: currentIntegrationId,
        nodesJson: [],
        edgesJson: [],
      });
      const newId = res.data.userInputFlowId;
      onCreated({ id: newId, name: newName.trim(), platform });
      setCreating(false);
      setNewName('');
      // Drill into the form builder RIGHT HERE — same canvas, same session — a
      // brand-new one has no questions yet, so leaving the user on this panel
      // would be a dead end. See FlowBuilderInner's drillIntoUif.
      onDrillIn?.(newId, newName.trim());
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create User Input Flow');
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <div className="fb-field">
        <label>New User Input Flow Name</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Lead Capture Form"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button type="button" className="fb-add-btn" disabled={saving || !newName.trim()} onClick={handleCreate}>
            {saving ? 'Creating...' : 'Create'}
          </button>
          <button type="button" className="fb-add-btn" style={{ background: 'transparent' }} onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
        {error && <span className="fb-hint" style={{ color: '#ef4444' }}>{error}</span>}
      </div>
    );
  }

  const selected = userInputFlows.find((f) => f.id === data.userInputFlowId);

  return (
    <div className="fb-field">
      <label>User Input Flow</label>
      <select
        value={data.userInputFlowId || ''}
        onChange={(e) => {
          if (e.target.value === 'CREATE_NEW') { setCreating(true); return; }
          const id = e.target.value ? Number(e.target.value) : null;
          const uif = userInputFlows.find((f) => f.id === id);
          updateFields({ userInputFlowId: id, userInputFlowName: uif?.name || '' });
          setViewing(false);
        }}
      >
        <option value="">Select a User Input Flow...</option>
        {userInputFlows.map((f) => (
          <option key={f.id} value={f.id}>{f.name}{f.nodeCount ? '' : ' (empty)'}</option>
        ))}
        <option value="CREATE_NEW">+ Create new User Input Flow...</option>
      </select>
      <span className="fb-hint">
        Runs that reusable Q&A sequence right here, then continues this flow once the form finishes.
        Only forms built for this channel are listed.
      </span>
      {data.userInputFlowId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="fb-add-btn"
              style={{ flex: 1 }}
              onClick={() => onDrillIn?.(data.userInputFlowId, data.userInputFlowName)}
            >
              Edit questions →
            </button>
            <button
              type="button"
              className="fb-add-btn"
              style={{ background: 'transparent' }}
              onClick={() => setViewing((v) => !v)}
            >
              {viewing ? 'Hide' : 'View'}
            </button>
          </div>
          {viewing && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#f8fafc', fontSize: 11.5, color: '#475569', lineHeight: 1.6,
            }}>
              <strong>{selected?.name || data.userInputFlowName}</strong><br />
              {selected?.nodeCount ? `${selected.nodeCount} step${selected.nodeCount === 1 ? '' : 's'}` : 'Not built yet'}
              {typeof selected?.responseCount === 'number' && ` · ${selected.responseCount} response${selected.responseCount === 1 ? '' : 's'} so far`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Start Sequence / Stop Sequence action node config ────────────────
   Fires a real side-effect step in a main Flow (enroll/stop a contact in a
   Sequence), then continues the flow via its own edge — same shape as
   RunUserInputFlowFields above, minus drill-in: a Sequence is edited on its
   own dedicated page (not inline here), per the Sequence Messages plan's
   scoped-down triggering design. `stop` distinguishes the two node types;
   both just pick a sequenceId. */
function SequenceActionFields({ data, updateFields, sequences, onCreated, platform, stop = false }) {
  const { currentIntegrationId } = useContext(FlowNodeActionsContext);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await sequenceAPI.create({ name: newName.trim(), platform, integrationId: currentIntegrationId });
      const created = res.data?.sequence;
      onCreated?.(created);
      updateFields({ sequenceId: created.id, sequenceName: created.name });
      setCreating(false);
      setNewName('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create Sequence');
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <div className="fb-field">
        <label>New Sequence Name</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Welcome Series"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button type="button" className="fb-add-btn" disabled={saving || !newName.trim()} onClick={handleCreate}>
            {saving ? 'Creating...' : 'Create'}
          </button>
          <button type="button" className="fb-add-btn" style={{ background: 'transparent' }} onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
        {error && <span className="fb-hint" style={{ color: '#ef4444' }}>{error}</span>}
      </div>
    );
  }

  return (
    <div className="fb-field">
      <label>Sequence</label>
      <select
        value={data.sequenceId || ''}
        onChange={(e) => {
          if (e.target.value === 'CREATE_NEW') { setCreating(true); return; }
          const id = e.target.value ? Number(e.target.value) : null;
          const seq = sequences.find((s) => s.id === id);
          updateFields({ sequenceId: id, sequenceName: seq?.name || '' });
        }}
      >
        <option value="">Select a Sequence...</option>
        {sequences.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        {!stop && <option value="CREATE_NEW">+ Create new Sequence...</option>}
      </select>
      <span className="fb-hint">
        {stop
          ? "Stops this contact's enrollment in the selected Sequence — any scheduled messages still pending are cancelled."
          : "Enrolls this contact into the selected Sequence's scheduled messages. Already-active enrollment in this same Sequence is left alone (never double-enrolled); other Sequences are unaffected."}
      </span>
      {data.sequenceId && !stop && (
        <button
          type="button"
          className="fb-add-btn"
          style={{ marginTop: 8 }}
          onClick={() => window.open(`/sequences/${data.sequenceId}/edit`, '_blank')}
        >
          Edit steps →
        </button>
      )}
    </div>
  );
}

/* ── Message Block properties ──────────────────────────────────── */
function MessageBlockFields({ data, updateFields, platform, renderItemEditor }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const [openId, setOpenId] = useState(data._errorItemId || items[0]?.id || null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Save / validation pointed at one element → open exactly that one.
  useEffect(() => {
    if (data._errorItemId) setOpenId(data._errorItemId);
  }, [data._errorItemId]);
  const hasEnding = items.some((i) => BLOCK_ENDING_TYPES.includes(i.type));
  const setItems = (next) => updateFields({ items: next });

  const add = (type) => {
    const item = newBlockItem(type);
    const endIdx = items.findIndex((i) => BLOCK_ENDING_TYPES.includes(i.type));
    // Content goes before the ending element; the ending element always closes the block.
    const next = BLOCK_ENDING_TYPES.includes(type) || endIdx < 0
      ? [...items, item]
      : [...items.slice(0, endIdx), item, ...items.slice(endIdx)];
    setItems(next);
    setOpenId(item.id);
    setMenuOpen(false);
  };

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    if (BLOCK_ENDING_TYPES.includes(items[idx].type) || BLOCK_ENDING_TYPES.includes(items[j].type)) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
  };

  const groups = [
    ['Content', BLOCK_CONTENT_TYPES, false],
    ['Wait for a reply (closes the block)', BLOCK_ENDING_TYPES, hasEnding],
  ];

  return (
    <div className="fb-field">
      <label>Elements</label>
      <span className="fb-hint">Sent one after another, in this order. Buttons can sit on any text or image. Quick replies and lists wait for the contact&apos;s reply, so they always come last.</span>
      {items.map((item, idx) => {
        const Icon = NODE_ICONS[item.type];
        const open = openId === item.id;
        const ending = BLOCK_ENDING_TYPES.includes(item.type);
        const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 };
        return (
          <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 8, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }} onClick={() => setOpenId(open ? null : item.id)}>
              <Icon size={14} style={{ color: NODE_COLORS[item.type], flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{BLOCK_ITEM_LABELS[item.type]}</span>
              {!ending && (
                <>
                  <button type="button" title="Move up" style={iconBtn} onClick={(e) => { e.stopPropagation(); move(idx, -1); }}><ChevronRight size={14} style={{ transform: 'rotate(-90deg)' }} /></button>
                  <button type="button" title="Move down" style={iconBtn} onClick={(e) => { e.stopPropagation(); move(idx, 1); }}><ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} /></button>
                </>
              )}
              <button type="button" title="Remove element" style={iconBtn} onClick={(e) => { e.stopPropagation(); setItems(items.filter((x) => x.id !== item.id)); }}><Trash2 size={14} /></button>
            </div>
            {open && (
              <div style={{ padding: '4px 10px 10px', borderTop: '1px solid #f1f5f9' }}>
                {item.type === 'quickReplies' && (
                  <span className="fb-hint" style={{ display: 'block', margin: '6px 0' }}>Leave the message empty to attach these replies to the text just above.</span>
                )}
                {renderItemEditor(item, (d) => setItems(items.map((x) => (x.id === item.id ? { ...x, data: d } : x))))}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ position: 'relative', marginTop: 8 }}>
        <button type="button" className="fb-add-btn" onClick={() => setMenuOpen((v) => !v)}>
          <Plus size={13} /> Add Element
        </button>
        {menuOpen && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 20, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', padding: 6 }}>
            {groups.map(([title, types, disabled]) => {
              const shown = types.filter((t) => isNodeSupportedOnPlatform(t, platform));
              if (shown.length === 0) return null;
              return (
                <div key={title}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 8px 2px' }}>{title}</div>
                  {disabled && <div style={{ fontSize: 11, color: '#94a3b8', padding: '2px 8px 4px' }}>This block already ends with one.</div>}
                  {shown.map((type) => {
                    const Icon = NODE_ICONS[type];
                    return (
                      <button key={type} type="button" disabled={disabled} onClick={() => add(type)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontSize: 12.5, color: '#1e293b', textAlign: 'left' }}
                        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                        <Icon size={13} style={{ color: NODE_COLORS[type] }} /> {BLOCK_ITEM_LABELS[type]}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Start Automation properties ─────────────────────────────── */
function StartAutomationFields({ data, updateFields, flows, currentFlowId, platform }) {
  const [open, setOpen] = useState(false);
  const target = flows.find((f) => f.id === data.flowId);
  const name = target?.name || data.flowName;
  return (
    <div className="fb-field">
      <label>Automation</label>
      <button type="button" className="fb-add-btn" style={{ justifyContent: 'space-between', width: '100%' }} onClick={() => setOpen(true)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Choose an automation...'}</span>
        <ChevronRight size={14} />
      </button>
      <span className="fb-hint">
        Ends this flow and starts the chosen one for this contact, from its beginning. Custom field values already collected carry over.
      </span>
      {open && (
        <AutomationPickerModal
          flows={flows}
          currentFlowId={currentFlowId}
          platform={platform}
          selectedId={data.flowId}
          onClose={() => setOpen(false)}
          onSelect={(f) => { updateFields({ flowId: f.id, flowName: f.name }); setOpen(false); }}
        />
      )}
    </div>
  );
}

/* ── Actions properties (ManyChat-style action list) ─────────── */
function ActionsFields({ data, updateFields, sequences, customFields }) {
  const labels = useAvailableLabels();
  const [menuOpen, setMenuOpen] = useState(false);
  const list = Array.isArray(data.actions) ? data.actions : [];
  const setList = (next) => updateFields({ actions: next });
  const patch = (aid, changes) => setList(list.map((a) => (a.id === aid ? { ...a, ...changes } : a)));

  const addAction = (type) => {
    setList([...list, { id: `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type }]);
    setMenuOpen(false);
  };

  const groups = Object.entries(ACTION_TYPES).reduce((acc, [type, t]) => {
    (acc[t.group] = acc[t.group] || []).push([type, t]);
    return acc;
  }, {});

  return (
    <div className="fb-field">
      <label>Actions</label>
      {list.length === 0 && <span className="fb-hint">Runs silently when a contact reaches this step, then continues to the next one.</span>}
      {list.map((a) => {
        const t = ACTION_TYPES[a.type];
        if (!t) return null;
        const Icon = t.icon;
        return (
          <div key={a.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon size={14} style={{ color: '#475569' }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{t.label}</span>
              <button type="button" title="Remove action" onClick={() => setList(list.filter((x) => x.id !== a.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}>
                <Trash2 size={14} />
              </button>
            </div>
            {t.target === 'label' && (
              <select value={a.labelId || ''} onChange={(e) => {
                const l = labels.find((x) => x.id === Number(e.target.value));
                patch(a.id, { labelId: l?.id || null, labelName: l?.name || '' });
              }}>
                <option value="">Select a label...</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {t.target === 'sequence' && (
              <select value={a.sequenceId || ''} onChange={(e) => {
                const s = sequences.find((x) => x.id === Number(e.target.value));
                patch(a.id, { sequenceId: s?.id || null, sequenceName: s?.name || '' });
              }}>
                <option value="">Select a Sequence...</option>
                {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {t.target === 'field' && (
              <>
                <select value={a.fieldId || ''} onChange={(e) => {
                  const f = customFields.find((x) => x.id === Number(e.target.value));
                  patch(a.id, { fieldId: f?.id || null, fieldName: f?.name || '' });
                }}>
                  <option value="">Select a Custom Field...</option>
                  {customFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {t.hasValue && (
                  <input style={{ marginTop: 6 }} value={a.value ?? ''} onChange={(e) => patch(a.id, { value: e.target.value })}
                    placeholder="Value (variables like {{name}} work)" />
                )}
              </>
            )}
          </div>
        );
      })}
      <div style={{ position: 'relative' }}>
        <button type="button" className="fb-add-btn" onClick={() => setMenuOpen((v) => !v)}>
          <Plus size={13} /> Add Action
        </button>
        {menuOpen && (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 20, background: '#ffffff',
            border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', padding: 6,
          }}>
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 8px 2px' }}>{group}</div>
                {items.map(([type, t]) => (
                  <button key={type} type="button" onClick={() => addAction(type)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: '#1e293b', textAlign: 'left' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                    <t.icon size={13} style={{ color: '#64748b' }} /> {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared: custom dropdown (single or multi select) ───────────────────
   Trigger button + floating menu, rendered in a portal so it isn't clipped by
   a scrolling modal/panel. options: [{ value, label, dot? }]. Neutral
   grey/black styling. multi: `value` is an array, menu stays open per click. */
function DropdownSelect({ options, value, onChange, placeholder = 'Select...', multi = false, emptyText = 'Nothing to choose from yet.' }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const openMenu = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = multi ? (Array.isArray(value) ? value : []) : (value == null || value === '' ? [] : [value]);
  const chosen = options.filter((o) => selected.includes(o.value));
  const pick = (v) => {
    if (multi) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      onChange(v);
      setOpen(false);
    }
  };
  const openUp = rect && rect.bottom + 260 > window.innerHeight && rect.top > 260;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '5px 10px',
          background: '#ffffff', border: `1px solid ${open ? '#64748b' : '#cbd5e1'}`, borderRadius: 8,
          cursor: 'pointer', textAlign: 'left', fontSize: 12.5, color: '#1e293b',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {chosen.length === 0 ? (
            <span style={{ color: '#94a3b8' }}>{placeholder}</span>
          ) : multi ? chosen.map((o) => (
            <span key={o.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 11.5, fontWeight: 600 }}>
              {o.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: o.dot }} />}
              {o.label}
            </span>
          )) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chosen[0].label}</span>
          )}
        </span>
        <ChevronRight size={14} style={{ color: '#64748b', transform: `rotate(${open ? -90 : 90}deg)`, flexShrink: 0 }} />
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          className="nodrag nopan"
          style={{
            position: 'fixed', left: rect.left, width: rect.width, zIndex: 10001,
            ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            maxHeight: 250, overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0',
            borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 4,
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: '10px 10px', fontSize: 12, color: '#94a3b8' }}>{emptyText}</div>
          ) : options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: on ? '#f1f5f9' : 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: '#1e293b', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = on ? '#f1f5f9' : 'none'; }}
              >
                {multi && (
                  <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? '#0f172a' : '#cbd5e1'}`, background: on ? '#0f172a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {on && <Check size={10} color="#fff" strokeWidth={3} />}
                  </span>
                )}
                {o.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.dot, flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {!multi && on && <Check size={14} color="#0f172a" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

/* ── Shared: contact-label tag picker ("Tag with Label") ──────────────
   Same pill-toggle pattern UserInputFlowStartProperties already uses for its
   "Tag Subscriber With Label" field, pulled out so ButtonActionEditor
   (buttons/list items) and StartNodeProperties (a normal Flow's Start node)
   can reuse it too instead of re-fetching/re-rendering their own copy. */
function useAvailableLabels() {
  const [labels, setLabels] = useState([]);
  useEffect(() => {
    labelAPI.getAll().then((r) => setLabels(r.data?.labels || [])).catch(() => {});
  }, []);
  return labels;
}

function LabelTagPicker({ labels, selectedIds, onToggle, hint }) {
  if (labels.length === 0) {
    return <span className="fb-hint">No labels created yet — add them from the Inbox or Contacts page.</span>;
  }
  return (
    <>
      <DropdownSelect
        multi
        placeholder="Select labels..."
        options={labels.map((l) => ({ value: l.id, label: l.name, dot: l.color || '#64748b' }))}
        value={selectedIds}
        onChange={(next) => {
          // Callers expose a per-label toggle, so apply whichever id was added/removed.
          const changed = next.length > selectedIds.length
            ? next.find((id) => !selectedIds.includes(id))
            : selectedIds.find((id) => !next.includes(id));
          if (changed !== undefined) onToggle(changed);
        }}
      />
      {hint && <span className="fb-hint">{hint}</span>}
    </>
  );
}

/* ── Shared: per-node "Delay before this step" (hours/minutes/seconds) ──
   Every node type can optionally hold off before it runs. Scheduled (via
   flow_sessions.delay_next_run_at + utils/flowDelayScheduler.js on the
   backend), never a blocking sleep — see flowEngine.js. */
function DelaySettings({ value, onChange }) {
  const v = value && typeof value === 'object' ? value : { hours: 0, minutes: 0, seconds: 0 };
  const set = (unit, raw) => {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    onChange({ ...v, [unit]: n });
  };
  return (
    <div className="fb-field">
      <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Timer size={12} /> Delay before this step (optional)
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['hours', 'Hrs'], ['minutes', 'Min'], ['seconds', 'Sec']].map(([unit, label]) => (
          <div key={unit} style={{ flex: 1 }}>
            <input
              type="number"
              min={0}
              value={v[unit] || 0}
              onChange={(e) => set(unit, e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, textAlign: 'center' }}
            />
            <span style={{ fontSize: 9, color: '#94a3b8', display: 'block', textAlign: 'center', marginTop: 2 }}>{label}</span>
          </div>
        ))}
      </div>
      <span className="fb-hint">Holds this step back for the given time before it runs — the contact sees nothing until then. Works for waits up to 48 hours.</span>
    </div>
  );
}

// Formats a {hours,minutes,seconds} delay as a short badge string, e.g. "1h 30m" —
// omits zero units, returns null when there's nothing to show (used by every
// node card that carries an optional delay).
/* "Delay 5s" row shown on any card whose step has a delay before it — the same look
   as the Delay element inside a Message Block. Renders nothing when no delay is set. */
function DelayPill({ data, style, always = false }) {
  const d = data?.delay;
  const label = formatDelayBadge(d) ? formatDelayLong(d.hours, d.minutes, d.seconds) : (always ? formatDelayLong(0, 0, data?.seconds) : null);
  if (!label) return null;
  return (
    <div
      title={`Waits ${label} before continuing`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', marginBottom: 10,
        borderRadius: 12, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#475569',
        ...style,
      }}
    >
      <Clock size={14} style={{ color: NODE_COLORS.delay }} /> Delay {label}
    </div>
  );
}

/* "1 hr 30 min" / "5 min" / "3 sec" — one wording for every Delay display. */
function formatDelayLong(hours = 0, minutes = 0, seconds = 0) {
  const total = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  if (total <= 0) return '0 sec';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return [h && `${h} hr`, m && `${m} min`, sec && `${sec} sec`].filter(Boolean).join(' ');
}

function formatDelayBadge(delay) {
  if (!delay || typeof delay !== 'object') return null;
  const { hours = 0, minutes = 0, seconds = 0 } = delay;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);
  return parts.length ? parts.join(' ') : null;
}

/* ── User Input Flow: Start node settings ───────────────────────────
   A User Input Flow's Start node has no trigger (a bot Flow's "Run User Input
   Flow" node invokes it). Instead it carries the settings that apply to the
   whole form: its name, the channel it's locked to, an optional label to tag
   the subscriber with, and where completed submissions get exported to. */
function UserInputFlowStartProperties({ data, updateField, platform, flowName, onFlowNameChange }) {
  const [labels, setLabels] = useState([]);
  const [sheetStatus, setSheetStatus] = useState(null);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [testingHook, setTestingHook] = useState(false);
  const [hookResult, setHookResult] = useState(null);

  useEffect(() => {
    labelAPI.getAll().then((r) => setLabels(r.data?.labels || [])).catch(() => {});
    googleSheetsAPI.getStatus().then((r) => setSheetStatus(r.data)).catch(() => setSheetStatus({ connected: false }));
  }, []);

  // Only pull the spreadsheet list once we know an account is actually connected.
  useEffect(() => {
    if (!sheetStatus?.connected) return;
    setLoadingSheets(true);
    googleSheetsAPI.listSpreadsheets()
      .then((r) => setSpreadsheets(r.data?.spreadsheets || []))
      .catch(() => setSpreadsheets([]))
      .finally(() => setLoadingSheets(false));
  }, [sheetStatus?.connected]);

  useEffect(() => {
    if (!data.googleSheetId || !sheetStatus?.connected) { setTabs([]); return; }
    googleSheetsAPI.listTabs(data.googleSheetId)
      .then((r) => setTabs(r.data?.tabs || []))
      .catch(() => setTabs([]));
  }, [data.googleSheetId, sheetStatus?.connected]);

  const selectedLabelIds = Array.isArray(data.labelIds) ? data.labelIds : [];
  const toggleLabel = (labelId) => {
    updateField('labelIds', selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((l) => l !== labelId)
      : [...selectedLabelIds, labelId]);
  };

  const testWebhook = async () => {
    if (!data.webhookUrl) return;
    setTestingHook(true);
    setHookResult(null);
    try {
      // Sent straight from the browser purely as a reachability check — the real
      // export is sent server-side when a subscriber completes the form.
      await fetch(data.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, source: 'User Input Flow test', sentAt: new Date().toISOString() }),
      });
      setHookResult('sent');
    } catch {
      setHookResult('failed');
    } finally {
      setTestingHook(false);
    }
  };

  const meta = getPlatformMeta(platform);

  return (
    <>
      <div className="fb-field">
        <label>Form Name</label>
        <input
          value={flowName || ''}
          onChange={(e) => onFlowNameChange?.(e.target.value)}
          placeholder="e.g. Lead Capture Form"
        />
        <span className="fb-hint">How this form is listed, and what it's called on a subscriber's saved submissions.</span>
      </div>

      <div className="fb-field">
        <label>Channel</label>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', fontSize: 12, fontWeight: 600, color: '#334155',
        }}>
          <PlatformIcon platform={platform} size={15} />
          <span>{meta.label}</span>
        </div>
        <span className="fb-hint">
          Locked to the channel this form was created for — it can only be reused by other automations on {meta.label}.
        </span>
      </div>

      <div className="fb-field">
        <label>Tag Subscriber With Label (optional)</label>
        {labels.length === 0 ? (
          <span className="fb-hint">No labels created yet — add them from the Inbox or Contacts page.</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {labels.map((l) => {
              const on = selectedLabelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                    fontSize: 11, fontWeight: 700,
                    border: `1.5px solid ${on ? (l.color || '#4f46e5') : '#e2e8f0'}`,
                    background: on ? `${l.color || '#4f46e5'}18` : '#fff',
                    color: on ? (l.color || '#4f46e5') : '#64748b',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color || '#4f46e5' }} />
                  {l.name}
                </button>
              );
            })}
          </div>
        )}
        <span className="fb-hint">Applied to the subscriber the moment they start this form.</span>
      </div>

      <div className="fb-field">
        <label>Send Responses To Webhook (optional)</label>
        <input
          value={data.webhookUrl || ''}
          onChange={(e) => { updateField('webhookUrl', e.target.value); setHookResult(null); }}
          placeholder="https://your-server.com/hook"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className="fb-add-btn"
            disabled={!data.webhookUrl || testingHook}
            onClick={testWebhook}
          >
            {testingHook ? 'Sending...' : 'Send test'}
          </button>
          {hookResult === 'sent' && <span className="fb-hint" style={{ color: '#16a34a' }}>Test sent — check your endpoint.</span>}
          {hookResult === 'failed' && <span className="fb-hint" style={{ color: '#ef4444' }}>Couldn't reach that URL from the browser.</span>}
        </div>
        <span className="fb-hint">Every completed submission is POSTed here as JSON.</span>
      </div>

      <div className="fb-field">
        <label>Send Responses To Google Sheet (optional)</label>
        {!sheetStatus ? (
          <span className="fb-hint">Checking connection...</span>
        ) : !sheetStatus.connected ? (
          <div style={{
            padding: '10px 12px', borderRadius: 8, border: '1px dashed #cbd5e1',
            background: '#f8fafc', fontSize: 11.5, color: '#64748b', lineHeight: 1.5,
          }}>
            No Google account connected yet.{' '}
            <a href="/settings/google-sheets" style={{ color: '#4f46e5', fontWeight: 700 }}>
              Connect one in Settings
            </a>{' '}
            to pick a spreadsheet here.
          </div>
        ) : (
          <>
            <select
              value={data.googleSheetId || ''}
              onChange={(e) => { updateField('googleSheetId', e.target.value || null); updateField('googleSheetTab', null); }}
              disabled={loadingSheets}
            >
              <option value="">{loadingSheets ? 'Loading your sheets...' : "Don't send to a sheet"}</option>
              {spreadsheets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {data.googleSheetId && (
              <select
                value={data.googleSheetTab || ''}
                onChange={(e) => updateField('googleSheetTab', e.target.value || null)}
                style={{ marginTop: 6 }}
              >
                <option value="">Select a tab...</option>
                {tabs.map((t) => (
                  <option key={t.id} value={t.title}>{t.title}</option>
                ))}
              </select>
            )}
            <span className="fb-hint">
              Connected as {sheetStatus.email || 'your Google account'}. Each submission is appended as a
              new row: timestamp, subscriber, then one column per answer.
            </span>
          </>
        )}
      </div>
    </>
  );
}

function PropertiesPanel({ node, onClose, onUpdate, onDelete, platform, customFields = [], onCustomFieldCreated, userInputFlows = [], onUserInputFlowCreated, isUserInputFlow = false, sequences = [], onSequenceCreated, isSequence = false, isBroadcastFlow = false, isChatWidgetFlow = false, linkedWidget = null, widgetAppearanceForm = null, onWidgetAppearanceChange = null, onAddReplyNode = null, flows = [], httpApiCampaigns = [], currentFlowId = null, flowName, onFlowNameChange, onDrillIn, onAttachSequence, attachedSequenceNode, onSelectSequenceNode, embedded = false }) {
  if (!node) return null;

  const { data, type } = node;

  const updateField = (field, value) => {
    onUpdate(node.id, { ...data, [field]: value });
  };

  // For setting more than one field at once. updateField always spreads the
  // CURRENT `data` prop, which doesn't change until this component re-renders —
  // so two separate updateField(...) calls back to back (e.g. userInputFlowId
  // then userInputFlowName) each spread the same stale `data`, and the second
  // call's onUpdate full-replaces the node's data, silently discarding whatever
  // the first call just set. This merges both changes into one onUpdate instead.
  const updateFields = (partial) => {
    onUpdate(node.id, { ...data, ...partial });
  };

  const renderFields = () => {
    switch (type) {
      case 'start':
        // A Chat Widget flow's Start node configures the website floating chat widget
        // (appearance, branding, colors, logo, greeting, prefill message, offsets, domains)
        if (isChatWidgetFlow || linkedWidget || data.chatWidgetStart) {
          const effectiveForm = widgetAppearanceForm || {
            name: data.widgetName || flowName || 'Chat Widget',
            displayName: data.displayName || data.widgetName || flowName || 'Support Chat',
            greetingMessage: data.greetingMessage || '',
            buttonText: data.buttonText || 'Chat with us',
            buttonBgColor: data.buttonBgColor || (platform === 'WHATSAPP' ? '#25D366' : '#6366f1'),
            targetPlatform: data.targetPlatform || platform,
            inputPlaceholder: data.inputPlaceholder || 'Type a message…',
            allowedDomains: data.allowedDomains || '',
            prefillMessage: data.prefillMessage || '',
          };
          return (
            <ChatWidgetStartNodeProperties
              form={effectiveForm}
              onChange={(updated) => {
                onWidgetAppearanceChange?.(updated);
                onUpdate(node.id, {
                  ...data,
                  chatWidgetStart: true,
                  widgetName: updated.name,
                  displayName: updated.displayName,
                  buttonText: updated.buttonText,
                  buttonBgColor: updated.buttonBgColor,
                  greetingMessage: updated.greetingMessage,
                  prefillMessage: updated.prefillMessage,
                  targetPlatform: updated.targetPlatform,
                });
              }}
              platform={platform}
              flowName={flowName}
              onFlowNameChange={onFlowNameChange}
              widgetKey={linkedWidget?.widget_key}
              onAddReplyNode={onAddReplyNode}
            />
          );
        }
        // A Broadcast campaign's / User Input Flow's / Sequence's Start node
        // configures the campaign/form/sequence itself, not a trigger — none
        // of the three is ever keyword-triggered.
        if (isBroadcastFlow) {
          return (
            <BroadcastStartNodeProperties
              flowId={currentFlowId}
              flowName={flowName}
              onFlowNameChange={onFlowNameChange}
              platform={platform}
            />
          );
        }
        if (isSequence) {
          return (
            <div className="fb-field">
              <label>Sequence Name</label>
              <input
                value={flowName || ''}
                onChange={(e) => onFlowNameChange?.(e.target.value)}
                placeholder="e.g. Welcome Series"
              />
              <span className="fb-hint">
                Locked to {(platform || 'WEBCHAT')} — enrolled via a "Start Sequence" action elsewhere in a Flow.
                Steps run in a single straight line; add a Wait node between messages to space them out.
              </span>
            </div>
          );
        }
        return isUserInputFlow ? (
          <UserInputFlowStartProperties
            data={data}
            updateField={updateField}
            platform={platform}
            flowName={flowName}
            onFlowNameChange={onFlowNameChange}
          />
        ) : (
          <StartNodeProperties
            data={data}
            onUpdateNode={(newData) => onUpdate(node.id, newData)}
            sequences={sequences}
            onSequenceCreated={(seq) => onSequenceCreated?.(seq)}
            platform={platform}
            onAttachSequence={(sequenceId, sequenceName) => onAttachSequence?.(node.id, sequenceId, sequenceName)}
            attachedSequenceNode={attachedSequenceNode}
            onSelectSequenceNode={onSelectSequenceNode}
          />
        );

      case 'text': {
        const textBtnList = data.buttons || [];
        const handleAddTextButton = () => {
          if (textBtnList.length >= 3) return;
          const newBtn = {
            title: `Button ${textBtnList.length + 1}`,
            action: 'flow',
            url: '',
            phone: '',
            reply_text: '',
          };
          updateField('buttons', [...textBtnList, newBtn]);
        };
        const handleUpdateTextButton = (index, value) => {
          const updated = [...textBtnList];
          updated[index] = value;
          updateField('buttons', updated);
        };
        const handleRemoveTextButton = (index) => {
          const updated = textBtnList.filter((_, idx) => idx !== index);
          updateField('buttons', updated);
        };

        return (
          <>
            <div className="fb-field">
              <label>Message</label>
              <textarea
                value={data.message || ''}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="Enter your text message..."
              />
            </div>
            <div className="fb-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Buttons ({textBtnList.length}/3)</label>
                <span style={{ fontSize: 10, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                  Optional
                </span>
              </div>

              {textBtnList.map((btn, i) => (
                <ButtonActionEditor
                  key={i}
                  btn={btn}
                  index={i}
                  platform={platform}
                  flows={flows}
                  currentFlowId={currentFlowId}
                  sequences={sequences}
                  onSequenceCreated={onSequenceCreated}
                  onChange={(val) => handleUpdateTextButton(i, val)}
                  onRemove={() => handleRemoveTextButton(i)}
                />
              ))}

              {textBtnList.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddTextButton}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px dashed #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#94a3b8';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <Plus size={14} /> Add Button
                </button>
              )}
            </div>
          </>
        );
      }

      case 'interactive': {
        const interactiveBtnList = data.buttons || [];
        const handleAddInteractiveButton = () => {
          if (interactiveBtnList.length >= 3) return;
          const newBtn = {
            title: `Reply ${interactiveBtnList.length + 1}`,
            action: 'flow',
            url: '',
            phone: '',
            reply_text: '',
          };
          updateField('buttons', [...interactiveBtnList, newBtn]);
        };
        const handleUpdateInteractiveButton = (index, value) => {
          const updated = [...interactiveBtnList];
          updated[index] = value;
          updateField('buttons', updated);
        };
        const handleRemoveInteractiveButton = (index) => {
          const updated = interactiveBtnList.filter((_, idx) => idx !== index);
          updateField('buttons', updated);
        };

        return (
          <>
            {/* Header section (Optional: Text, Image, Video, Document) */}
            <div className="fb-field">
              <label>Header Type</label>
              <select
                value={data.headerType || 'none'}
                onChange={(e) => updateField('headerType', e.target.value)}
              >
                <option value="none">None</option>
                <option value="text">Text Header</option>
                <option value="image">Image Header</option>
                <option value="video">Video Header</option>
                <option value="document">Document Header (PDF)</option>
              </select>
            </div>

            {data.headerType === 'text' && (
              <div className="fb-field">
                <label>Header Text (max 60 chars)</label>
                <input
                  type="text"
                  maxLength={60}
                  value={data.headerText || ''}
                  onChange={(e) => updateField('headerText', e.target.value)}
                  placeholder="e.g. Special Offer!"
                />
              </div>
            )}

            {data.headerType === 'image' && (
              <ImageUploadField
                label="Header Image"
                value={data.headerMediaUrl || ''}
                onChange={(val) => updateField('headerMediaUrl', val)}
              />
            )}

            {data.headerType === 'video' && (
              <MediaUploadField
                label="Header Video"
                accept="video/*"
                value={data.headerMediaUrl || ''}
                onChange={(val) => updateField('headerMediaUrl', val)}
              />
            )}

            {data.headerType === 'document' && (
              <MediaUploadField
                label="Header Document (PDF)"
                accept=".pdf,.doc,.docx"
                value={data.headerMediaUrl || ''}
                onChange={(val) => updateField('headerMediaUrl', val)}
              />
            )}

            {/* Body Message (Required) */}
            <div className="fb-field">
              <label>Body Message (Required, max 1024 chars)</label>
              <textarea
                rows={4}
                maxLength={1024}
                value={data.message || ''}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="Enter the main message body for this WhatsApp interactive message..."
              />
            </div>

            {/* Footer Text (Optional) */}
            <div className="fb-field">
              <label>Footer Text (Optional, max 60 chars)</label>
              <input
                type="text"
                maxLength={60}
                value={data.footerText || ''}
                onChange={(e) => updateField('footerText', e.target.value)}
                placeholder="e.g. Reply STOP to unsubscribe"
              />
            </div>

            {/* Interactive Reply Buttons (Up to 3) */}
            <div className="fb-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Reply Buttons ({interactiveBtnList.length}/3)</label>
                <span style={{ fontSize: 10, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                  WhatsApp Interactive
                </span>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px 0', lineHeight: 1.3 }}>
                WhatsApp supports up to 3 quick reply or CTA buttons on interactive messages.
              </p>

              {interactiveBtnList.map((btn, i) => (
                <ButtonActionEditor
                  key={i}
                  btn={btn}
                  index={i}
                  platform="WHATSAPP"
                  flows={flows}
                  currentFlowId={currentFlowId}
                  sequences={sequences}
                  onSequenceCreated={onSequenceCreated}
                  onChange={(val) => handleUpdateInteractiveButton(i, val)}
                  onRemove={() => handleRemoveInteractiveButton(i)}
                />
              ))}

              {interactiveBtnList.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddInteractiveButton}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px dashed #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#94a3b8';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <Plus size={14} /> + Add Reply Button
                </button>
              )}
            </div>
          </>
        );
      }

      case 'image': {
        const imageButtons = data.buttons || [];
        const handleAddImageButton = () => {
          if (imageButtons.length >= 3) return;
          const newBtn = {
            title: `Button ${imageButtons.length + 1}`,
            action: 'flow',
            url: '',
            phone: '',
            reply_text: '',
          };
          updateField('buttons', [...imageButtons, newBtn]);
        };
        const handleUpdateImageButton = (index, value) => {
          const updated = [...imageButtons];
          updated[index] = value;
          updateField('buttons', updated);
        };
        const handleRemoveImageButton = (index) => {
          const updated = imageButtons.filter((_, idx) => idx !== index);
          updateField('buttons', updated);
        };

        return (
          <>
            <ImageUploadField
              label="Image File or URL"
              value={data.imageUrl || data.mediaUrl || ''}
              onChange={(val) => {
                updateField('imageUrl', val);
                updateField('mediaUrl', val);
              }}
            />
            <div className="fb-field">
              <label>Caption (Optional)</label>
              <textarea
                value={data.caption || data.message || ''}
                onChange={(e) => {
                  updateField('caption', e.target.value);
                  updateField('message', e.target.value);
                }}
                placeholder="Caption text shown below image..."
                rows={2}
              />
            </div>
            <div className="fb-field" style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Interactive Buttons ({imageButtons.length}/3)</label>
                <span style={{ fontSize: 10, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                  Channel Aware
                </span>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px 0', lineHeight: 1.3 }}>
                Attach up to 3 interactive buttons. Configure click actions (flow step, URL, or phone call).
              </p>

              {imageButtons.map((btn, i) => (
                <ButtonActionEditor
                  key={i}
                  btn={btn}
                  index={i}
                  platform={platform}
                  flows={flows}
                  currentFlowId={currentFlowId}
                  sequences={sequences}
                  onSequenceCreated={onSequenceCreated}
                  onChange={(val) => handleUpdateImageButton(i, val)}
                  onRemove={() => handleRemoveImageButton(i)}
                />
              ))}

              {imageButtons.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddImageButton}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px dashed #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#94a3b8';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <Plus size={14} /> Add Button
                </button>
              )}
            </div>
          </>
        );
      }

      case 'video':
        return (
          <>
            <MediaUploadField
              label="Video File or URL"
              accept="video/*"
              value={data.mediaUrl || data.url || ''}
              onChange={(val) => updateField('mediaUrl', val)}
            />
            <div className="fb-field">
              <label>Caption (Optional)</label>
              <textarea
                value={data.caption || data.message || ''}
                onChange={(e) => updateField('caption', e.target.value)}
                placeholder="Caption text..."
                rows={2}
              />
            </div>
          </>
        );

      case 'audio':
        return (
          <MediaUploadField
            label="Audio File or URL"
            accept="audio/*"
            value={data.mediaUrl || data.url || ''}
            onChange={(val) => updateField('mediaUrl', val)}
          />
        );

      case 'file':
        return (
          <>
            <MediaUploadField
              label="Document / Attachment"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
              value={data.mediaUrl || data.url || ''}
              onChange={(val) => updateField('mediaUrl', val)}
            />
            <div className="fb-field">
              <label>Filename / Title</label>
              <input
                value={data.filename || ''}
                onChange={(e) => updateField('filename', e.target.value)}
                placeholder="e.g. Product_Brochure.pdf"
              />
            </div>
          </>
        );

      case 'buttons': {
        const btnList = data.buttons || [];
        const handleAddButton = () => {
          if (btnList.length >= 3) return;
          const newBtn = {
            title: `Button ${btnList.length + 1}`,
            action: 'flow',
            url: '',
            phone: '',
            reply_text: '',
          };
          updateField('buttons', [...btnList, newBtn]);
        };
        const handleUpdateButton = (index, value) => {
          const updated = [...btnList];
          updated[index] = value;
          updateField('buttons', updated);
        };
        const handleRemoveButton = (index) => {
          const updated = btnList.filter((_, idx) => idx !== index);
          updateField('buttons', updated);
        };

        return (
          <>
            <div className="fb-field">
              <label>Message</label>
              <textarea
                value={data.message || ''}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="Message shown above buttons..."
              />
            </div>
            <div className="fb-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label>Buttons ({btnList.length}/3)</label>
                <span style={{ fontSize: 10, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                  Channel Actions
                </span>
              </div>

              {btnList.map((btn, i) => (
                <ButtonActionEditor
                  key={i}
                  btn={btn}
                  index={i}
                  platform={platform}
                  flows={flows}
                  currentFlowId={currentFlowId}
                  sequences={sequences}
                  onSequenceCreated={onSequenceCreated}
                  onChange={(val) => handleUpdateButton(i, val)}
                  onRemove={() => handleRemoveButton(i)}
                />
              ))}

              {btnList.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddButton}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px dashed #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#94a3b8';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <Plus size={14} /> Add Button
                </button>
              )}
            </div>
          </>
        );
      }

      case 'quickReplies':
        return (
          <>
            <div className="fb-field">
              <label>Message</label>
              <textarea
                value={data.message || ''}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="Message shown with quick replies..."
              />
            </div>
            <div className="fb-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label>Quick Replies</label>
                <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>
                  {(data.replies || []).length} replies
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#475569', marginBottom: 8, lineHeight: 1.45, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 10px', borderRadius: '8px' }}>
                <strong>📌 Meta Platform Rule:</strong> Quick replies pause and wait for the user to tap an option. Immediate automatic follow-up replies are prohibited because Meta instantly dismisses quick replies if another message is sent. Connect your responses directly to each individual option handle on the right.
              </div>
              {(data.replies || []).map((reply, i) => (
                <div key={i} className="fb-list-item">
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, background: '#f1f5f9',
                    color: '#0f172a', border: '1px solid #e2e8f0', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {i + 1}
                  </div>
                  <input
                    value={reply}
                    onChange={(e) => {
                      const updated = [...(data.replies || [])];
                      updated[i] = e.target.value;
                      updateField('replies', updated);
                    }}
                    placeholder={`Reply ${i + 1}`}
                  />
                  <button
                    className="fb-list-item-del"
                    onClick={() => {
                      const updated = (data.replies || []).filter((_, idx) => idx !== i);
                      updateField('replies', updated);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="fb-add-btn"
                onClick={() => updateField('replies', [...(data.replies || []), ''])}
              >
                <Plus size={14} /> Add Reply
              </button>
            </div>
          </>
        );

      case 'listMenu': {
        const listCap = getNodeItemCap('listMenu', platform) || 10;
        const lists = normalizeListMenuData(data);
        const updateLists = (next) => updateField('lists', next);
        const updateList = (li, patch) => {
          const next = lists.map((l, idx) => (idx === li ? { ...l, ...patch } : l));
          updateLists(next);
        };
        const updateSection = (li, si, patch) => {
          const list = lists[li];
          const nextSections = list.sections.map((s, idx) => (idx === si ? { ...s, ...patch } : s));
          updateList(li, { sections: nextSections });
        };
        return (
          <>
            {lists.map((list, li) => {
              const totalItems = list.items.length;
              return (
                <div key={li} className="fb-field" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ margin: 0 }}>List {li + 1} Title</label>
                    {lists.length > 1 && (
                      <button className="fb-list-item-del" onClick={() => updateLists(lists.filter((_, idx) => idx !== li))}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    value={list.title || ''}
                    onChange={(e) => updateList(li, { title: e.target.value })}
                    placeholder="Menu title..."
                    style={{ marginBottom: 8 }}
                  />
                  <label>Button Text</label>
                  <input
                    value={list.buttonText || ''}
                    onChange={(e) => updateList(li, { buttonText: e.target.value })}
                    placeholder="e.g. Options"
                    style={{ marginBottom: 8 }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>Items</label>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{totalItems}/{listCap} total</span>
                  </div>

                  {/* Sections group items under their own heading, all still
                      within this ONE message — WhatsApp's own native grouping.
                      A list with just one (untitled) section renders exactly
                      like a plain flat list, so nothing changes for anyone who
                      doesn't need this. */}
                  {list.sections.map((section, si) => (
                    <div key={si} style={{ border: '1px dashed #cbd5e1', borderRadius: 8, padding: 8, marginBottom: 8, background: '#fafbfc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <input
                          value={section.title || ''}
                          onChange={(e) => updateSection(li, si, { title: e.target.value })}
                          placeholder={list.sections.length > 1 ? `Section ${si + 1} name (e.g. "Popular")` : 'Section name (optional)'}
                          maxLength={24}
                          style={{ flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        />
                        {list.sections.length > 1 && (
                          <button
                            className="fb-list-item-del"
                            onClick={() => updateList(li, { sections: list.sections.filter((_, idx) => idx !== si) })}
                            title="Remove section"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      {section.items.map((item, ii) => (
                        <ButtonActionEditor
                          key={ii}
                          btn={item}
                          index={ii}
                          variant="item"
                          platform={platform}
                          flows={flows}
                          currentFlowId={currentFlowId}
                          sequences={sequences}
                          onSequenceCreated={onSequenceCreated}
                          onChange={(val) => {
                            const updatedItems = section.items.map((it, idx) => (idx === ii ? val : it));
                            updateSection(li, si, { items: updatedItems });
                          }}
                          onRemove={() => updateSection(li, si, { items: section.items.filter((_, idx) => idx !== ii) })}
                        />
                      ))}

                      {totalItems >= listCap ? (
                        <span className="fb-hint">Maximum {listCap} items total for this list on {(platform || 'WEBCHAT')} — add another list below for more.</span>
                      ) : (
                        <button
                          className="fb-add-btn"
                          onClick={() => updateSection(li, si, { items: [...section.items, { title: '', action: 'flow' }] })}
                        >
                          <Plus size={14} /> Add Item
                        </button>
                      )}
                    </div>
                  ))}

                  {list.sections.length < 10 && totalItems < listCap && (
                    <button
                      className="fb-add-btn"
                      style={{ background: 'transparent', border: '1.5px dashed #cbd5e1' }}
                      onClick={() => updateList(li, { sections: [...list.sections, { title: '', items: [] }] })}
                    >
                      <Plus size={14} /> Add Section
                    </button>
                  )}
                </div>
              );
            })}
            <button
              className="fb-add-btn"
              onClick={() => updateLists([...lists, { title: `Menu ${lists.length + 1}`, buttonText: 'Options', sections: [{ title: '', items: [] }] }])}
            >
              <Plus size={14} /> Add Another List
            </button>
            <span className="fb-hint">
              Each list sends as its own message, one after another. Sections group items under their own heading
              within the same message — up to 10 items total per list either way, so add another list for more.
            </span>
          </>
        );
      }

      case 'card':
        return (
          <>
            <div className="fb-field">
              <label>Title</label>
              <input
                value={data.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Card title..."
              />
            </div>
            <div className="fb-field">
              <label>Subtitle</label>
              <input
                value={data.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                placeholder="Card subtitle..."
              />
            </div>
            <ImageUploadField
              label="Card Image"
              value={data.imageUrl || ''}
              onChange={(val) => updateField('imageUrl', val)}
            />
          </>
        );

      case 'carousel':
        return (
          <>
            <div className="fb-field">
              <label>Cards ({(data.cards || []).length})</label>
              {(data.cards || []).map((card, i) => (
                <div key={i} style={{
                  padding: 10, borderRadius: 8, marginBottom: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border, rgba(255,255,255,0.06))',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Card {i + 1}</span>
                    <button
                      className="fb-list-item-del"
                      onClick={() => {
                        const updated = (data.cards || []).filter((_, idx) => idx !== i);
                        updateField('cards', updated);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <input
                    value={card.title || ''}
                    onChange={(e) => {
                      const updated = [...(data.cards || [])];
                      updated[i] = { ...updated[i], title: e.target.value };
                      updateField('cards', updated);
                    }}
                    placeholder="Title"
                    style={{
                      width: '100%', marginBottom: 6,
                      background: 'var(--bg-card)', border: '1px solid var(--border, rgba(255,255,255,0.06))',
                      borderRadius: 6, padding: '6px 10px', fontSize: 12,
                      color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                  <input
                    value={card.subtitle || ''}
                    onChange={(e) => {
                      const updated = [...(data.cards || [])];
                      updated[i] = { ...updated[i], subtitle: e.target.value };
                      updateField('cards', updated);
                    }}
                    placeholder="Subtitle"
                    style={{
                      width: '100%', marginBottom: 6,
                      background: 'var(--bg-card)', border: '1px solid var(--border, rgba(255,255,255,0.06))',
                      borderRadius: 6, padding: '6px 10px', fontSize: 12,
                      color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                  <ImageUploadField
                    label={`Card ${i + 1} Image`}
                    value={card.imageUrl || ''}
                    onChange={(val) => {
                      const updated = [...(data.cards || [])];
                      updated[i] = { ...updated[i], imageUrl: val };
                      updateField('cards', updated);
                    }}
                  />
                </div>
              ))}
              <button
                className="fb-add-btn"
                onClick={() => updateField('cards', [...(data.cards || []), { title: '', subtitle: '', imageUrl: '' }])}
              >
                <Plus size={14} /> Add Card
              </button>
            </div>
          </>
        );

      case 'question': {
        // A User Input Flow's question is identified ONLY by its Custom Field —
        // no separate "Variable Name" or "Field Label" to keep in sync with it.
        // The field's own `field_key` is the storage/template key and its `name`
        // is the display label, everywhere (Inbox, Form Submissions, webhook,
        // Google Sheet export) — one name, one place it's defined.
        const answerType = data.answerType || 'keyboard';
        const isChoice = answerType === 'choice';
        const fieldType = isChoice ? 'SELECT' : inputTypeToFieldType(data.inputType || 'name');
        const matchingFields = customFields.filter((f) => f.field_type === fieldType);
        const choiceOptions = data.options || [];
        // Buttons are the fast-tap path (renders instantly, no extra bubble);
        // beyond that cap the engine sends a list message instead (see Part A/B
        // of the send-side change in flowEngine.js) so every option stays
        // tappable rather than degrading into "type the option's name".
        const buttonCap = getNodeItemCap('buttons', platform) || 3;
        const choiceCap = getNodeItemCap('listMenu', platform) || buttonCap;
        return (
          <>
            <div className="fb-field">
              <label>Prompt Message</label>
              <textarea
                rows={2}
                value={data.message || ''}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="e.g. What's your email address?"
              />
              <span className="fb-hint">Sent to the subscriber to ask the question. Works the same on every channel.</span>
            </div>

            <div className="fb-field">
              <label>Answer Type</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { value: 'keyboard', label: 'Keyboard Input' },
                  { value: 'choice', label: 'Multiple Choice' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField('answerType', opt.value)}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${answerType === opt.value ? '#0d9488' : '#e2e8f0'}`,
                      background: answerType === opt.value ? '#f0fdfa' : '#fff',
                      color: answerType === opt.value ? '#0f766e' : '#64748b',
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="fb-hint">
                {isChoice
                  ? 'The subscriber picks from the options below (sent as real tappable buttons where the channel supports it).'
                  : 'The subscriber types their own reply.'}
              </span>
            </div>

            {isChoice ? (
              <div className="fb-field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ margin: 0 }}>Options</label>
                  <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{choiceOptions.length}/{choiceCap} option{choiceOptions.length === 1 ? '' : 's'}</span>
                </div>
                {choiceOptions.map((opt, i) => (
                  <div key={i} className="fb-list-item">
                    <input
                      value={opt}
                      onChange={(e) => {
                        const updated = [...choiceOptions];
                        updated[i] = e.target.value;
                        updateField('options', updated);
                      }}
                      placeholder={`Option ${i + 1}`}
                    />
                    <button
                      className="fb-list-item-del"
                      onClick={() => updateField('options', choiceOptions.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {choiceOptions.length >= choiceCap ? (
                  <span className="fb-hint">Maximum {choiceCap} options on {(platform || 'WEBCHAT')}.</span>
                ) : (
                  <button className="fb-add-btn" onClick={() => updateField('options', [...choiceOptions, ''])}>
                    <Plus size={14} /> Add Option
                  </button>
                )}
                {choiceOptions.length > buttonCap && (
                  <span className="fb-hint">More than {buttonCap} options — this sends as a tappable list message instead of buttons on channels that support one, so every option stays tappable.</span>
                )}
              </div>
            ) : (
              <>
                <div className="fb-field">
                  <label>Input Type</label>
                  <select value={data.inputType || 'name'} onChange={(e) => updateField('inputType', e.target.value)}>
                    <option value="name">Name</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="custom">Custom (any text)</option>
                  </select>
                  {data.inputType !== 'custom' && (
                    <span className="fb-hint">Replies that don't look like a valid {data.inputType} will be re-asked automatically.</span>
                  )}
                </div>
                {data.inputType !== 'custom' && (
                  <div className="fb-field">
                    <label>Invalid Reply Message (optional)</label>
                    <input
                      value={data.invalidMessage || ''}
                      onChange={(e) => updateField('invalidMessage', e.target.value)}
                      placeholder={`e.g. That doesn't look like a valid ${data.inputType}, please try again.`}
                    />
                  </div>
                )}
              </>
            )}

            {isChoice && (
              <div className="fb-field">
                <label>Invalid Reply Message (optional)</label>
                <input
                  value={data.invalidMessage || ''}
                  onChange={(e) => updateField('invalidMessage', e.target.value)}
                  placeholder={`e.g. Please choose one of: ${choiceOptions.filter(Boolean).join(', ') || 'the options above'}`}
                />
              </div>
            )}

            <div className="fb-field">
              <label>Custom Field *</label>
              {data.saveToFieldId === 'CREATE_NEW' ? (
                <NewCustomFieldInline
                  fieldType={fieldType}
                  options={isChoice ? choiceOptions.filter(Boolean) : undefined}
                  onCreated={(field) => {
                    onCustomFieldCreated?.(field);
                    // fieldLabel/fieldKey aren't separate concepts the user sets — they
                    // mirror the field's own name/field_key, kept alongside the id so the
                    // canvas card can show it without needing the full field list (the
                    // engine re-reads the live field on each answer, so a rename later
                    // still takes effect — these are just a display cache).
                    updateFields({ saveToFieldId: field.id, fieldLabel: field.name, fieldKey: field.field_key });
                  }}
                  onCancel={() => updateField('saveToFieldId', null)}
                />
              ) : (
                <select
                  value={data.saveToFieldId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'CREATE_NEW') { updateField('saveToFieldId', 'CREATE_NEW'); return; }
                    const id = val ? Number(val) : null;
                    const field = matchingFields.find((f) => f.id === id);
                    updateFields({ saveToFieldId: id, fieldLabel: field?.name || '', fieldKey: field?.field_key || '' });
                  }}
                >
                  <option value="">Select or create a field...</option>
                  {matchingFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                  <option value="CREATE_NEW">+ Create new {fieldType.toLowerCase()} field...</option>
                </select>
              )}
              <span className="fb-hint">
                {matchingFields.length === 0
                  ? `No ${fieldType.toLowerCase()}-type custom fields yet — only fields matching this question's input type are offered, so the answer always fits.`
                  : "The answer is saved here — shows on the subscriber's profile in the Inbox, and this field's name is what's used in Form Submissions and any webhook/Google Sheet export."}
              </span>
            </div>

            <div className="fb-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!data.endFlow}
                  onChange={(e) => updateField('endFlow', e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                <span>Finish the form after this question</span>
              </label>
              <span className="fb-hint">
                Ends the User Input Flow right here — sends the closing message below, saves the
                submission, and hands control back to the bot flow that called it. Leave this off
                to continue to the next question instead.
              </span>
            </div>

            {data.endFlow && (
              <div className="fb-field">
                <label>Closing Message</label>
                <textarea
                  rows={2}
                  value={data.finalMessage || ''}
                  onChange={(e) => updateField('finalMessage', e.target.value)}
                  placeholder="e.g. Perfect — that's everything, thank you!"
                />
              </div>
            )}
          </>
        );
      }

      case 'collectInput': {
        const fieldType = inputTypeToFieldType(data.inputType || 'name');
        const matchingFields = customFields.filter((f) => f.field_type === fieldType);
        return (
          <>
            <div className="fb-field">
              <label>Prompt Message</label>
              <textarea
                rows={2}
                value={data.message || ''}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="e.g. What's your email address?"
              />
              <span className="fb-hint">Sent to the subscriber to ask the question. Works the same on every channel.</span>
            </div>
            <div className="fb-field">
              <label>Input Type</label>
              <select value={data.inputType || 'name'} onChange={(e) => updateField('inputType', e.target.value)}>
                <option value="name">Name</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="custom">Custom (any text)</option>
              </select>
              {data.inputType !== 'custom' && (
                <span className="fb-hint">Replies that don't look like a valid {data.inputType} will be re-asked automatically.</span>
              )}
            </div>
            {data.inputType !== 'custom' && (
              <div className="fb-field">
                <label>Invalid Reply Message (optional)</label>
                <input
                  value={data.invalidMessage || ''}
                  onChange={(e) => updateField('invalidMessage', e.target.value)}
                  placeholder={`e.g. That doesn't look like a valid ${data.inputType}, please try again.`}
                />
              </div>
            )}
            <div className="fb-field">
              <label>Variable Name</label>
              <input
                value={data.variable || ''}
                onChange={(e) => updateField('variable', e.target.value)}
                placeholder="e.g. user_name"
              />
              <span className="fb-hint">Use as {'{{' + (data.variable || 'variable_name') + '}}'} later in this flow.</span>
            </div>
            <div className="fb-field">
              <label>Also Save To Custom Field (optional)</label>
              {data.saveToFieldId === 'CREATE_NEW' ? (
                <NewCustomFieldInline
                  fieldType={fieldType}
                  onCreated={(field) => {
                    onCustomFieldCreated?.(field);
                    updateField('saveToFieldId', field.id);
                  }}
                  onCancel={() => updateField('saveToFieldId', null)}
                />
              ) : (
                <select
                  value={data.saveToFieldId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateField('saveToFieldId', val === 'CREATE_NEW' ? 'CREATE_NEW' : (val ? Number(val) : null));
                  }}
                >
                  <option value="">Don't save to a custom field</option>
                  {matchingFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                  <option value="CREATE_NEW">+ Create new {fieldType.toLowerCase()} field...</option>
                </select>
              )}
              <span className="fb-hint">
                {matchingFields.length === 0
                  ? `No ${fieldType.toLowerCase()}-type custom fields yet — only fields matching this question's input type are offered, so the answer always fits.`
                  : 'Saves the reply onto the subscriber\'s profile so it shows in the Inbox, not just inside this flow.'}
              </span>
            </div>
          </>
        );
      }

      case 'condition': {
        const compareSource = data.compareSource || 'variable';
        return (
          <>
            <div className="fb-field">
              <label>Compare</label>
              <select
                value={compareSource}
                onChange={(e) => updateField('compareSource', e.target.value)}
              >
                <option value="variable">A session variable (typed by name)</option>
                <option value="customField">A Custom Field</option>
              </select>
            </div>

            {compareSource === 'customField' ? (
              <div className="fb-field">
                <label>Custom Field</label>
                <select
                  value={data.customFieldId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    const field = customFields.find((f) => f.id === id);
                    updateFields({ customFieldId: id, customFieldKey: field?.field_key || '', customFieldName: field?.name || '' });
                  }}
                >
                  <option value="">Select a field...</option>
                  {customFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                {customFields.length === 0 && (
                  <span className="fb-hint">
                    No Custom Fields yet — create one from a Question node's Custom Field picker first, then come back and pick it here.
                  </span>
                )}
                <span className="fb-hint">
                  Reads the contact's current value for this field — whether it was set earlier in this same
                  conversation or captured previously through any other flow.
                </span>
              </div>
            ) : (
              <div className="fb-field">
                <label>Variable</label>
                <input
                  value={data.variable || ''}
                  onChange={(e) => updateField('variable', e.target.value)}
                  placeholder="e.g. user_input"
                />
              </div>
            )}

            <div className="fb-field">
              <label>Operator</label>
              <select value={data.operator || 'equals'} onChange={(e) => updateField('operator', e.target.value)}>
                <option value="equals">Equals</option>
                <option value="contains">Contains</option>
                <option value="startsWith">Starts With</option>
              </select>
            </div>
            <div className="fb-field">
              <label>Value</label>
              <input
                value={data.value || ''}
                onChange={(e) => updateField('value', e.target.value)}
                placeholder="Compare value..."
              />
            </div>
          </>
        );
      }

      case 'delay':
        // This node's own wait is set via the "Delay before this step"
        // control every node type shares, shown right below — nothing
        // node-type-specific to configure here anymore.
        return (
          <span className="fb-hint">Set how long to wait in "Delay before this step" below.</span>
        );

      case 'webhook':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fb-field">
              <label>Endpoint URL (Zapier, Make, CRM) *</label>
              <input
                type="url"
                value={data.url || ''}
                onChange={(e) => updateField('url', e.target.value)}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
              />
            </div>

            <div className="fb-field">
              <label>HTTP Method</label>
              <select
                value={data.method || 'POST'}
                onChange={(e) => updateField('method', e.target.value)}
              >
                <option value="POST">POST (Standard)</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>

            <div className="fb-field">
              <label>Payload Mode</label>
              <select
                value={data.payloadMode || 'ALL_VARIABLES'}
                onChange={(e) => updateField('payloadMode', e.target.value)}
              >
                <option value="ALL_VARIABLES">⚡ Bundle All Subscriber & Flow Variables</option>
                <option value="CUSTOM_JSON">📦 Custom JSON Body</option>
              </select>
            </div>

            {data.payloadMode === 'CUSTOM_JSON' && (
              <div className="fb-field">
                <label>Custom JSON Template</label>
                <textarea
                  rows={4}
                  value={data.customPayload || ''}
                  onChange={(e) => updateField('customPayload', e.target.value)}
                  placeholder='{ "lead_email": "{{email}}", "score": 100 }'
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />
              </div>
            )}

            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
              💡 When this step is reached, subscriber details (Name, Phone, Email, Custom Fields) will be dispatched instantly to your external endpoint.
            </div>
          </div>
        );

      case 'httpApi':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fb-field">
              <label>HTTP API Campaign *</label>
              <select
                value={data.campaignId || ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : '';
                  const campaign = httpApiCampaigns.find((c) => c.id === id);
                  updateFields({ campaignId: id, campaignName: campaign?.name || '' });
                }}
              >
                <option value="">Select a campaign…</option>
                {httpApiCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.method})</option>
                ))}
              </select>
            </div>

            {data.campaignId && (
              <button
                type="button"
                className="fb-link-btn"
                onClick={() => window.open('/bots?category=automation&subTab=httpApiCampaigns', '_blank')}
                style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, textDecoration: 'underline' }}
              >
                Manage HTTP API Campaigns
              </button>
            )}

            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
              💡 When this step is reached, the selected campaign's request fires for real — including any
              {'{{field_key}}'} template values from this subscriber. The flow then continues down the
              <strong> Success</strong> or <strong>Fail</strong> branch depending on the response.
            </div>
          </div>
        );

      case 'payment':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fb-field">
              <label>Product / Service Name *</label>
              <input
                type="text"
                value={data.productName || ''}
                onChange={(e) => updateField('productName', e.target.value)}
                placeholder="e.g. VIP 1-on-1 Consultation"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
              <div className="fb-field">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  value={data.amount || ''}
                  onChange={(e) => updateField('amount', parseFloat(e.target.value) || 0)}
                  placeholder="49.99"
                />
              </div>

              <div className="fb-field">
                <label>Currency</label>
                <select
                  value={data.currency || 'USD'}
                  onChange={(e) => updateField('currency', e.target.value)}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                  <option value="INR">INR (₹)</option>
                </select>
              </div>
            </div>

            <div className="fb-field">
              <label>Payment Button Text</label>
              <input
                type="text"
                value={data.buttonLabel || ''}
                onChange={(e) => updateField('buttonLabel', e.target.value)}
                placeholder="💳 Pay $49.99 Now"
              />
            </div>

            <div className="fb-field">
              <label>Confirmation Message (After Payment)</label>
              <textarea
                rows={2}
                value={data.successMessage || ''}
                onChange={(e) => updateField('successMessage', e.target.value)}
                placeholder="🎉 Thank you! Your payment is confirmed."
              />
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
              💳 A dynamic 1-click checkout link will be generated in WhatsApp, Messenger, or Instagram chat. When paid, the bot will auto-deliver the confirmation message.
            </div>
          </div>
        );

      case 'handoff':
        return (
          <div className="fb-field">
            <label>Handoff Message (optional)</label>
            <textarea
              value={data.message || ''}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="Message before handoff..."
            />
          </div>
        );

      case 'end':
        return (
          <div className="fb-field">
            <label>Closing Message (optional)</label>
            <textarea
              value={data.message || ''}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="Optional goodbye message..."
            />
          </div>
        );

      case 'finalAnswer':
        return (
          <div className="fb-field">
            <label>Closing Message</label>
            <textarea
              value={data.message || ''}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="e.g. Thanks — that's everything I needed!"
            />
            <span className="fb-hint">Sent once all questions are answered, then control returns to wherever this User Input Flow was run from.</span>
          </div>
        );

      case 'runUserInputFlow':
        return (
          <RunUserInputFlowFields
            data={data}
            updateFields={updateFields}
            userInputFlows={userInputFlows}
            platform={platform}
            onDrillIn={onDrillIn}
            onCreated={(uif) => {
              onUserInputFlowCreated?.(uif);
              updateFields({ userInputFlowId: uif.id, userInputFlowName: uif.name });
            }}
          />
        );

      case 'startSequenceAction':
        return (
          <SequenceActionFields
            data={data}
            updateFields={updateFields}
            sequences={sequences}
            platform={platform}
            onCreated={(seq) => onSequenceCreated?.(seq)}
          />
        );

      case 'stopSequenceAction':
        return (
          <SequenceActionFields
            data={data}
            updateFields={updateFields}
            sequences={sequences}
            platform={platform}
            stop
          />
        );

      case 'messageBlock':
        return (
          <MessageBlockFields
            data={data}
            updateFields={updateFields}
            platform={platform}
            renderItemEditor={(item, onItemData) => (
              <PropertiesPanel
                key={item.id}
                embedded
                node={{ id: node.id, type: item.type, data: item.data || {} }}
                onUpdate={(_nodeId, nextData) => onItemData(nextData)}
                onClose={() => {}}
                onDelete={() => {}}
                platform={platform}
                customFields={customFields}
                onCustomFieldCreated={onCustomFieldCreated}
                sequences={sequences}
                onSequenceCreated={onSequenceCreated}
                flows={flows}
                currentFlowId={currentFlowId}
                isUserInputFlow={isUserInputFlow}
                isSequence={isSequence}
                isBroadcastFlow={isBroadcastFlow}
                isChatWidgetFlow={isChatWidgetFlow}
              />
            )}
          />
        );

      case 'actions':
        return <ActionsFields data={data} updateFields={updateFields} sequences={sequences} customFields={customFields} />;

      case 'startAutomation':
        return <StartAutomationFields data={data} updateFields={updateFields} flows={flows} currentFlowId={currentFlowId} platform={platform} />;

      case 'wait': {
        const preset = data.preset || '5m';
        return (
          <div className="fb-field">
            <label>Wait Duration</label>
            <select value={preset} onChange={(e) => updateField('preset', e.target.value)}>
              <option value="immediate">Immediately</option>
              <option value="5m">5 Minutes</option>
              <option value="10m">10 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="30m">30 Minutes</option>
              {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={`${h}h`}>{h} Hour{h === 1 ? '' : 's'}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {preset === 'custom' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  type="number"
                  min="0"
                  value={data.customValue ?? ''}
                  onChange={(e) => updateField('customValue', e.target.value)}
                  placeholder="e.g. 90"
                  style={{ flex: 1 }}
                />
                <select value={data.customUnit || 'minutes'} onChange={(e) => updateField('customUnit', e.target.value)} style={{ flex: 1 }}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
              </div>
            )}
            <span className="fb-hint">How long to wait after the previous step before sending the next one.</span>
          </div>
        );
      }

      default:
        return <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No editable properties</div>;
    }
  };

  const NodeIcon = NODE_ICONS[type] || Settings2;

  // Used by Message Block: edit one element with that element's own fields, no panel chrome.
  if (embedded) return <div className="fb-props-embedded">{renderFields()}</div>;

  return (
    <div className="fb-props">
      <div className="fb-props-header">
        <h3>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: '#0f172a', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
          }}>
            <NodeIcon size={13} color="#ffffff" />
          </div>
          {data.label || type}
        </h3>
        <button className="fb-props-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="fb-props-body">
        {renderFields()}
        {!DELAY_EXCLUDED_NODE_TYPES.has(type) && (
          <DelaySettings
            value={data.delay || (type === 'delay' && data.seconds ? { hours: 0, minutes: 0, seconds: Number(data.seconds) || 0 } : undefined)}
            onChange={(d) => updateField('delay', d)}
          />
        )}
        {TYPING_ELIGIBLE_NODE_TYPES.has(type) && (
          <div className="fb-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="fb-node-typing-badge"><span className="dot" /><span className="dot" /><span className="dot" /></span>
              Show "typing…" before sending
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!data.showTyping} onChange={(e) => updateField('showTyping', e.target.checked)} />
              <span style={{ fontSize: 12, color: '#475569' }}>{data.showTyping ? 'On' : 'Off'}</span>
            </label>
            <span className="fb-hint">Briefly shows the channel's native typing indicator right before this message sends.</span>
          </div>
        )}
        <button className="fb-done-btn" onClick={onClose}>
          <Check size={14} /> Done
        </button>
        {type !== 'start' && (
          <button className="fb-delete-node-btn" onClick={() => onDelete(node.id)}>
            <Trash2 size={14} /> Delete Node
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NODE PALETTE (Left Sidebar)
   ═══════════════════════════════════════════════════════════════════ */

// A picker that quietly shows "nothing" when its list failed to load looks like "you have none".
function notifyPickerLoadError(what) {
  console.error(`[Flow Builder] Could not load ${what}`);
  Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: `Couldn't load ${what}`, text: 'Reload the page to try again.', timer: 4000, showConfirmButton: false });
}

// A broadcast has no live conversation to act on, so it can't run these.
const BROADCAST_HIDDEN_TYPES = new Set(['actions', 'startAutomation']);

function NodePalette({ platform, isUserInputFlow = false, isSequence = false, isBroadcastFlow = false }) {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const permittedCategories = useMemo(() => {
    const source = isSequence ? SEQUENCE_PALETTE : (isUserInputFlow ? USER_INPUT_FLOW_PALETTE : PALETTE_CATEGORIES);
    return source.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => isNodeSupportedOnPlatform(item.type, platform) && !(isBroadcastFlow && BROADCAST_HIDDEN_TYPES.has(item.type))),
    })).filter((cat) => cat.items.length > 0);
  }, [platform, isUserInputFlow, isSequence, isBroadcastFlow]);

  const channelLabel = (platform || 'WEBCHAT').toUpperCase();

  return (
    <div className="fb-palette">
      <div className="fb-palette-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Components</span>
        <span
          style={{
            fontSize: '9.5px',
            fontWeight: 700,
            color: '#475569',
            background: '#f1f5f9',
            padding: '2px 7px',
            borderRadius: '4px',
            letterSpacing: '0.4px',
          }}
        >
          {channelLabel}
        </span>
      </div>
      {permittedCategories.map((cat) => (
        <React.Fragment key={cat.label}>
          <div className="fb-palette-category">{cat.label}</div>
          {cat.items.map((item) => {
            const Icon = NODE_ICONS[item.type];
            const color = NODE_COLORS[item.type];
            return (
              <div
                key={item.type}
                className="fb-palette-item"
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
                title={item.label}
              >
                <div className="fb-palette-item-icon">
                  <Icon size={13} style={{ color }} />
                </div>
                <span>{item.label}</span>
                <span className="fb-palette-item-grip">
                  <GripVertical size={13} />
                </span>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FLOW BUILDER (inner, with useReactFlow available)
   ═══════════════════════════════════════════════════════════════════ */

const nodeTypes = {
  start: StartNode,
  text: TextNode,
  interactive: InteractiveNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  file: FileNode,
  buttons: ButtonsNode,
  quickReplies: QuickRepliesNode,
  listMenu: ListMenuNode,
  card: CardNode,
  carousel: CarouselNode,
  collectInput: CollectInputNode,
  condition: ConditionNode,
  delay: DelayNode,
  webhook: WebhookNode,
  httpApi: HttpApiNode,
  payment: PaymentNode,
  handoff: HandoffNode,
  end: EndNode,
  runUserInputFlow: RunUserInputFlowNode,
  question: CollectInputNode, // same "ask & wait" UI as Collect Input — see PropertiesPanel for shared config
  finalAnswer: FinalAnswerNode,
  startSequenceAction: StartSequenceActionNode,
  stopSequenceAction: StopSequenceActionNode,
  wait: WaitNode,
  actions: ActionsNode,
  startAutomation: StartAutomationNode,
  messageBlock: MessageBlockNode,
};

/* ── Removable / Deletable Edge ────────────────────────────── */
function RemovableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  selected,
}) {
  const { setEdges } = useReactFlow();
  const [isHovered, setIsHovered] = useState(false);

  // Plain curve straight from the connector — no straight exit stub (that's
  // being revisited separately, per-element, later). Keep the bow modest so
  // close nodes still read as a curve without ballooning into a big loop.
  const gapX = targetX - sourceX;
  const gapY = targetY - sourceY;

  let pull;
  let bow = 0;
  if (gapX >= 0) {
    // Reach is half the gap but never under 60px, so a tight gap makes the wire
    // swing out and back in (ManyChat's S-curve) while a wide gap opens up smoothly.
    pull = Math.min(Math.max(gapX * 0.5, 60), 220);
  } else {
    // Target sits behind the source: needs a loop wide enough to swing clear.
    pull = Math.min(Math.abs(gapX) * 0.3 + 60, 150);
    bow = Math.abs(gapY) < 90 ? 50 : 0;
  }

  // The wire ends at the BASE of the arrowhead, and the arrowhead's tip touches
  // the edge of the target connector. The last control point shares the target's
  // y, so the wire always arrives horizontally — exactly the direction the arrow
  // points — and the two read as one continuous line.
  const ARROW_LEN = 9;
  const ARROW_HALF = 5;
  const tipX = targetX;
  const baseX = tipX - ARROW_LEN;
  const edgePath =
    `M ${sourceX},${sourceY} ` +
    `C ${sourceX + pull},${sourceY + bow} ${baseX - pull},${targetY} ${baseX},${targetY}`;

  // Midpoint of that cubic, used to park the delete button on the wire.
  const labelX = (sourceX + baseX) / 2;
  const labelY = (sourceY + targetY) / 2 + bow * 0.375;

  const onEdgeDelete = (e) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
  };

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="react-flow__edge-custom-group"
      style={{ opacity: 1 }}
    >
      {/* Invisible wider hit path to effortlessly capture mouse hover on the wire */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="react-flow__edge-interaction"
      />
      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          strokeWidth: (isHovered || selected) ? 2.25 : 1.75,
          strokeLinecap: 'round',
          stroke: selected ? '#0f172a' : isHovered ? '#475569' : '#94a3b8',
          strokeDasharray: 'none',
        }}
      />
      {/* Arrowhead: starts exactly where the wire ends (baseX) and its tip meets
          the connector, so it is the end of the wire rather than a separate mark. */}
      <path
        d={`M ${tipX},${targetY} L ${baseX},${targetY - ARROW_HALF} L ${baseX},${targetY + ARROW_HALF} Z`}
        fill={selected ? '#0f172a' : isHovered ? '#475569' : '#94a3b8'}
        stroke={selected ? '#0f172a' : isHovered ? '#475569' : '#94a3b8'}
        strokeWidth={1.5}
        strokeLinejoin="round"
        style={{ pointerEvents: 'none' }}
      />
      {(isHovered || selected) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            className="nodrag nopan"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <button
              type="button"
              className="fb-edge-delete-btn"
              onClick={onEdgeDelete}
              title="Disconnect connection (Delete Edge)"
              style={{
                width: 20,
                height: 20,
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                color: '#64748b',
                cursor: 'pointer',
                borderRadius: '50%',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.15s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.2)';
                e.currentTarget.style.borderColor = '#ef4444';
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.background = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.color = '#64748b';
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              ✕
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

const edgeTypes = {
  smoothstep: RemovableEdge,
  removable: RemovableEdge,
  default: RemovableEdge,
};

/* ── Floating Quick Component Picker (drag-to-connect) ──────── */
function QuickComponentPicker({ position, onClose, onSelect, platform, isUserInputFlow = false, isSequence = false, isBroadcastFlow = false }) {
  const [search, setSearch] = useState('');
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const filteredCategories = useMemo(() => {
    const source = isSequence ? SEQUENCE_PALETTE : (isUserInputFlow ? USER_INPUT_FLOW_PALETTE : PALETTE_CATEGORIES);
    return source.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => {
        if (item.type === 'start') return false; // don't spawn multiple start nodes
        if (!isNodeSupportedOnPlatform(item.type, platform)) return false; // strictly only permitted on platform
        if (isBroadcastFlow && BROADCAST_HIDDEN_TYPES.has(item.type)) return false;
        if (search.trim()) {
          return (
            item.label.toLowerCase().includes(search.toLowerCase()) ||
            item.type.toLowerCase().includes(search.toLowerCase())
          );
        }
        return true;
      }),
    })).filter((cat) => cat.items.length > 0);
  }, [search, platform, isUserInputFlow, isSequence, isBroadcastFlow]);

  return (
    <div
      ref={pickerRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 11000,
        width: 280,
        maxHeight: 380,
        background: '#ffffff',
        borderRadius: 14,
        border: '1px solid #e4e4f0',
        boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header & Search */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #e4e4f0',
          background: '#f8f8fc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Zap size={14} color="#6366f1" /> Connect Next Step
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#5c5c80',
              cursor: 'pointer',
              padding: 0,
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
        <input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '7px 10px',
            fontSize: 12,
            background: '#ffffff',
            border: '1px solid #e4e4f0',
            borderRadius: 6,
            color: '#1a1a2e',
            outline: 'none',
          }}
        />
      </div>

      {/* Components List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {filteredCategories.length === 0 ? (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: '#9999bb', fontSize: 12 }}>
            No components found
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <div key={cat.label} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: '#9999bb',
                  padding: '4px 6px',
                  letterSpacing: 0.5,
                }}
              >
                {cat.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 3 }}>
                {cat.items.map((item) => {
                  const Icon = NODE_ICONS[item.type] || MessageSquare;
                  const color = NODE_COLORS[item.type] || '#6366f1';
                  const isSupported = isNodeSupportedOnPlatform(item.type, platform);

                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => onSelect(item.type)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 8,
                        background: '#ffffff',
                        border: '1px solid transparent',
                        color: isSupported ? '#1a1a2e' : '#9999bb',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f0f0fa';
                        e.currentTarget.style.borderColor = '#e4e4f0';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: `${color}18`,
                          color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={14} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: { stroke: '#94a3b8', strokeWidth: 2 },
};

function getPlatformUrl(account, platform, flowData = null) {
  const p = (platform || account?.platform || flowData?.platform || '').toUpperCase();
  switch (p) {
    case 'INSTAGRAM': {
      const username = account?.ig_username || flowData?.ig_username || (account?.name && !account.name.includes(' ') ? account.name : '');
      return username
        ? `https://www.instagram.com/${String(username).replace('@', '')}/`
        : 'https://www.instagram.com/';
    }
    case 'FACEBOOK': {
      const fbId = account?.fb_page_id || flowData?.fb_page_id;
      if (fbId) {
        return `https://www.facebook.com/${fbId}`;
      }
      return 'https://www.facebook.com/';
    }
    case 'WHATSAPP': {
      const phone = account?.wa_display_phone || account?.wa_phone_number_id || flowData?.wa_phone_number_id;
      const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
      if (cleanPhone && cleanPhone.length >= 7 && cleanPhone.length <= 15) {
        return `https://wa.me/${cleanPhone}`;
      }
      return 'https://business.facebook.com/wa/manage/home/';
    }
    case 'TELEGRAM': {
      // 1. Direct bot username field from database (telegram_bots)
      let tgBot = account?.tg_bot_username || account?.bot_username || flowData?.tg_bot_username;

      // 2. Extract @username from name like "Nexa Bot (@The_River_9_bot)"
      if (!tgBot) {
        const rawName = account?.name || flowData?.integration_name || '';
        const match = rawName.match(/@([a-zA-Z0-9_]{3,})/);
        if (match) {
          tgBot = match[1];
        } else if (rawName && !rawName.includes(' ') && !rawName.includes('(')) {
          tgBot = rawName.replace(/^@/, '').trim();
        }
      }

      if (tgBot) {
        const cleanHandle = String(tgBot).replace(/[^a-zA-Z0-9_]/g, '');
        if (cleanHandle) {
          const keyword = flowData?.trigger_keyword?.trim();
          if (keyword && keyword !== '*' && !keyword.includes(' ')) {
            return `https://t.me/${cleanHandle}?start=${encodeURIComponent(keyword)}`;
          }
          return `https://t.me/${cleanHandle}`;
        }
      }
      return 'https://web.telegram.org/';
    }
    case 'TIKTOK': {
      const ttName = account?.name ? account.name.replace('@', '') : '';
      return ttName ? `https://www.tiktok.com/@${ttName}` : 'https://www.tiktok.com/';
    }
    case 'WEBCHAT':
    default:
      return '/channels/webchat';
  }
}

function FlowBuilderInner() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { screenToFlowPosition, fitView, getViewport, setViewport } = useReactFlow();

  // ── In-session User Input Flow editing ("drill in") ─────────────────────
  // Clicking Create New / Edit on a "Run User Input Flow" node used to navigate
  // to a different route, unmounting this whole page and losing whatever was
  // unsaved in the Main Flow. Instead: while `drilledIn` is set, this SAME
  // mounted component swaps to editing that User Input Flow's own nodes/edges —
  // `id`/`isUserInputFlow` below resolve to it instead of the route — and
  // `parentContext` holds a full snapshot of the Main Flow to restore on
  // "Back to Main Flow." No navigate(), no remount, no lost work. See
  // drillIntoUif/drillBackToMain below (defined after handleSave/pushHistory,
  // which they call).
  const [drilledIn, setDrilledIn] = useState(null); // null | { uifId, uifName }
  const [parentContext, setParentContext] = useState(null); // snapshot to restore on "Back"
  const [uifDirty, setUifDirty] = useState(false);
  const skipNextDirtyRef = useRef(false);

  // Resolves to the route's own id/mode normally; while drilled in, resolves to
  // the User Input Flow's own id and forces UIF mode — every other reference to
  // `id`/`isUserInputFlow` in this component (save, load, display) is unchanged
  // and just naturally follows whichever one is currently active.
  const id = drilledIn ? drilledIn.uifId : routeId;

  // ── User Input Flow mode ────────────────────────────────────────────────
  // Same canvas, same node components, same save/undo machinery — just bound to
  // userInputFlowAPI instead of flowAPI, with a restricted palette and a Start
  // node that carries the flow's own settings (name/label/webhook/Google Sheet)
  // instead of a keyword trigger. A User Input Flow is never triggered by a
  // keyword: a bot Flow invokes it through a "Run User Input Flow" node.
  const isUserInputFlow = drilledIn ? true : location.pathname.startsWith('/user-input-flows');

  // ── Sequence Messages mode ──────────────────────────────────────────────
  // Same canvas/save/undo machinery again, bound to sequenceAPI instead —
  // restricted to content nodes + a `wait` delay node, and enforced as a
  // single linear chain (no branching, no waiting for a reply) since a
  // Sequence is strictly a one-way broadcast — see validateSequenceIsLinear
  // below and the Sequence Messages plan. Not drilled into from the Main
  // Flow Builder (unlike User Input Flows) — reached only via its own
  // /sequences/:id/edit route from the Sequences list page.
  const isSequence = location.pathname.startsWith('/sequences');

  // Agency's Custom Field catalog (Settings/Inbox) — offered as a save target on Collect Input nodes
  const [customFields, setCustomFields] = useState([]);
  useEffect(() => {
    customFieldAPI.getAll().then((res) => setCustomFields(res.data?.fields || [])).catch(() => {});
  }, []);

  // Agency's reusable User Input Flows — offered as a target on "Run User Input Flow"
  // nodes. Scoped to this flow's own channel: a User Input Flow is locked to the
  // channel it was built for, so a WhatsApp flow never sees a Messenger one.
  const [userInputFlows, setUserInputFlows] = useState([]);

  // Track referring location for the back button and breadcrumb
  const referrerState = location.state;
  const returnUrl = useMemo(() => {
    // 1. Explicitly passed in router state
    if (
      referrerState?.from &&
      typeof referrerState.from === 'string' &&
      !referrerState.from.startsWith('/flows/' + id) &&
      !referrerState.from.startsWith('/bots/' + id)
    ) {
      return referrerState.from;
    }
    // 2. SessionStorage cached referrer (in case of page reload)
    try {
      const cached = sessionStorage.getItem('flow_builder_return_url');
      if (
        cached &&
        !cached.startsWith('/flows/' + id) &&
        !cached.startsWith('/bots/' + id)
      ) {
        return cached;
      }
    } catch { /* sessionStorage unavailable (private mode / blocked) — ignoring is intended */ }
    return null;
  }, [referrerState, id]);

  // Persist the return URL into sessionStorage when arriving from outside flow builder
  useEffect(() => {
    try {
      if (
        referrerState?.from &&
        !referrerState.from.startsWith('/flows/' + id) &&
        !referrerState.from.startsWith('/bots/' + id)
      ) {
        sessionStorage.setItem('flow_builder_return_url', referrerState.from);
        if (referrerState.label) {
          sessionStorage.setItem('flow_builder_return_label', referrerState.label);
        }
      }
    } catch { /* sessionStorage unavailable (private mode / blocked) — ignoring is intended */ }
  }, [referrerState, id]);

  // Dynamic breadcrumb label matching the source page
  const backLabel = useMemo(() => {
    if (referrerState?.label) return referrerState.label;
    try {
      const cachedLabel = sessionStorage.getItem('flow_builder_return_label');
      if (cachedLabel) return cachedLabel;
    } catch { /* sessionStorage unavailable (private mode / blocked) — ignoring is intended */ }

    const dest = returnUrl || '';
    if (dest.startsWith('/flows')) return 'Flows';
    if (dest.startsWith('/bots')) return 'Automations';
    if (dest.startsWith('/channels')) return 'Channels';
    if (dest.startsWith('/campaigns')) return 'Campaigns';
    if (dest.startsWith('/social-posting') || dest.startsWith('/publishing')) return 'Publishing';
    if (dest.startsWith('/ai')) return 'AI Agent';
    if (dest.startsWith('/webhooks')) return 'Webhooks';
    if (dest.startsWith('/orders')) return 'Orders';
    if (dest.startsWith('/appointments')) return 'Appointments';
    if (dest.startsWith('/inbox')) return 'Inbox';
    return 'Automations';
  }, [referrerState, returnUrl]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const [flowData, setFlowData] = useState(null);
  const [linkedWidget, setLinkedWidget] = useState(null);
  const [widgetAppearanceOpen, setWidgetAppearanceOpen] = useState(false);
  const [widgetAppearanceForm, setWidgetAppearanceForm] = useState(null);
  const [flowName, setFlowName] = useState('');
  const [platform, setPlatform] = useState(() => {
    const q = searchParams.get('platform');
    return q ? q.toUpperCase() : 'WEBCHAT';
  });
  const [integrationId, setIntegrationId] = useState(() => {
    return searchParams.get('integration_id') || searchParams.get('integrationId') || null;
  });
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  // Derived, not route-based like isUserInputFlow/isSequence — a Broadcast
  // flow lives at the same /flows/:id URL as any other flow, so this is
  // only knowable once the flow itself has loaded (routes/broadcasts.js's
  // start-with-flow is what actually sets trigger_type='BROADCAST').
  const isBroadcastFlow = flowData?.trigger_type === 'BROADCAST';
  const isChatWidgetFlow = Boolean(
    flowData?.trigger_type === 'CHAT_WIDGET' ||
    linkedWidget ||
    nodes.some((n) => n.type === 'start' && n.data?.chatWidgetStart)
  );

  // Quick-add bot reply action for Chat Widget start node
  const handleAddReplyNode = useCallback((type) => {
    const startNode = nodesRef.current.find((n) => n.type === 'start');
    const startPos = startNode ? startNode.position : { x: 80, y: 120 };
    const existingReplies = nodesRef.current.filter((n) => n.type !== 'start');
    const xOffset = 360 + (existingReplies.length * 40);
    const yOffset = (existingReplies.length * 70);

    const newId = generateNodeId(type);
    const newNode = {
      id: newId,
      type,
      position: { x: startPos.x + xOffset, y: startPos.y + yOffset },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        ...(DEFAULT_NODE_DATA[type] || {}),
        _unsupported: !isNodeSupportedOnPlatform(type, platform),
      },
    };

    setNodes((nds) => [...nds, newNode]);

    if (startNode) {
      const hasStartEdge = edgesRef.current.some((e) => e.source === startNode.id && e.sourceHandle === 'next-step');
      if (!hasStartEdge) {
        setEdges((eds) => [
          ...eds,
          { id: `e-${startNode.id}-${newId}`, source: startNode.id, sourceHandle: 'next-step', target: newId, targetHandle: 'target', type: 'default', animated: false }
        ]);
      }
    }

    setSelectedNode(newNode);
  }, [setNodes, setEdges, platform]);

  // Re-fetched whenever the channel changes, so the "Run User Input Flow" picker
  // only ever offers same-channel flows (see the userInputFlows note above).
  useEffect(() => {
    if (isUserInputFlow || isSequence) return; // neither can run/reference another one
    // BOT SCOPE: only this bot account's own forms — never another bot's.
    setScopeReady((r) => ({ ...r, uif: false }));
    if (!integrationId) { setUserInputFlows([]); return; }
    userInputFlowAPI
      .getAll({ ...(platform ? { platform } : {}), integrationId })
      .then((res) => { setUserInputFlows(res.data?.userInputFlows || []); setScopeReady((r) => ({ ...r, uif: true })); })
      .catch(() => { setUserInputFlows([]); notifyPickerLoadError('User Input Flows'); });
  }, [platform, integrationId, isUserInputFlow, isSequence]);

  // Agency's reusable Sequences — offered as a target on "Start Sequence" /
  // "Stop Sequence" action nodes (main Flow Builder only, per the Sequence
  // Messages plan — a Sequence step can't itself start another Sequence).
  const [sequencesList, setSequencesList] = useState([]);
  useEffect(() => {
    if (isUserInputFlow || isSequence) return;
    // BOT SCOPE: only this bot account's own sequences — never another bot's.
    setScopeReady((r) => ({ ...r, seq: false }));
    if (!integrationId) { setSequencesList([]); return; }
    sequenceAPI.getAll({ integrationId }).then((res) => { setSequencesList(res.data?.sequences || []); setScopeReady((r) => ({ ...r, seq: true })); }).catch(() => { setSequencesList([]); notifyPickerLoadError('Sequences'); });
  }, [integrationId, isUserInputFlow, isSequence]);

  // Other bot Flows — offered on a button's "Go to Existing Flow" action so a
  // tap can jump the subscriber straight into a different flow, independent
  // of any canvas wire. Same reasoning as sequencesList above: not meaningful
  // from inside a User Input Flow or a Sequence canvas.
  const [flowsList, setFlowsList] = useState([]);
  // Which bot-scoped lists have actually loaded (an unloaded list must never cause a false "foreign" flag).
  const [scopeReady, setScopeReady] = useState({ seq: false, uif: false, flows: false });
  useEffect(() => {
    if (isUserInputFlow || isSequence) return;
    // BOT SCOPE: only this bot account's own flows (Go to Flow / Start Automation targets).
    setScopeReady((r) => ({ ...r, flows: false }));
    if (!integrationId) { setFlowsList([]); return; }
    flowAPI.getAll({ integrationId }).then((res) => { setFlowsList(res.data?.flows || []); setScopeReady((r) => ({ ...r, flows: true })); }).catch(() => { setFlowsList([]); notifyPickerLoadError('flows'); });
  }, [integrationId, isUserInputFlow, isSequence]);

  // HTTP API Campaigns (Automation module) — offered on an "HTTP API" node,
  // same reasoning as flowsList/sequencesList above.
  const [httpApiCampaigns, setHttpApiCampaigns] = useState([]);
  useEffect(() => {
    if (isUserInputFlow || isSequence) return;
    httpApiCampaignAPI.getAll().then((res) => setHttpApiCampaigns(res.data?.campaigns || [])).catch(() => {});
  }, [isUserInputFlow, isSequence]);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Undo / Redo history tracking
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const isHistoryAction = useRef(false);

  const pushHistory = useCallback((newNodes, newEdges) => {
    if (isHistoryAction.current) return;
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push({
      nodes: JSON.parse(JSON.stringify(newNodes)),
      edges: JSON.parse(JSON.stringify(newEdges)),
    });
    if (nextHistory.length > 30) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
  }, []);

  // Marks the drilled-in User Input Flow dirty on any real edit, so "Back to Main
  // Flow" knows to ask before discarding it. Skips exactly one run right after
  // drillIntoUif sets nodes/edges/flowName to the freshly-loaded form — that's a
  // load, not an edit — via skipNextDirtyRef, which drillIntoUif arms.
  useEffect(() => {
    if (!drilledIn) return;
    if (skipNextDirtyRef.current) { skipNextDirtyRef.current = false; return; }
    setUifDirty(true);
  }, [nodes, edges, flowName, drilledIn]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      isHistoryAction.current = true;
      historyIndexRef.current -= 1;
      const prevSnap = historyRef.current[historyIndexRef.current];
      if (prevSnap) {
        setNodes(prevSnap.nodes);
        setEdges(prevSnap.edges);
      }
      setTimeout(() => {
        isHistoryAction.current = false;
      }, 100);
    }
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isHistoryAction.current = true;
      historyIndexRef.current += 1;
      const nextSnap = historyRef.current[historyIndexRef.current];
      if (nextSnap) {
        setNodes(nextSnap.nodes);
        setEdges(nextSnap.edges);
      }
      setTimeout(() => {
        isHistoryAction.current = false;
      }, 100);
    }
  }, [setNodes, setEdges]);

  const autoSaveTimerRef = useRef(null);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Resolve the exact connected page / account name for this flow
  const currentAccount = useMemo(() => {
    if (integrationId && integrations.length > 0) {
      const matched = integrations.find((i) => String(i.id) === String(integrationId));
      if (matched) return matched;
    }
    if (flowData?.integration_id && integrations.length > 0) {
      const matched = integrations.find((i) => String(i.id) === String(flowData.integration_id));
      if (matched) return matched;
    }
    // Fallback: match by platform if single integration exists
    if (platform && integrations.length > 0) {
      const platformMatches = integrations.filter((i) => i.platform === platform);
      if (platformMatches.length > 0) return platformMatches[0];
    }
    return null;
  }, [integrationId, flowData, integrations, platform]);

  const currentAccountName = useMemo(() => {
    if (currentAccount) {
      return currentAccount.tg_bot_username
        ? `@${currentAccount.tg_bot_username}`
        : currentAccount.fb_page_name || currentAccount.ig_username || currentAccount.name || currentAccount.wa_phone_number_id;
    }
    if (flowData?.tg_bot_username) return `@${flowData.tg_bot_username}`;
    if (flowData?.fb_page_name) return flowData.fb_page_name;
    if (flowData?.ig_username) return `@${flowData.ig_username}`;
    if (flowData?.integration_name) return flowData.integration_name;
    return null;
  }, [currentAccount, flowData]);

  const platformUrl = useMemo(() => {
    return getPlatformUrl(currentAccount, platform, flowData);
  }, [currentAccount, platform, flowData]);

  /* ── Mark unsupported nodes ──────────────────────────────── */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          _unsupported: !isNodeSupportedOnPlatform(n.type, platform),
        },
      }))
    );
  }, [platform, setNodes]);

  /* ── Load flow from API ─────────────────────────────────── */
  useEffect(() => {
    async function loadFlow() {
      try {
        setLoading(true);
        const [res, intRes] = await Promise.allSettled([
          (id && id !== 'new')
            ? (isSequence ? sequenceAPI.getOne(id) : (isUserInputFlow ? userInputFlowAPI.getOne(id) : flowAPI.getOne(id)))
            : Promise.resolve({ data: null }),
          integrationAPI.getAll(),
        ]);
        if (intRes.status === 'fulfilled') {
          const allIntegrations = intRes.value.data?.integrations || [];
          setIntegrations(allIntegrations);

          // If an integration was requested in query params, resolve platform from it
          const qIntId = searchParams.get('integration_id') || searchParams.get('integrationId');
          if (qIntId) {
            const matched = allIntegrations.find((i) => String(i.id) === String(qIntId));
            if (matched?.platform) {
              setPlatform(matched.platform.toUpperCase());
            }
          }
        }

        const flow = res.status === 'fulfilled'
          ? (res.value.data?.userInputFlow || res.value.data?.sequence || res.value.data?.flow || res.value.data)
          : null;
        if (!flow) {
          // Initialize empty flow with start node
          const isWebchatFallback = (platform || '').toUpperCase() === 'WEBCHAT' || location.state?.label === 'Webchat';
          if (isWebchatFallback) {
            const seeded = buildDefaultWidgetFlowGraph('Live Webchat', 'WEBCHAT');
            setNodes(seeded.nodes);
            setEdges(seeded.edges);
          } else {
            setNodes([{
              id: generateNodeId('start'),
              type: 'start',
              position: { x: 400, y: 100 },
              data: { ...DEFAULT_NODE_DATA.start },
            }]);
          }
          setLoading(false);
          return;
        }

        setFlowData(flow);
        setFlowName(flow.name || 'Untitled Flow');
        // A Broadcasting-module flow (routes/broadcasts.js's start-with-flow
        // set this at creation) — its Start node shows the campaign's
        // audience/schedule/send controls instead of a keyword trigger.
        const isBroadcastFlowLoaded = flow.trigger_type === 'BROADCAST';

        let resolvedPlatform = flow.platform || 'WEBCHAT';
        if (flow.integration_id && intRes.status === 'fulfilled') {
          const matched = (intRes.value.data?.integrations || []).find((i) => String(i.id) === String(flow.integration_id));
          if (matched?.platform) resolvedPlatform = matched.platform.toUpperCase();
        }
        setPlatform(resolvedPlatform);
        setIntegrationId(flow.integration_id || null);

        // If this flow is a Chat Widget's reply logic (created
        // by ChatWidgetManager.jsx), load its appearance fields so
        // the Chat Widget start node and properties panel have full data.
        if (!isSequence && !isUserInputFlow) {
          channelAPI.getWebchatByFlow(id).then((res) => {
            const widget = res.data?.widget;
            if (widget) {
              setLinkedWidget(widget);
              setWidgetAppearanceForm({
                name: widget.name,
                integrationId: widget.integration_id ? String(widget.integration_id) : '',
                targetPlatform: widget.target_platform || resolvedPlatform,
                logoUrl: widget.logo_url || '',
                displayName: widget.display_name || widget.name || '',
                headerBgColor: widget.header_bg_color || widget.primary_color || '#111827',
                headerTextColor: widget.header_text_color || '#ffffff',
                greetingMessage: widget.greeting_message || '',
                placeholderText: widget.placeholder_text || '',
                prefillMessage: widget.prefill_message || '',
                position: widget.position || 'BOTTOM_RIGHT',
                openOnStartup: Boolean(widget.open_on_startup),
                offsetX: widget.offset_x ?? 20,
                offsetY: widget.offset_y ?? 20,
                buttonText: widget.button_text || 'Chat with us',
                buttonBgColor: widget.button_bg_color || widget.primary_color || (resolvedPlatform === 'WHATSAPP' ? '#25D366' : '#6366f1'),
                buttonTextColor: widget.button_text_color || '#ffffff',
                buttonSize: widget.button_size || 'MEDIUM',
                allowedDomains: widget.allowed_domains || '',
              });
              setNodes((nds) => nds.map((n) => n.type === 'start' ? {
                ...n,
                data: {
                  ...n.data,
                  chatWidgetStart: true,
                  targetPlatform: widget.target_platform || resolvedPlatform,
                  widgetName: widget.name,
                  displayName: widget.display_name || widget.name,
                  greetingMessage: widget.greeting_message,
                  placeholderText: widget.placeholder_text,
                  prefillMessage: widget.prefill_message,
                  buttonText: widget.button_text,
                  buttonBgColor: widget.button_bg_color,
                }
              } : n));
            }
          }).catch(() => {});
        }

        let loadedNodes = [];
        let loadedEdges = [];

        try {
          loadedNodes = typeof flow.nodes_json === 'string'
            ? JSON.parse(flow.nodes_json)
            : (flow.nodes_json || []);
        } catch { loadedNodes = []; }

        try {
          loadedEdges = typeof flow.edges_json === 'string'
            ? JSON.parse(flow.edges_json)
            : (flow.edges_json || []);
        } catch { loadedEdges = []; }

        const isChatWidgetFlowLoaded = flow.trigger_type === 'CHAT_WIDGET';

        // Auto-add start node if empty. A brand-new User Input Flow starts with its
        // Start node plus one Question, so it opens ready to fill in rather than
        // as a bare canvas.
        if (!loadedNodes.length) {
          if (isUserInputFlow) {
            const seeded = buildDefaultUifNodesEdges();
            loadedNodes = seeded.nodes;
            loadedEdges = seeded.edges;
          } else if (isChatWidgetFlowLoaded) {
            const seeded = buildDefaultWidgetFlowGraph(flow.name, flow.platform || 'WEBCHAT');
            loadedNodes = seeded.nodes;
            loadedEdges = seeded.edges;
          } else {
            loadedNodes = [{
              id: generateNodeId('start'),
              type: 'start',
              position: { x: 400, y: 100 },
              data: { ...DEFAULT_NODE_DATA.start },
            }];
          }
        }

        // Ensure all nodes have proper data defaults merged and Left-to-Right handle positions
        loadedNodes = loadedNodes.map((n) => {
          const nodeData = {
            ...(DEFAULT_NODE_DATA[n.type] || {}),
            ...n.data,
            // Marks this Start node as a User Input Flow's / a Sequence's (no
            // keyword trigger) — stamped on load so a flow saved before this
            // existed still validates.
            ...(isUserInputFlow && n.type === 'start' ? { uifStart: true } : {}),
            ...(isSequence && n.type === 'start' ? { sequenceStart: true } : {}),
            ...(isBroadcastFlowLoaded && n.type === 'start' ? { broadcastStart: true } : {}),
            ...((isChatWidgetFlowLoaded || flow.trigger_type === 'CHAT_WIDGET' || Boolean(n.data?.chatWidgetStart)) && n.type === 'start' ? {
              chatWidgetStart: true,
              targetPlatform: (flow.platform || 'WEBCHAT').toUpperCase(),
              widgetName: n.data?.widgetName || flow.name || 'Chat Widget',
              displayName: n.data?.displayName || flow.name || 'Support Chat',
              greetingMessage: n.data?.greetingMessage || 'Hello! How can we help you today?',
              buttonText: n.data?.buttonText || 'Chat with us',
              buttonBgColor: n.data?.buttonBgColor || ((flow.platform || '').toUpperCase() === 'WHATSAPP' ? '#25D366' : '#6366f1'),
            } : {}),
            _unsupported: !isNodeSupportedOnPlatform(n.type, flow.platform || 'WEBCHAT'),
          };

          // Skipped for a User Input Flow's / Sequence's / Broadcast's / Chat Widget's Start
          // node — none of them has a keyword trigger to backfill.
          if (n.type === 'start' && !isUserInputFlow && !isSequence && !isBroadcastFlowLoaded && !isChatWidgetFlowLoaded && flow.trigger_type !== 'CHAT_WIDGET' && !nodeData.chatWidgetStart) {
            if (!nodeData.triggers || !Array.isArray(nodeData.triggers) || nodeData.triggers.length === 0) {
              const kws = nodeData.keywords !== undefined
                ? (Array.isArray(nodeData.keywords) ? nodeData.keywords : [nodeData.keywords])
                : (flow.trigger_keyword ? flow.trigger_keyword.split(',').map((k) => k.trim()).filter(Boolean) : ['ranzu', 'hi', 'hello']);
              nodeData.triggers = [
                {
                  id: 'trig-1',
                  type: nodeData.trigger_type || 'keyword',
                  title: 'User sends a message',
                  match_type: nodeData.match_type || 'contains',
                  keywords: kws,
                },
              ];
            }
            if (nodeData.keywords === undefined) {
              nodeData.keywords = nodeData.triggers[0]?.keywords || ['hi', 'hello'];
            }
          }

          return {
            ...n,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: nodeData,
          };
        });

        // Normalize loaded edges with Left-to-Right orientation matching ManyChat design
        loadedEdges = loadedEdges.map((e) => ({
          ...e,
          type: 'default',
          animated: false,
          sourceHandle: (e.sourceHandle === 'default' || e.sourceHandle === 'bottom') ? undefined : e.sourceHandle,
          targetHandle: (e.targetHandle === 'default' || e.targetHandle === 'top') ? undefined : e.targetHandle,
        }));

        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setIsLive(flow.is_active === 1 || flow.is_active === true || flow.status === 'active');
        pushHistory(loadedNodes, loadedEdges);
      } catch (err) {
        console.error('Failed to load flow:', err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadFlow();
    } else {
      setLoading(false);
    }
    // Intentionally loads once per flow id — re-running when the platform / history callbacks change would reload the canvas and drop unsaved edits.
  }, [id, setNodes, setEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Auto-save disabled on user request ─────────────────── */
  const triggerAutoSave = useCallback(() => {
    // Auto-save disabled
  }, []);

  /* ── Auto-save on changes disabled ──────────────────────── */
  // Auto-save disabled per user request


  /* ── Immediate save before leaving (flushes debounced timer) ── */
  const flushAutoSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      try {
        if (!id || id === 'new') return;
        const currentNodes = nodesRef.current || [];
        const hasErrors = currentNodes.some((n) => validateNodeData(n) !== null);
        if (hasErrors) return;

        const startNode = currentNodes.find((n) => n.type === 'start');
        const isWidget = Boolean(startNode?.data?.chatWidgetStart || isChatWidgetFlow);
        const triggerType = isWidget
          ? 'CHAT_WIDGET'
          : (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
        let triggerKeyword = isWidget ? '' : (flowData?.trigger_keyword || '');
        if (!isWidget && startNode?.data?.keywords) {
          triggerKeyword = Array.isArray(startNode.data.keywords)
            ? startNode.data.keywords.join(',')
            : startNode.data.keywords;
        }

        const serializedNodes = JSON.stringify(currentNodes.map((n) => {
          const { _unsupported, _validationError, _errorItemId, ...rest } = n.data;
          return { ...n, data: rest };
        }));

        if (isSequence) {
          // No trigger/integration, same reasoning as a User Input Flow below
          // — a Sequence is enrolled into via a Start/Stop Sequence action,
          // and its channel is locked at creation.
          await sequenceAPI.update(id, {
            name: flowName,
            nodes_json: serializedNodes,
            edges_json: JSON.stringify(edgesRef.current),
          });
        } else if (isUserInputFlow) {
          // No trigger/integration — a User Input Flow is invoked by a bot Flow's
          // "Run User Input Flow" node, and its channel is locked at creation.
          await userInputFlowAPI.update(id, {
            name: flowName,
            nodes_json: serializedNodes,
            edges_json: JSON.stringify(edgesRef.current),
          });
        } else {
          await flowAPI.update(id, {
            name: flowName,
            platform,
            integration_id: integrationId || null,
            trigger_type: triggerType,
            trigger_keyword: triggerKeyword,
            nodes_json: serializedNodes,
            edges_json: JSON.stringify(edgesRef.current),
          });
          if (linkedWidget && widgetAppearanceForm) {
            await channelAPI.updateWebchat(linkedWidget.id, widgetAppearanceForm).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Save before exit error:', err);
      }
    }
  }, [id, flowName, platform, integrationId, flowData, linkedWidget, widgetAppearanceForm, isChatWidgetFlow, isSequence, isUserInputFlow]);

  /* ── Go back to origin page ───────────────────────────────── */
  const handleGoBack = useCallback(async () => {
    await flushAutoSave();

    // 1. Explicit return URL from caller or session
    if (returnUrl) {
      try {
        sessionStorage.removeItem('flow_builder_return_url');
        sessionStorage.removeItem('flow_builder_return_label');
      } catch { /* sessionStorage unavailable (private mode / blocked) — ignoring is intended */ }
      navigate(returnUrl, { state: referrerState });
      return;
    }

    // 2. Previous history entry in this tab session
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }

    // 3. Fallback
    navigate('/bots');
  }, [flushAutoSave, returnUrl, referrerState, navigate]);

  /* ── Auto-Layout / Rearrange Flow ───────────────────────── */
  const handleAutoLayout = useCallback(() => {
    const currentNodes = nodesRef.current || nodes;
    const currentEdges = edgesRef.current || edges;
    const layouted = getAutoLayoutedNodes(currentNodes, currentEdges);
    setNodes(layouted);
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        type: 'default',
        animated: false,
        sourceHandle: (e.sourceHandle === 'default' || e.sourceHandle === 'bottom') ? undefined : e.sourceHandle,
        targetHandle: (e.targetHandle === 'default' || e.targetHandle === 'top') ? undefined : e.targetHandle,
      }))
    );
    setTimeout(() => {
      fitView({ padding: 0.25, duration: 400 });
    }, 50);
  }, [nodes, edges, setNodes, setEdges, fitView]);

  /* ── Show the exact element(s) with a problem ─────────────────
     Every failure that belongs to an element — missing data, or a reference to another bot's
     Sequence / form / flow, whether caught here or refused by the server — ends up here, so the
     element is ALWAYS flagged red, selected, opened in the panel (for a Message Block: the exact
     element inside it) and brought into view. problems: [{ nodeId, itemId?, message }] */
  const scopeRef = useRef({});
  scopeRef.current = { sequencesList, userInputFlows, flowsList, scopeReady };

  const surfaceProblems = useCallback((problems, { title, intro, confirmText = 'Show me' }) => {
    if (!problems.length) return;
    const byNode = new Map();
    problems.forEach((pr) => { if (pr.nodeId && !byNode.has(pr.nodeId)) byNode.set(pr.nodeId, pr); });

    setNodes((nds) => nds.map((n) => {
      const pr = byNode.get(n.id);
      return { ...n, data: { ...n.data, _validationError: pr ? pr.message : null, _errorItemId: pr ? (pr.itemId || null) : null } };
    }));

    const first = problems.find((pr) => nodesRef.current?.some((n) => n.id === pr.nodeId)) || problems[0];
    const target = (nodesRef.current || []).find((n) => n.id === first.nodeId);
    if (target) {
      setSelectedNode({ ...target, data: { ...target.data, _validationError: first.message, _errorItemId: first.itemId || null } });
      // let the red state render, then bring the element into view
      setTimeout(() => fitView({ nodes: [{ id: first.nodeId }], padding: 0.6, maxZoom: 1, duration: 450 }), 80);
    }

    const shown = problems.slice(0, 5);
    Swal.fire({
      title,
      html: `
        <div style="text-align: left; font-size: 13px; color: #475569; line-height: 1.5;">
          <p style="margin-bottom: 8px;">${escapeHtml(intro)}</p>
          <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 10px 12px; color: #b91c1c; font-weight: 600;">
            ${shown.map((pr) => `<div style="margin-bottom: 4px;">${escapeHtml(pr.message)}</div>`).join('')}
          </div>
          <p style="margin-top: 8px; font-size: 11px; color: #94a3b8;">The first one is selected on the canvas${problems.length > 1 ? ` — ${problems.length - 1} more are marked in red.` : '.'}</p>
        </div>`,
      icon: 'warning',
      confirmButtonText: confirmText,
      confirmButtonColor: '#4f46e5',
    });
  }, [setNodes, fitView]);

  // As soon as this bot's own lists are loaded, mark elements that point at another bot's component.
  const scopeCheckedFor = useRef('');
  useEffect(() => {
    if (loading || isUserInputFlow || isSequence) return;
    if (!(scopeReady.seq && scopeReady.uif && scopeReady.flows)) return;
    const key = `${id}:${integrationId}`;
    if (scopeCheckedFor.current === key) return;
    scopeCheckedFor.current = key;
    const foreign = findForeignRefs(nodesRef.current || [], { sequences: sequencesList, userInputFlows, flows: flowsList });
    if (!foreign.length) return;
    const byNode = new Map(foreign.map((f) => [f.nodeId, f]));
    setNodes((nds) => nds.map((n) => (byNode.has(n.id) && !n.data._validationError
      ? { ...n, data: { ...n.data, _validationError: byNode.get(n.id).message, _errorItemId: byNode.get(n.id).itemId || null } }
      : n)));
  }, [loading, id, integrationId, isUserInputFlow, isSequence, scopeReady, sequencesList, userInputFlows, flowsList, setNodes]);

  /* ── Manual save (with strict data validation) ─────────── */
  // Memoised because drillBackToMain depends on it; an inline function here
  // would change identity every render and defeat that useCallback entirely.
  const handleSave = useCallback(async () => {
    try {
      // 1. Validate all components have required data
      const currentNodes = nodesRef.current || [];
      const invalidList = [];
      currentNodes.forEach((n) => {
        const err = validateNodeData(n);
        if (err) invalidList.push({ node: n, error: err });
      });

      // Sequences are strictly one-way broadcasts — enforced structurally as a
      // single linear chain, same way a `question` node's choice answers
      // already never branch the graph, just applied to the whole canvas here.
      if (isSequence) {
        const branchNodeId = findFirstBranchingNodeId(currentNodes, edgesRef.current || []);
        if (branchNodeId) {
          const branchNode = currentNodes.find((n) => n.id === branchNodeId);
          Swal.fire({
            title: 'Sequences Can\'t Branch',
            html: `<div style="text-align:left; font-size:13px; color:#475569;">"<strong>${branchNode?.data?.label || branchNode?.type}</strong>" has more than one outgoing connection. A Sequence is a single straight line of steps — remove the extra connection before saving.</div>`,
            icon: 'warning',
            confirmButtonText: 'OK',
            confirmButtonColor: '#4f46e5',
          });
          setSelectedNode(branchNode || null);
          return;
        }
      }

      // Same bot-scope rule the server enforces — caught here so the exact element is shown before any request.
      const scope = scopeRef.current;
      const foreign = (isSequence || isUserInputFlow) ? [] : findForeignRefs(currentNodes, {
        sequences: scope.scopeReady?.seq ? scope.sequencesList : null,
        userInputFlows: scope.scopeReady?.uif ? scope.userInputFlows : null,
        flows: scope.scopeReady?.flows ? scope.flowsList : null,
      });

      const problems = invalidList.map(({ node, error }) => ({
        nodeId: node.id,
        itemId: node.type === 'messageBlock' ? validateMessageBlock(node.data || {}).itemId : null,
        message: `${node.data?.label || node.type}: ${error}`,
      }));
      foreign.forEach((f) => { if (!problems.some((pr) => pr.nodeId === f.nodeId)) problems.push(f); });

      if (problems.length > 0) {
        surfaceProblems(problems, invalidList.length > 0
          ? { title: 'Missing Component Data', intro: 'The flow cannot be saved because some components have missing data:', confirmText: 'Fill In Data' }
          : { title: 'Wrong bot account', intro: "The flow cannot be saved because it uses components that don't belong to this bot account:", confirmText: 'Fix it' });
        return;
      }

      setSaving(true);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      let triggerKeyword = flowData?.trigger_keyword || '';
      const startNode = currentNodes.find((n) => n.type === 'start');
      const isWidget = Boolean(startNode?.data?.chatWidgetStart || isChatWidgetFlow);
      const triggerType = isWidget
        ? 'CHAT_WIDGET'
        : (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
      if (isWidget) {
        triggerKeyword = '';
      } else if (startNode?.data?.keywords) {
        triggerKeyword = Array.isArray(startNode.data.keywords)
          ? startNode.data.keywords.join(',')
          : startNode.data.keywords;
      }

      const serializedNodes = JSON.stringify(currentNodes.map((n) => {
        const { _unsupported, _validationError, _errorItemId, ...rest } = n.data;
        return { ...n, data: rest };
      }));

      if (isSequence) {
        // No trigger/integration — see the note in flushAutoSave above.
        await sequenceAPI.update(id, {
          name: flowName,
          nodes_json: serializedNodes,
          edges_json: JSON.stringify(edges),
        });
      } else if (isUserInputFlow) {
        // No trigger/integration — see the note in flushAutoSave above.
        await userInputFlowAPI.update(id, {
          name: flowName,
          nodes_json: serializedNodes,
          edges_json: JSON.stringify(edges),
        });
      } else {
        await flowAPI.update(id, {
          name: flowName,
          platform,
          integration_id: integrationId || null,
          trigger_type: triggerType,
          trigger_keyword: triggerKeyword,
          nodes_json: serializedNodes,
          edges_json: JSON.stringify(edges),
        });
        if (linkedWidget && widgetAppearanceForm) {
          await channelAPI.updateWebchat(linkedWidget.id, widgetAppearanceForm).catch(() => {});
        }
      }
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 2500);
      if (drilledIn) setUifDirty(false);

      const currentPlatformKey = (platform || 'WEBCHAT').toUpperCase();
      const currentTheme = PLATFORM_SAVE_THEMES[currentPlatformKey] || PLATFORM_SAVE_THEMES.WEBCHAT;
      const platformLabel = getPlatformMeta(platform).label || 'Channel';

      Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2600,
        timerProgressBar: true,
        background: 'transparent',
        customClass: {
          popup: '!p-0 !bg-transparent !shadow-none !border-none',
        },
        html: `
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 18px;
            border-radius: 12px;
            background: #ffffff;
            border: 1.5px solid ${currentTheme.border};
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04), ${currentTheme.shadow};
            font-family: inherit;
          ">
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 8px;
              background: ${currentTheme.badgeBg};
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${currentTheme.iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div style="display: flex; flex-direction: column; text-align: left;">
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Flow Saved Successfully
              </div>
              <div style="font-size: 11.5px; font-weight: 500; color: #64748b; margin-top: 1px;">
                Changes live on <span style="font-weight: 700; color: ${currentTheme.iconColor};">${platformLabel}</span>
              </div>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error('Save failed:', err);
      const refused = err?.response?.data;
      if (refused?.code === 'BOT_SCOPE_VIOLATION' && Array.isArray(refused.violations) && refused.violations.length) {
        surfaceProblems(refused.violations, { title: 'Wrong bot account', intro: "The flow cannot be saved because it uses components that don't belong to this bot account:", confirmText: 'Fix it' });
        return;
      }
      Swal.fire({
        title: 'Save Failed',
        text: err?.response?.data?.message || err.message || 'Could not save flow.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setSaving(false);
    }
  }, [
    id, isSequence, isUserInputFlow, edges, flowName, flowData,
    platform, integrationId, drilledIn, linkedWidget, widgetAppearanceForm, isChatWidgetFlow, surfaceProblems,
  ]);

  // Fresh Start + Question pair for a brand-new User Input Flow — matches what a
  // linear form needs to open ready-to-fill rather than as a bare canvas. Shared
  // by the initial-load effect (a UIF row with no nodes yet) and drillIntoUif
  // (a just-created one, same situation).
  const buildDefaultUifNodesEdges = useCallback(() => {
    const startId = generateNodeId('start');
    const qId = generateNodeId('question');
    const seededNodes = [
      { id: startId, type: 'start', position: { x: 180, y: 140 },
        data: { ...DEFAULT_NODE_DATA.start, uifStart: true, label: 'Form Start' } },
      { id: qId, type: 'question', position: { x: 560, y: 140 },
        data: { ...DEFAULT_NODE_DATA.question } },
    ];
    const seededEdges = [{
      id: `e_${startId}_${qId}`,
      source: startId, sourceHandle: 'next-step', target: qId,
      type: 'default', animated: false,
    }];
    return { nodes: seededNodes, edges: seededEdges };
  }, []);

  // ── Drill in: swap this SAME mounted canvas to a User Input Flow's own
  // nodes/edges, in place — no navigate(), no remount. See the comment on
  // `drilledIn` above for why this exists.
  const drillIntoUif = useCallback(async (uifId, uifNameHint = '') => {
    const snapshot = {
      id, isUserInputFlow, flowName, platform, integrationId, flowData,
      nodes: nodesRef.current || [],
      edges: edgesRef.current || [],
      viewport: getViewport(),
    };

    let uifNodes = [];
    let uifEdges = [];
    let uifNameFinal = uifNameHint;
    let uifRow = null;
    try {
      const res = await userInputFlowAPI.getOne(uifId);
      uifRow = res.data?.userInputFlow || null;
      uifNodes = typeof uifRow?.nodes_json === 'string' ? JSON.parse(uifRow.nodes_json) : (uifRow?.nodes_json || []);
      uifEdges = typeof uifRow?.edges_json === 'string' ? JSON.parse(uifRow.edges_json) : (uifRow?.edges_json || []);
      uifNameFinal = uifRow?.name || uifNameHint;
    } catch (err) {
      console.error('Failed to load User Input Flow:', err);
    }

    if (!uifNodes.length) {
      const seeded = buildDefaultUifNodesEdges();
      uifNodes = seeded.nodes;
      uifEdges = seeded.edges;
    } else {
      // Stamp uifStart on load, same as the route-based load effect does, so a
      // form saved before this flag existed still validates/renders correctly.
      uifNodes = uifNodes.map((n) => (n.type === 'start' ? { ...n, data: { ...n.data, uifStart: true } } : n));
    }

    setParentContext(snapshot);
    setDrilledIn({ uifId, uifName: uifNameFinal });
    setFlowName(uifNameFinal || 'Untitled Form');
    setFlowData(uifRow);
    skipNextDirtyRef.current = true;
    setNodes(uifNodes);
    setEdges(uifEdges);
    setSelectedNode(null);
    setUifDirty(false);
    historyRef.current = [];
    historyIndexRef.current = -1;
    pushHistory(uifNodes, uifEdges);
    setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
  }, [id, isUserInputFlow, flowName, platform, integrationId, flowData, getViewport, buildDefaultUifNodesEdges, setNodes, setEdges, fitView, pushHistory]);

  // ── Drill back out: restore the Main Flow's exact snapshot. Asks first if the
  // User Input Flow being left has unsaved changes (Save / Discard / Cancel) —
  // per the user's explicit choice, never silently auto-saves or discards.
  const drillBackToMain = useCallback(async () => {
    if (!parentContext) return;

    const restoreParent = () => {
      setDrilledIn(null);
      setFlowName(parentContext.flowName);
      setPlatform(parentContext.platform);
      setIntegrationId(parentContext.integrationId);
      setFlowData(parentContext.flowData);
      setNodes(parentContext.nodes);
      setEdges(parentContext.edges);
      setSelectedNode(null);
      setUifDirty(false);
      historyRef.current = [];
      historyIndexRef.current = -1;
      pushHistory(parentContext.nodes, parentContext.edges);
      setParentContext(null);
      setTimeout(() => {
        if (parentContext.viewport) setViewport(parentContext.viewport);
        else fitView({ padding: 0.25, duration: 300 });
      }, 60);
    };

    if (!uifDirty) {
      restoreParent();
      return;
    }

    const result = await Swal.fire({
      title: 'Save changes to this form?',
      text: `You have unsaved changes in "${flowName || 'this User Input Flow'}".`,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Save & Go Back',
      denyButtonText: "Discard",
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
      denyButtonColor: '#ef4444',
    });

    if (result.isConfirmed) {
      await handleSave();
      restoreParent();
    } else if (result.isDenied) {
      restoreParent();
    }
    // Cancel (or dismiss): do nothing — stay exactly where they are.
  }, [parentContext, uifDirty, flowName, handleSave, setNodes, setEdges, setViewport, fitView, pushHistory]);

  const connectingNodeRef = useRef(null);
  const [quickPicker, setQuickPicker] = useState(null);

  /* ── Edge connection ────────────────────────────────────── */
  const onConnect = useCallback(
    (params) => {
      // The "Add Section" handle on a List Menu node isn't a real wire — it's
      // a drag-triggered UI action (see onConnectEnd below), so never let it
      // create an edge even if the drag happens to land on a valid target.
      if (typeof params.sourceHandle === 'string' && params.sourceHandle.startsWith('add-section-')) return;
      setEdges((eds) => {
        const filtered = eds.filter(
          (edge) => !(edge.source === params.source && (edge.sourceHandle || null) === (params.sourceHandle || null))
        );
        return addEdge({
          ...params,
          type: 'default',
          animated: false,
        }, filtered);
      });
    },
    [setEdges]
  );

  // Appends a new (empty-titled) section + one empty item to a List Menu
  // node's Nth list — the drag-triggered equivalent of the panel's own
  // "Add Section" button, respecting the same 10-section / 10-item-total caps.
  const addSectionToListNode = useCallback((nodeId, listIndex) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n;
      const lists = normalizeListMenuData(n.data);
      const list = lists[listIndex];
      if (!list || list.sections.length >= 10 || list.items.length >= 10) return n;
      const newLists = lists.map((l, li) => (li !== listIndex ? l : { ...l, sections: [...l.sections, { title: '', items: [{ title: '', action: 'flow' }] }] }));
      return { ...n, data: { ...n.data, lists: newLists } };
    }));
  }, [setNodes]);

  /* ── Drag to Connect: onConnectStart & onConnectEnd ──────── */
  const onConnectStart = useCallback((_, { nodeId, handleId, handleType }) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeRef.current) return;

      // "Add Section" handle: dragging from it — wherever the drag ends,
      // empty canvas or right on top of another node — just adds a section
      // to this same list. It never opens the quick-add menu and never
      // creates an edge, so this is checked before the pane/node distinction
      // below even applies.
      const { nodeId: dragNodeId, handleId: dragHandleId } = connectingNodeRef.current;
      if (typeof dragHandleId === 'string' && dragHandleId.startsWith('add-section-')) {
        addSectionToListNode(dragNodeId, Number(dragHandleId.slice('add-section-'.length)));
        connectingNodeRef.current = null;
        return;
      }

      // Only truly empty canvas counts as "open the quick-add list" — every
      // node/handle on the canvas is a DOM descendant of .react-flow__pane,
      // so the previous .closest('.react-flow__pane') fallback matched
      // almost anything you could drop on (including a real handle), which
      // is why the list kept opening even after successfully connecting to
      // an existing node. Only the exact pane element itself should count.
      const targetIsPane = event.target?.classList?.contains('react-flow__pane');

      // Dropped on an existing element: connect straight to it — never open
      // the quick-add menu. Landing exactly on a target handle is already
      // wired by React Flow's own onConnect; dropping anywhere else on the
      // node's card (body, header, hover actions…) is wired here.
      const dropEl = document.elementFromPoint(
        event.clientX ?? event.changedTouches?.[0]?.clientX ?? 0,
        event.clientY ?? event.changedTouches?.[0]?.clientY ?? 0,
      ) || event.target;
      const dropNodeEl = dropEl?.closest?.('.react-flow__node');
      if (dropNodeEl && !targetIsPane) {
        const targetNodeId = dropNodeEl.getAttribute('data-id');
        const src = connectingNodeRef.current;
        const onHandle = !!dropEl.closest('.react-flow__handle');
        if (!onHandle && targetNodeId && src.handleType === 'source' && targetNodeId !== src.nodeId) {
          onConnect({ source: src.nodeId, sourceHandle: src.handleId || null, target: targetNodeId, targetHandle: null });
        }
        connectingNodeRef.current = null;
        return;
      }

      if (targetIsPane) {
        const clientX = event.clientX || ('changedTouches' in event ? event.changedTouches[0]?.clientX : 0);
        const clientY = event.clientY || ('changedTouches' in event ? event.changedTouches[0]?.clientY : 0);
        const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });

        setQuickPicker({
          x: Math.min(window.innerWidth - 300, Math.max(20, clientX)),
          y: Math.min(window.innerHeight - 400, Math.max(20, clientY)),
          flowPosition,
          sourceNodeId: connectingNodeRef.current.nodeId,
          sourceHandleId: connectingNodeRef.current.handleId,
          sourceHandleType: connectingNodeRef.current.handleType,
        });
      }
      connectingNodeRef.current = null;
    },
    [screenToFlowPosition, addSectionToListNode, onConnect]
  );

  const handleSelectQuickPicker = useCallback(
    (type) => {
      if (!quickPicker) return;

      const newNodeId = generateNodeId(type);
      const newNode = {
        id: newNodeId,
        type,
        position: quickPicker.flowPosition,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          ...DEFAULT_NODE_DATA[type],
          _unsupported: !isNodeSupportedOnPlatform(type, platform),
        },
      };

      const newEdge = {
        id: `e_${quickPicker.sourceNodeId}_${newNodeId}_${Date.now()}`,
        source: quickPicker.sourceNodeId,
        sourceHandle: quickPicker.sourceHandleId || undefined,
        target: newNodeId,
        type: 'default',
        animated: false,
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => {
        const filtered = eds.filter(
          (edge) => !(edge.source === quickPicker.sourceNodeId && (edge.sourceHandle || null) === (quickPicker.sourceHandleId || null))
        );
        return [...filtered, newEdge];
      });
      setSelectedNode(newNode);
      setQuickPicker(null);
    },
    [quickPicker, setNodes, setEdges, platform]
  );

  /* ── Node click → select for properties ────────────────── */
  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
  }, []);

  /* ── Canvas click → deselect ────────────────────────────── */
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  /* ── Drag-and-drop from palette ─────────────────────────── */
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode = {
        id: generateNodeId(type),
        type,
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          ...DEFAULT_NODE_DATA[type],
          _unsupported: !isNodeSupportedOnPlatform(type, platform),
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes, platform]
  );

  /* ── Update node data (from properties panel) ──────────── */
  const handleUpdateNodeData = useCallback(
    (nodeId, newData) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            const updated = {
              ...n,
              data: {
                ...newData,
                _unsupported: !isNodeSupportedOnPlatform(n.type, platform),
              },
            };
            const err = validateNodeData(updated);
            updated.data._validationError = err || null;
            return updated;
          }
          return n;
        })
      );
      // Keep selectedNode in sync
      setSelectedNode((prev) => {
        if (!prev || prev.id !== nodeId) return prev;
        const updated = {
          ...prev,
          data: {
            ...newData,
            _unsupported: !isNodeSupportedOnPlatform(prev.type, platform),
          },
        };
        const err = validateNodeData(updated);
        updated.data._validationError = err || null;
        return updated;
      });
    },
    [setNodes, platform]
  );

  /* ── Delete node ────────────────────────────────────────── */
  const handleDeleteNode = useCallback(
    (nodeId) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (!target) return;
      if (target.type === 'start') {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: 'The Start Trigger node cannot be deleted.',
          showConfirmButton: false,
          timer: 2500,
        });
        return;
      }
      const nextNodes = nodes.filter((n) => n.id !== nodeId);
      const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      setNodes(nextNodes);
      setEdges(nextEdges);
      pushHistory(nextNodes, nextEdges);
      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
    },
    [nodes, edges, setNodes, setEdges, pushHistory, setSelectedNode]
  );

  /* ── Duplicate node ─────────────────────────────────────── */
  const handleDuplicateNode = useCallback(
    (nodeId) => {
      const source = nodes.find((n) => n.id === nodeId);
      if (!source) return;

      if (source.type === 'start') {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: 'The Start Trigger node cannot be duplicated.',
          showConfirmButton: false,
          timer: 2500,
        });
        return;
      }

      const newId = generateNodeId(source.type);
      const clonedNode = {
        ...JSON.parse(JSON.stringify(source)),
        id: newId,
        selected: true,
        position: {
          x: (source.position?.x || 0) + 30,
          y: (source.position?.y || 0) + 30,
        },
      };

      const nextNodes = nodes
        .map((n) => ({ ...n, selected: false }))
        .concat(clonedNode);

      setNodes(nextNodes);
      setSelectedNode(clonedNode);
      pushHistory(nextNodes, edges);
    },
    [nodes, edges, setNodes, pushHistory, setSelectedNode]
  );

  // Guided "+ Add Question" hover action on a Question node — auto-creates and
  // auto-connects the next Question node via its "Next Question" handle, instead
  // of dragging one in from the palette and manually wiring it (the exact manual
  // step that's caused edge-loss bugs elsewhere in this builder). Replaces any
  // existing "next-step" edge from this node so it never ends up with two.
  const handleAddQuestionAfter = useCallback(
    (sourceNodeId) => {
      const source = nodes.find((n) => n.id === sourceNodeId);
      if (!source) return;

      const newId = generateNodeId('question');
      const newNode = {
        id: newId,
        type: 'question',
        position: { x: (source.position?.x || 0) + 320, y: source.position?.y || 0 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { ...DEFAULT_NODE_DATA.question },
      };
      const newEdge = {
        id: `e_${sourceNodeId}_${newId}_${Date.now()}`,
        source: sourceNodeId, sourceHandle: 'next-step', target: newId,
        type: 'default', animated: false,
      };

      const nextNodes = nodes.concat(newNode);
      const nextEdges = edges
        .filter((e) => !(e.source === sourceNodeId && (e.sourceHandle || null) === 'next-step'))
        .concat(newEdge);

      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNode(newNode);
      pushHistory(nextNodes, nextEdges);
    },
    [nodes, edges, setNodes, setEdges, pushHistory, setSelectedNode]
  );

  // ── Attach Sequence (Start node picker) ──────────────────────────────────
  // Adds a real "Start Sequence" node as its OWN separate branch off Start —
  // a second wire from a dedicated "attach-sequence" handle, alongside
  // (never replacing or splicing into) Start's existing "Then" connection to
  // the real conversation. The two are genuinely independent: the flow's own
  // path is completely untouched, and the engine (flowEngine.js's `case
  // "start"`) fires the enrollment as a side effect without ever making this
  // node part of the executed conversation path — see the note there for why
  // a second edge off the SAME handle wouldn't work (this engine resolves
  // "the next node" as a single pointer, not a true multi-branch walk).
  const handleAttachSequenceToStart = useCallback(
    (startNodeId, sequenceId, sequenceName) => {
      const startNode = nodes.find((n) => n.id === startNodeId);
      if (!startNode) return;

      const newId = generateNodeId('startSequenceAction');
      const newNode = {
        id: newId,
        type: 'startSequenceAction',
        // Below the Start node rather than inline to its right — reads as a
        // branch, not a step in the "Then" conversation path drawn straight
        // across.
        position: { x: (startNode.position?.x || 0) + 40, y: (startNode.position?.y || 0) + 200 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { ...DEFAULT_NODE_DATA.startSequenceAction, sequenceId, sequenceName },
      };
      const newEdge = {
        id: `e_${startNodeId}_${newId}_${Date.now()}`,
        source: startNodeId, sourceHandle: 'attach-sequence', target: newId,
        type: 'default', animated: false,
        // Same neutral slate as every other wire on the canvas — no special
        // color for this connection.
      };

      const nextNodes = nodes.concat(newNode);
      const nextEdges = edges.concat(newEdge);

      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNode(newNode);
      pushHistory(nextNodes, nextEdges);
    },
    [nodes, edges, setNodes, setEdges, pushHistory, setSelectedNode]
  );

  // The Start node's "Attach Sequence" UI needs to know whether it already has
  // a Start Sequence node wired to its dedicated branch handle (to show
  // "Edit" instead of the picker) — computed once here rather than passing
  // the whole nodes/edges graph down through PropertiesPanel/StartNodeProperties
  // for one field.
  const startAttachedSequenceNode = useMemo(() => {
    if (isSequence || isUserInputFlow) return null;
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) return null;
    const edge = edges.find((e) => e.source === startNode.id && e.sourceHandle === 'attach-sequence');
    if (!edge) return null;
    const nextNode = nodes.find((n) => n.id === edge.target);
    return nextNode?.type === 'startSequenceAction' ? nextNode : null;
  }, [nodes, edges, isSequence, isUserInputFlow]);

  const handleSelectSequenceNode = useCallback(
    (nodeId) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (target) setSelectedNode(target);
    },
    [nodes, setSelectedNode]
  );

  /* ── Keep selectedNode synced with nodes state ──────────── */
  useEffect(() => {
    if (selectedNode) {
      const current = nodes.find((n) => n.id === selectedNode.id);
      if (current && current.data !== selectedNode.data) {
        setSelectedNode(current);
      }
      if (!current) {
        setSelectedNode(null);
      }
    }
  }, [nodes, selectedNode]);

  /* ── Button source nodes (for transparency effect) ──────── */
  // Nodes that have at least one btn-handle wire going out become semi-transparent
  // Must be declared before any early return to satisfy React hooks rules
  const buttonTargetNodes = useMemo(() => {
    const set = new Set();
    edges.forEach((e) => {
      if (e.sourceHandle && e.sourceHandle.startsWith('btn-')) {
        if (e.source) set.add(e.source);
      }
    });
    return set;
  }, [edges]);

  /* ── Empty source nodes (for edge transparency effect) ───── */
  // Nodes that have no text and no buttons have their outgoing wires rendered transparent
  const emptySourceNodes = useMemo(() => {
    const set = new Set();
    nodes.forEach((n) => {
      // Check message / text content
      const msg = (n.data?.message || n.data?.caption || n.data?.text || '').trim();
      // Check buttons
      const btns = n.data?.buttons || [];
      const hasButtons = Array.isArray(btns) && btns.length > 0;
      // If node is a message/buttons/text/image card and has neither message nor buttons, consider it empty
      if (!msg && !hasButtons) {
        set.add(n.id);
      }
    });
    return set;
  }, [nodes]);

  /* ── Loading screen ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="fb-loading">
        <Loader2 size={40} className="fb-loading-spinner" />
        <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7 }}>Loading flow builder...</span>
      </div>
    );
  }

  return (
    <FlowNodeActionsContext.Provider value={{
      onDuplicate: handleDuplicateNode,
      onDelete: handleDeleteNode,
      onSelectNode: (nodeId, action) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (action === 'addTrigger') {
          // Select node and set a temporary flag so properties panel auto-adds a trigger
          setSelectedNode({ ...node, data: { ...node.data, _addTriggerNow: true } });
        } else {
          setSelectedNode(node);
        }
      },
      onUpdateNodeData: handleUpdateNodeData,
      onAddQuestionAfter: handleAddQuestionAfter,
      buttonTargetNodes,
      emptySourceNodes,
      sequencesList,
      flowsList,
      currentIntegrationId: integrationId,
      currentFlowId: (!isUserInputFlow && !isSequence) ? Number(id) : null,
      currentPlatform: platform,
      isChatWidgetFlow,
    }}>
      <div className="flow-builder-root">
      {/* ── Flow Top Bar ────────────────────────────────── */}
      <div
        className="flow-topbar"
        style={{
          height: 56,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 30,
          gap: 12,
        }}
      >
        {/* Left: Breadcrumbs & Flow Name & Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            type="button"
            className="flow-tool-btn"
            onClick={drilledIn ? drillBackToMain : handleGoBack}
            title={drilledIn ? `Back to ${parentContext?.flowName || 'Main Flow'}` : `Back to ${backLabel}`}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8fafc',
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} />
          </button>

          {/* Editing a User Input Flow drilled into from a Main Flow: the arrow
              and this segment go back ONE level (to the Main Flow, in-memory,
              no navigate()) rather than skipping past it — the outer "back to
              Bot Manager" breadcrumb is hidden while drilled in so leaving isn't
              two different meanings for the same arrow. See drillBackToMain. */}
          {drilledIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7c3aed', fontWeight: 700 }}>
              <span style={{ cursor: 'pointer' }} onClick={drillBackToMain} title="Back to Main Flow">
                {parentContext?.flowName || 'Main Flow'}
              </span>
              <span style={{ color: '#c4b5fd' }}>&gt;</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
              <span style={{ fontWeight: 500, cursor: 'pointer' }} onClick={handleGoBack} title={`Back to ${backLabel}`}>
                {backLabel}
              </span>
              <span>&gt;</span>
            </div>
          )}

          <input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            onBlur={triggerAutoSave}
            spellCheck={false}
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: '#0f172a',
              border: '1px solid transparent',
              borderRadius: 6,
              padding: '4px 8px',
              outline: 'none',
              maxWidth: 220,
              background: 'transparent',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#ffffff';
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.background = 'transparent';
            }}
          />

          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 12,
              background: isLive ? '#dcfce7' : '#f1f5f9',
              color: isLive ? '#15803d' : '#64748b',
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
            }}
          >
            {isLive ? 'Live' : 'Draft'}
          </span>
        </div>

        {/* Center: Undo/Redo & Auto Layout & Connected Platform Channel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndexRef.current <= 0}
            title="Undo"
            className="group"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1.5px solid #e2e8f0',
              background: '#ffffff',
              color: historyIndexRef.current <= 0 ? '#cbd5e1' : '#475569',
              cursor: historyIndexRef.current <= 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (historyIndexRef.current > 0) {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.transform = 'translateY(-0.5px)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndexRef.current >= historyRef.current.length - 1}
            title="Redo"
            className="group"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1.5px solid #e2e8f0',
              background: '#ffffff',
              color: historyIndexRef.current >= historyRef.current.length - 1 ? '#cbd5e1' : '#475569',
              cursor: historyIndexRef.current >= historyRef.current.length - 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (historyIndexRef.current < historyRef.current.length - 1) {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.transform = 'translateY(-0.5px)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Redo2 size={14} />
          </button>

          <button
            onClick={handleAutoLayout}
            className="flow-layout-btn"
            title="Auto-rearrange components cleanly"
          >
            <LayoutGrid size={14} style={{ color: '#4f46e5' }} />
            <span>Auto Layout</span>
          </button>

          {/* Platform / Account link */}
          <a
            href={platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${currentAccountName || getPlatformMeta(platform).label} in new tab`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 14px',
              borderRadius: 8,
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              color: '#334155',
              fontSize: 12.5,
              textDecoration: 'none',
              fontWeight: 600,
              height: 34,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.transform = 'translateY(-0.5px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <PlatformIcon platform={platform} size={18} />
            <span>{currentAccountName || getPlatformMeta(platform).defaultName}</span>
            <ExternalLink size={11} style={{ color: '#94a3b8', marginLeft: 2 }} />
          </a>
        </div>

        {/* Right: Saved Status, Preview Toggle Button, and Set Live Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Autosave status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
            {autoSaveStatus === 'saving' && (
              <>
                <Loader2 size={12} className="spin" />
                <span>Saving...</span>
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <Check size={13} style={{ color: '#10b981' }} />
                <span style={{ color: '#10b981', fontWeight: 600 }}>Saved</span>
              </>
            )}
          </div>

          {/* Widget Appearance — only for a WEBCHAT flow linked to a Chat
              Widget (see ChatWidgetManager.jsx, which creates the two
              together). Styled identically to the Preview toggle beside it. */}
          {linkedWidget && (
            <button
              type="button"
              className={`flow-preview-toggle-btn ${widgetAppearanceOpen ? 'active' : ''}`}
              onClick={() => setWidgetAppearanceOpen((prev) => { if (!prev) setPreviewOpen(false); return !prev; })}
              title="Chat widget logo, colors, and behavior"
            >
              <Palette size={14} />
              <span>Widget Appearance</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
            </button>
          )}

          {/* Interactive Device Preview Toggle */}
          <button
            type="button"
            className={`flow-preview-toggle-btn ${previewOpen ? 'active' : ''}`}
            onClick={() => setPreviewOpen((prev) => { if (!prev) setWidgetAppearanceOpen(false); return !prev; })}
            title="Toggle interactive device simulation preview"
          >
            <Smartphone size={14} />
            <span>Preview</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
          </button>

          {/* Save Button with dynamic light-color channel theme, generous padding, and gorgeous micro-effects */}
          {(() => {
            const currentPlatformKey = (platform || 'WEBCHAT').toUpperCase();
            const theme = PLATFORM_SAVE_THEMES[currentPlatformKey] || PLATFORM_SAVE_THEMES.WEBCHAT;

            return (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                title={`Save flow for ${currentAccountName || getPlatformMeta(platform).label}`}
                className="group relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-lg text-[13px] font-bold h-[34px] cursor-pointer transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none"
                style={{
                  padding: '7px 22px',
                  background: theme.bg,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.color,
                  boxShadow: theme.shadow,
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.background = theme.hoverBg;
                    e.currentTarget.style.borderColor = theme.hoverBorder;
                    e.currentTarget.style.boxShadow = theme.hoverShadow;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.background = theme.bg;
                    e.currentTarget.style.borderColor = theme.border;
                    e.currentTarget.style.boxShadow = theme.shadow;
                  }
                }}
              >
                {/* Subtle light sweep shimmer animation across the button */}
                <span
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent)',
                  }}
                />

                {/* Save icon / spinner */}
                {saving ? (
                  <Loader2 size={15} className="animate-spin" style={{ color: theme.iconColor }} />
                ) : (
                  <Save
                    size={15}
                    className="transition-transform duration-200 group-hover:scale-110"
                    style={{ color: theme.iconColor }}
                  />
                )}

                <span className="relative tracking-wide font-bold">{saving ? 'Saving...' : 'Save'}</span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* ── Main Area ───────────────────────────────────────── */}
      <div className="fb-main" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left: Component Palette (always present) */}
        <NodePalette platform={platform} isUserInputFlow={isUserInputFlow} isSequence={isSequence} isBroadcastFlow={isBroadcastFlow} />

        {/* Canvas */}
        <div className="fb-canvas" style={{ flex: 1, position: 'relative', height: '100%' }}>
          {/* Floating hint */}
          <div className="flow-canvas-hint">
            <span>👆 Tap some step to edit</span>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineType="default"
            connectionLineStyle={{ stroke: '#94a3b8', strokeWidth: 2, strokeLinecap: 'round' }}
            defaultSourcePosition={Position.Right}
            defaultTargetPosition={Position.Left}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 0.85 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.15}
            maxZoom={2}
          >
            <Background variant="dots" gap={20} size={1.2} color="#d4d4e8" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              nodeStrokeWidth={3}
              nodeColor={(n) => NODE_COLORS[n.type] || '#6366f1'}
              maskColor="rgba(240, 242, 247, 0.75)"
              style={{ background: '#ffffff', border: '1px solid #e4e4f0' }}
            />
          </ReactFlow>

          {/* Quick Component Picker (opened on drag-to-connect release on empty canvas) */}
          {quickPicker && (
            <QuickComponentPicker
              position={quickPicker}
              onClose={() => setQuickPicker(null)}
              onSelect={handleSelectQuickPicker}
              platform={platform}
              isUserInputFlow={isUserInputFlow}
              isSequence={isSequence}
              isBroadcastFlow={isBroadcastFlow}
            />
          )}
        </div>

        {/* Right Properties Panel (for all nodes including start) */}
        {selectedNode && (
          <PropertiesPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleUpdateNodeData}
            onDelete={handleDeleteNode}
            platform={platform}
            customFields={customFields}
            onCustomFieldCreated={(field) => setCustomFields((prev) => [...prev, field])}
            userInputFlows={userInputFlows}
            onUserInputFlowCreated={(uif) => setUserInputFlows((prev) => [...prev, { ...uif, nodeCount: 0 }])}
            isUserInputFlow={isUserInputFlow}
            sequences={sequencesList}
            onSequenceCreated={(seq) => setSequencesList((prev) => [...prev, seq])}
            isSequence={isSequence}
            isBroadcastFlow={isBroadcastFlow}
            isChatWidgetFlow={isChatWidgetFlow || Boolean(linkedWidget)}
            linkedWidget={linkedWidget}
            widgetAppearanceForm={widgetAppearanceForm}
            onWidgetAppearanceChange={setWidgetAppearanceForm}
            onAddReplyNode={handleAddReplyNode}
            flows={flowsList}
            httpApiCampaigns={httpApiCampaigns}
            currentFlowId={(!isUserInputFlow && !isSequence) ? Number(id) : null}
            flowName={flowName}
            onFlowNameChange={setFlowName}
            onDrillIn={drillIntoUif}
            onAttachSequence={handleAttachSequenceToStart}
            attachedSequenceNode={startAttachedSequenceNode}
            onSelectSequenceNode={handleSelectSequenceNode}
          />
        )}

        {/* Interactive Device Simulation Preview Drawer */}
        <FlowPhonePreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          nodes={nodes}
          edges={edges}
          platform={platform}
          businessName={currentAccountName}
        />

        {/* Chat Widget appearance — logo/colors/position/behavior for the
            Webchat widget this flow replies for. See WidgetAppearancePanel.jsx. */}
        {linkedWidget && widgetAppearanceForm && (
          <WidgetAppearancePanel
            open={widgetAppearanceOpen}
            onClose={() => setWidgetAppearanceOpen(false)}
            form={widgetAppearanceForm}
            onChange={setWidgetAppearanceForm}
          />
        )}
      </div>
    </div>
    </FlowNodeActionsContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN EXPORT (wrapped in ReactFlowProvider)
   ═══════════════════════════════════════════════════════════════════ */

export default function FlowBuilderPage() {
  return (
    <>
      <style>{builderStyles}</style>
      <ReactFlowProvider>
        <FlowBuilderInner />
      </ReactFlowProvider>
    </>
  );
}
