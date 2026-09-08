import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router';
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, useNodesState, useEdgesState,
  addEdge, ReactFlowProvider, useReactFlow, useNodeConnections,
  BaseEdge, EdgeLabelRenderer, MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Save, Loader2, Check, AlertTriangle,
  MessageSquare, ListOrdered, LayoutGrid, CreditCard,
  Layers, Keyboard, GitBranch, Clock, Headphones,
  CircleStop, Play, Type, GripVertical, X, Plus, Trash2,
  ChevronRight, Zap, MousePointerClick, Mail, Phone,
  User, Settings2, CornerDownRight, Image, Upload,
  Video, Music, FileText, Globe, ExternalLink,
  Smartphone, RotateCcw, Undo2, Redo2, ThumbsUp, Sparkles, MoreVertical,
  Copy, ChevronDown, ShoppingBag, HelpCircle, Flag, ClipboardList
} from 'lucide-react';
import FlowPhonePreview from './FlowPhonePreview';
import PlatformIcon, { getPlatformMeta } from '../../Components/Common/PlatformIcon';
import { flowAPI, uploadAPI, integrationAPI, customFieldAPI, userInputFlowAPI, sequenceAPI, labelAPI, googleSheetsAPI } from '../../services/api';
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
    condition: true,
    delay: true,
    webhook: true,
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
    condition: true,
    delay: true,
    webhook: true,
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
    condition: true,
    delay: true,
    webhook: true,
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
    condition: true,
    delay: true,
    webhook: true,
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
    condition: true,
    delay: true,
    webhook: true,
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
    condition: true,
    delay: true,
    webhook: true,
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
  payment: '#16a34a',      // Green
  handoff: '#6366f1',      // Indigo
  end: '#dc2626',          // Soft red
  question: '#0d9488',           // Teal (same family as Collect Input — same concept)
  finalAnswer: '#16a34a',        // Green (a completion, like "end")
  runUserInputFlow: '#7c3aed',   // Violet (a distinct "module call" color)
  startSequenceAction: '#0891b2', // Cyan (a distinct "enroll" color)
  stopSequenceAction: '#dc2626',  // Same red family as "end" — a stop/halt action
  wait: '#64748b',                // Slate — same family as delay, a timing step not content
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
  buttons: MousePointerClick,
  quickReplies: Keyboard,
  listMenu: ListOrdered,
  card: CreditCard,
  carousel: Layers,
  collectInput: Mail,
  condition: GitBranch,
  delay: Clock,
  webhook: Globe,
  payment: ShoppingBag,
  handoff: Headphones,
  end: CircleStop,
  question: HelpCircle,
  finalAnswer: Flag,
  runUserInputFlow: ClipboardList,
  startSequenceAction: Play,
  stopSequenceAction: CircleStop,
  wait: Clock,
};

const PALETTE_CATEGORIES = [
  {
    label: 'Messages',
    items: [
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
      { type: 'payment', label: 'Catalog / Payment' },
    ],
  },
  {
    label: 'Actions',
    items: [
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
      { type: 'text', label: 'Text Message' },
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
      { type: 'text', label: 'Text Message' },
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
  payment:      { label: 'Catalog / Payment', productName: 'Order Product / Catalog', amount: 49.99, currency: 'USD', buttonLabel: '🛍️ View Catalog / Pay', successMessage: '🎉 Order received! We will process it shortly.' },
  handoff:      { label: 'Agent Handoff', message: '' },
  end:          { label: 'End', message: '' },
  runUserInputFlow: { label: 'Run User Input Flow', userInputFlowId: null, userInputFlowName: '' },
  startSequenceAction: { label: 'Start Sequence', sequenceId: null, sequenceName: '' },
  stopSequenceAction: { label: 'Stop Sequence', sequenceId: null, sequenceName: '' },
  // Sequence-only delay step, between two content nodes — see SEQUENCE_PALETTE.
  wait: { label: 'Wait', preset: '5m', customValue: '', customUnit: 'minutes' },
  // The following two only ever appear inside a User Input Flow's own mini-builder:
  question:     { label: 'Question', message: '', answerType: 'keyboard', inputType: 'name', options: [], saveToFieldId: null },
  finalAnswer:  { label: 'Final Answer', message: 'Thanks — that\'s everything I needed!' },
};

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
    padding: 14px 16px 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #9999bb;
    border-bottom: 1px solid #f0f0fa;
    margin-bottom: 4px;
  }
  .fb-palette-category {
    padding: 4px 14px;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9999bb;
    margin-top: 10px;
    margin-bottom: 2px;
  }
  .fb-palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    margin: 1px 6px;
    border-radius: 8px;
    cursor: grab;
    transition: all 0.15s;
    user-select: none;
    color: #1a1a2e;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid transparent;
  }
  .fb-palette-item:hover {
    background: #f0f0fa;
    border-color: #e4e4f0;
    transform: translateX(2px);
  }
  .fb-palette-item:active { cursor: grabbing; }
  .fb-palette-item-icon {
    width: 30px; height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .fb-palette-item-grip {
    margin-left: auto;
    color: #9999bb;
    opacity: 0;
    transition: opacity 0.2s;
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
    width: 220px;
    min-width: 220px;
    max-width: 220px;
    border-radius: 12px;
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
    border-radius: 10px 10px 0 0;
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
    background: rgba(99,102,241,0.07);
    border: 1px solid rgba(99,102,241,0.15);
    font-size: 11px;
    color: #4f46e5;
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
    background: rgba(99,102,241,0.08);
    border: 1px solid rgba(99,102,241,0.15);
    font-size: 10px;
    color: #4f46e5;
    font-weight: 500;
  }

  /* ── Condition node ─────────────────────────────────────────── */
  .fb-node-condition {
    min-width: 160px;
    max-width: 220px;
    border-radius: 12px;
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
  .react-flow__handle-left { left: -5px !important; }

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
    left: -5px !important;
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
    stroke: #64748b !important;
    stroke-width: 2 !important;
  }
  .react-flow__edge.selected .react-flow__edge-path {
    stroke: #0f172a !important;
    stroke-width: 2.5 !important;
  }
  .react-flow__edge:hover .react-flow__edge-path {
    stroke: #334155 !important;
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

// Upgrades a listMenu node's data to the current `lists: [{title, buttonText,
// items}]` shape. Flows saved before multi-list support only have a flat
// `items` array at the top level — that becomes a single-list `lists` entry
// here so old data keeps working with zero migration. flowEngine.js keeps its
// own copy of this (frontend/backend can't share a module in this codebase),
// hand-kept in sync — see the note there.
function normalizeListMenuData(data) {
  if (Array.isArray(data?.lists) && data.lists.length > 0) return data.lists;
  if (Array.isArray(data?.items)) {
    return [{ title: data.title || 'Menu Options', buttonText: data.buttonText || 'Options', items: data.items }];
  }
  return [{ title: 'Menu Options', buttonText: 'Options', items: [] }];
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

function validateNodeData(node) {
  if (!node) return null;
  const data = node.data || {};
  switch (node.type) {
    case 'start': {
      // A User Input Flow's / Sequence's Start node has no trigger of its own —
      // a UIF is invoked by a bot Flow's "Run User Input Flow" node, a Sequence
      // by a Start Sequence action — so neither has a keyword to require.
      if (data.uifStart || data.sequenceStart) return null;
      if (data.triggers && data.triggers.length > 0) {
        for (const trg of data.triggers) {
          if (trg.match_type !== 'thumbs_up' && trg.type !== 'first_contact' && trg.type !== 'any') {
            const raw = trg.keywords || (trg.trigger_keyword ? trg.trigger_keyword.split(',') : []);
            const kwList = Array.isArray(raw) ? raw.filter((k) => k && String(k).trim()) : [];
            if (kwList.length === 0) return 'Please set at least one trigger keyword';
          }
        }
        return null;
      }
      if (data.trigger_type === 'keyword' || !data.trigger_type) {
        if (data.match_type === 'thumbs_up') return null;
        const rawKw = data.keywords || (data.trigger_keyword ? data.trigger_keyword.split(',') : []);
        const kwList = Array.isArray(rawKw) ? rawKw.filter((k) => k && String(k).trim()) : [];
        if (kwList.length === 0) return 'Please set at least one trigger keyword';
      }
      return null;
    }

    case 'text':
      if (!data.message || !data.message.trim()) {
        return 'Text Message cannot be empty';
      }
      return null;

    case 'interactive':
      if (!data.message || !data.message.trim()) {
        return 'Message body cannot be empty for Interactive Message';
      }
      if (data.headerType && data.headerType !== 'none' && data.headerType === 'text' && !(data.headerText || '').trim()) {
        return 'Header text is required when Text header is selected';
      }
      if (data.headerType && ['image', 'video', 'document'].includes(data.headerType) && !(data.headerMediaUrl || '').trim()) {
        return 'Header media attachment or URL is required';
      }
      return null;

    case 'image':
      if (!(data.imageUrl || data.mediaUrl || '').trim()) {
        return 'Image URL or uploaded image is required';
      }
      return null;

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

    case 'buttons':
      if (!data.message || !data.message.trim()) {
        return 'Text Message cannot be empty';
      }
      return null;

    case 'quickReplies':
      if (!data.message || !data.message.trim()) {
        return 'Quick replies message cannot be empty';
      }
      const validReplies = (data.replies || []).filter((r) => (typeof r === 'string' ? r : r?.title || '').trim());
      if (validReplies.length === 0) {
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
        const validItems = (list.items || []).filter((it) => (typeof it === 'string' ? it : it?.title || '').trim());
        if (validItems.length === 0) {
          return 'Every list needs at least one item';
        }
        if (validItems.length > 10) {
          return 'A single list cannot have more than 10 items — add another list instead';
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
      const hasValidCard = data.cards.some((c) => (c.title || '').trim() || (c.imageUrl || '').trim());
      if (!hasValidCard) {
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

    case 'wait':
      if (data.preset === 'custom' && !(Number(data.customValue) > 0)) {
        return 'Enter a custom wait duration greater than 0';
      }
      return null;

    case 'finalAnswer':
      return null;

    case 'condition':
      if (!data.variable || !data.variable.trim()) {
        return 'Variable to evaluate is required';
      }
      if (data.value === undefined || String(data.value).trim() === '') {
        return 'Comparison value is required';
      }
      return null;

    case 'delay':
      if (!data.seconds || Number(data.seconds) <= 0) {
        return 'Delay seconds must be greater than 0';
      }
      return null;

    case 'webhook':
      if (!data.url || !data.url.trim()) {
        return 'Webhook URL endpoint is required';
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
      const count = lists.reduce((sum, l) => sum + (l.items || []).length, 0);
      // + a little extra per list beyond the first, for each list's own title row.
      return { width, height: 90 + Math.max(1, count) * 34 + Math.max(0, lists.length - 1) * 26 };
    }
    case 'card':
      return { width, height: 185 };
    case 'condition':
      return { width, height: 145 };
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

  const H_GAP = 70; // Ample, clean horizontal gap between stages
  const V_GAP = 36; // Generous vertical gap between adjacent cards to prevent any cramping
  const OVERLAP_BUFFER = 2; // Tight nudge used only to resolve a collision — not a second V_GAP

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

export const FlowNodeActionsContext = createContext({
  onDuplicate: () => {},
  onDelete: () => {},
  onSelectNode: () => {},
  onUpdateNodeData: () => {},
  onAddQuestionAfter: () => {},
  buttonTargetNodes: new Set(),
  emptySourceNodes: new Set(),
  sequencesList: [],
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
function NodeWrapper({ children, color, label, icon: Icon, selected, data, type, id, hideNextStep = false, width }) {
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
          background: validationError ? '#fef2f2' : `${color}12`,
          borderBottom: `1px solid ${validationError ? '#fecaca' : `${color}22`}`,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: validationError ? '#fee2e2' : `${color}1e`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon && <Icon size={13} style={{ color: validationError ? '#ef4444' : color }} />}
        </div>
        <span style={{ fontWeight: 600, fontSize: '11.5px', color: validationError ? '#b91c1c' : '#1e293b' }}>{label}</span>
      </div>
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
function StartNode({ id, data, selected }) {
  const { onSelectNode } = useContext(FlowNodeActionsContext);
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
          minWidth: 260, maxWidth: 280, width: 270, borderRadius: 20,
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
          minWidth: 260, maxWidth: 280, width: 270, borderRadius: 20,
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
                background: '#0084ff',
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
          color: '#0084ff',
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: 12,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#0084ff';
          e.currentTarget.style.background = '#f0f7ff';
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
      <div className="fb-next-step-row" style={{ marginTop: 14, marginRight: -16, marginLeft: -16, paddingLeft: 16 }}>
        <span>Then</span>
        <Handle
          type="source"
          position={Position.Right}
          id="then"
          className={`btn-handle${connectedHandles.has('then') ? ' connected' : ''}`}
        />
      </div>

      {/* Second, independent connector for "Attach Sequence" (see
          StartNodeSequenceAttach / handleAttachSequenceToStart) — a real
          branch off Start, not part of the "Then" conversation path, so it
          needs its own handle rather than sharing "then"/"next-step". Always
          present (not just once attached) so the wire has somewhere to
          render the moment the node is created. */}
      <div className="fb-next-step-row" style={{ marginTop: 0, marginRight: -16, marginLeft: -16, paddingLeft: 16, borderTop: 'none' }}>
        <span>Sequence</span>
        <Handle
          type="source"
          position={Position.Right}
          id="attach-sequence"
          className={`btn-handle${connectedHandles.has('attach-sequence') ? ' connected' : ''}`}
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #10b981' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(16, 185, 129, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="text" />

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
            background: '#0084ff',
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
          marginBottom: (buttons.length > 0 || true) ? 8 : 0,
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
                  color: '#0084ff',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#0084ff',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#0084ff',
                  }}
                />
              )}
              {!isPhone && !isUrl && (
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
              color: '#0084ff',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0084ff';
              e.currentTarget.style.background = '#f0f7ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>+ Add Button</span>
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #25d366' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(37, 211, 102, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="interactive" />

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
            background: '#25d366',
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
              <img
                src={fullHeaderMediaUrl}
                alt="Header preview"
                style={{ width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
            ) : headerType === 'video' && fullHeaderMediaUrl ? (
              <video
                src={fullHeaderMediaUrl}
                controls
                muted
                style={{ width: '100%', maxHeight: 110, borderRadius: 8, background: '#000', display: 'block' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: headerMediaUrl ? '#25d366' : '#94a3b8', fontSize: 11, fontWeight: 600 }}>
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
                  color: '#25d366',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#25d366',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#25d366',
                  }}
                />
              )}
              {!isPhone && !isUrl && (
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
              color: '#25d366',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#25d366';
              e.currentTarget.style.background = '#f0fdf4';
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #10b981' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(16, 185, 129, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="image" />

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
            background: '#0084ff',
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
          <img
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
                  color: '#0084ff',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#0084ff',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#0084ff',
                  }}
                />
              )}
              {!isPhone && !isUrl && (
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
              color: '#0084ff',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0084ff';
              e.currentTarget.style.background = '#f0f7ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>+ Add Button</span>
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #10b981' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(16, 185, 129, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="video" />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ position: 'absolute', left: -5, top: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#0084ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MessageSquare size={11} color="#ffffff" />
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
        <video
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
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 14px', borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', position: 'relative' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0084ff', textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {btnTitle}
                </span>
                {isPhone && <Phone size={14} style={{ position: 'absolute', right: 12, color: '#0084ff' }} />}
                {isUrl && <ExternalLink size={14} style={{ position: 'absolute', right: 12, color: '#0084ff' }} />}
                {!isPhone && !isUrl && (
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #10b981' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(16, 185, 129, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="audio" />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ position: 'absolute', left: -5, top: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#0084ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MessageSquare size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>Audio Clip</div>
        </div>
      </div>
      <div style={{ padding: '20px 12px', borderRadius: 12, background: '#f8fafc', border: '1.5px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8' }}>
        <Music size={24} style={{ opacity: 0.5, color: '#64748b' }} />
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #10b981' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(16, 185, 129, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="file" />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ position: 'absolute', left: -5, top: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#0084ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MessageSquare size={11} color="#ffffff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>File / Document</div>
        </div>
      </div>
      <div style={{ padding: '16px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, color: '#334155' }}>
        <FileText size={22} style={{ color: '#0084ff', flexShrink: 0 }} />
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
        borderRadius: 20,
        background: '#ffffff',
        border: selected ? '2px solid #10b981' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 0 0 2px rgba(16, 185, 129, 0.2), 0 8px 24px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.06)',
        width: 270,
        minWidth: 260,
        maxWidth: 280,
        overflow: 'visible',
        position: 'relative',
        padding: '14px 14px 10px 14px',
      }}
    >
      <NodeHoverActions nodeId={id} nodeType="buttons" />

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
            background: '#0084ff',
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
          marginBottom: (buttons.length > 0 || true) ? 8 : 0,
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
                  color: '#0084ff',
                  textAlign: 'center',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {btnTitle}
              </span>

              {isPhone && (
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#0084ff',
                  }}
                />
              )}
              {isUrl && (
                <ExternalLink
                  size={14}
                  style={{
                    position: 'absolute',
                    right: 12,
                    color: '#0084ff',
                  }}
                />
              )}
              {!isPhone && !isUrl && (
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
              color: '#0084ff',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0084ff';
              e.currentTarget.style.background = '#f0f7ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
          >
            <Plus size={13} />
            <span>+ Add Button</span>
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
      <Handle type="target" position={Position.Left} />
      {data.message && (
        <div className="fb-node-body" style={{ paddingBottom: replies.length ? 6 : 10 }}>
          <div className="fb-node-body-preview">{data.message}</div>
        </div>
      )}
      <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
        {replies.map((r, i) => (
          <div key={i} className="fb-node-btn-chip" style={{ background: 'rgba(2, 132, 199, 0.08)', borderColor: 'rgba(2, 132, 199, 0.2)', color: '#0369a1' }}>
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
  // Multiple lists send as separate sequential messages, but every item across
  // all of them shares one flat "which option was picked" index space — both
  // for the per-item outgoing edge below (item-{globalIndex}) and for the
  // routing token flowEngine.js encodes into each option (see normalizeListMenuData
  // + the listMenu send-side case there). Keeping the index global (not reset
  // per list) is what lets an item in list 2 still resolve correctly even
  // though it's the 11th item overall.
  const lists = normalizeListMenuData(data);
  const connectedHandles = useConnectedHandles(id);
  let globalIndex = -1;
  return (
    <NodeWrapper id={id} color={NODE_COLORS.listMenu} label="List Menu" icon={ListOrdered} selected={selected} data={data} type="listMenu">
      <Handle type="target" position={Position.Left} />
      {lists.map((list, li) => (
        <div key={li}>
          <div className="fb-node-body" style={{ paddingBottom: 4, paddingTop: li > 0 ? 6 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>
              {list.title || `Menu ${li + 1}`}
            </div>
          </div>
          <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
            {(list.items || []).map((item, i) => {
              globalIndex += 1;
              const gi = globalIndex;
              return (
                <div key={i} className="fb-node-btn-chip" style={{ background: 'rgba(124, 58, 237, 0.08)', borderColor: 'rgba(124, 58, 237, 0.2)', color: '#6d28d9' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item || `Option ${i + 1}`}</span>
                  <ChevronRight size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`item-${gi}`}
                    className={`btn-handle${connectedHandles.has(`item-${gi}`) ? ' connected' : ''}`}
                    style={{ top: '50%', right: -7, transform: 'translateY(-50%)', position: 'absolute' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </NodeWrapper>
  );
}


/* ── Card Node ───────────────────────────────────────────────── */
function CardNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.card} label="Card" icon={CreditCard} selected={selected} data={data} type="card">
      <Handle type="target" position={Position.Left} />
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
        border: selected ? '2px solid #8b5cf6' : '1.5px solid #e2e8f0',
        boxShadow: selected ? '0 8px 24px rgba(139,92,246,0.18)' : '0 4px 14px rgba(0,0,0,0.06)',
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
        {data.variable ? (
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
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clock size={18} style={{ color: NODE_COLORS.delay, flexShrink: 0 }} />
        <div>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>
            {data.seconds || 0}
          </span>
          <span style={{ fontSize: 11, marginLeft: 4, color: '#64748b' }}>seconds</span>
        </div>
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

/* ── Collect Payment Node ────────────────────────────────────── */
function PaymentNode({ id, data, selected }) {
  return (
    <NodeWrapper id={id} color={NODE_COLORS.payment} label="In-Chat Payment" icon={CreditCard} selected={selected} data={data} type="payment">
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
    <NodeWrapper id={id} color={NODE_COLORS.startSequenceAction} label="Start Sequence" icon={Play} selected={selected} data={data} type="startSequenceAction" hideNextStep width={260}>
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
    <NodeWrapper id={id} color={NODE_COLORS.runUserInputFlow} label="Run User Input Flow" icon={ClipboardList} selected={selected} data={data} type="runUserInputFlow" width={300}>
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
          <img
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
        <video src={fullUrl} controls style={{ width: '100%', maxHeight: 160, borderRadius: 8, background: '#000', marginBottom: 8, display: 'block' }} />
      ) : value && isAudio ? (
        <audio src={fullUrl} controls style={{ width: '100%', marginBottom: 8, display: 'block' }} />
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
  }, [data.triggers, data._addTriggerNow]);

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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await sequenceAPI.create({ name: newName.trim(), platform });
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

/* ── Button Action Editor (Submenu for Action Type per Channel) ─── */
function ButtonActionEditor({ btn, index, onChange, onRemove, platform }) {
  const p = (platform || 'WEBCHAT').toUpperCase();
  const [expanded, setExpanded] = useState(false);

  const btnObj = typeof btn === 'string'
    ? { title: btn, action: 'flow', url: '', phone: '', reply_text: '' }
    : { action: 'flow', url: '', phone: '', reply_text: '', ...btn };

  const isFB = p === 'FACEBOOK';
  const isWA = p === 'WHATSAPP';
  const isTG = p === 'TELEGRAM';
  const isIG = p === 'INSTAGRAM';

  // Allowed action types based on developer documentation
  const actionOptions = [
    { value: 'flow', label: 'Continue Flow (Next Step)', icon: '➡️' },
    { value: 'url', label: 'Open Website / URL', icon: '🌐' },
    ...(isFB || p === 'WEBCHAT' ? [{ value: 'phone', label: 'Call Phone Number', icon: '📞' }] : []),
  ];

  const updateProp = (field, val) => {
    onChange({ ...btnObj, [field]: val });
  };

  const getActionBadge = () => {
    switch (btnObj.action) {
      case 'url': return { label: 'URL', bg: '#f1f5f9', color: '#334155' };
      case 'phone': return { label: 'Call', bg: '#f1f5f9', color: '#334155' };
      default: return { label: 'Flow', bg: '#f1f5f9', color: '#334155' };
    }
  };

  const badge = getActionBadge();

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        background: '#ffffff',
        marginBottom: 8,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      {/* Top Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          background: '#f8fafc',
          borderBottom: expanded ? '1px solid #e2e8f0' : 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', width: 16 }}>
          {index + 1}.
        </span>
        <input
          value={btnObj.title || ''}
          onChange={(e) => updateProp('title', e.target.value)}
          placeholder={`Button ${index + 1} text...`}
          maxLength={20}
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 8px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            background: '#ffffff',
          }}
        />
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
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
          }}
          title={expanded ? 'Collapse action submenu' : 'Expand action submenu'}
        >
          <ChevronDown
            size={14}
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          title="Remove button"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expandable Action Submenu */}
      {expanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: '#fafbfc' }}>
          <div className="fb-field" style={{ margin: 0 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
              When this button is clicked
            </label>
            <select
              value={btnObj.action || 'flow'}
              onChange={(e) => updateProp('action', e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, background: '#ffffff' }}
            >
              {actionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
          </div>

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


          {/* Action: Continue Flow */}
          {(btnObj.action === 'flow' || !btnObj.action) && (
            <div
              style={{
                fontSize: 10.5,
                color: '#475569',
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
                padding: '6px 8px',
                borderRadius: 6,
                lineHeight: 1.35,
              }}
            >
              👉 Connect this button to the next message or automation card on the canvas using its handle dot.
            </div>
          )}
        </div>
      )}
    </div>
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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await sequenceAPI.create({ name: newName.trim(), platform });
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

function PropertiesPanel({ node, onClose, onUpdate, onDelete, platform, customFields = [], onCustomFieldCreated, userInputFlows = [], onUserInputFlowCreated, isUserInputFlow = false, sequences = [], onSequenceCreated, isSequence = false, flowName, onFlowNameChange, onDrillIn, onAttachSequence, attachedSequenceNode, onSelectSequenceNode }) {
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
        // A User Input Flow's / Sequence's Start node configures the form/
        // sequence itself, not a trigger — neither is ever keyword-triggered.
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
                  <Plus size={14} /> + Add Button
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
                  <Plus size={14} /> + Add Button
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
                  <Plus size={14} /> + Add Button
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
        return (
          <>
            {lists.map((list, li) => (
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
                  <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{(list.items || []).length}/{listCap}</span>
                </div>
                {(list.items || []).map((item, i) => (
                  <div key={i} className="fb-list-item">
                    <input
                      value={item}
                      onChange={(e) => {
                        const updated = [...(list.items || [])];
                        updated[i] = e.target.value;
                        updateList(li, { items: updated });
                      }}
                      placeholder={`Item ${i + 1}`}
                    />
                    <button
                      className="fb-list-item-del"
                      onClick={() => updateList(li, { items: (list.items || []).filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {(list.items || []).length >= listCap ? (
                  <span className="fb-hint">Maximum {listCap} items per list on {(platform || 'WEBCHAT')} — add another list below for more.</span>
                ) : (
                  <button className="fb-add-btn" onClick={() => updateList(li, { items: [...(list.items || []), ''] })}>
                    <Plus size={14} /> Add Item
                  </button>
                )}
              </div>
            ))}
            <button
              className="fb-add-btn"
              onClick={() => updateLists([...lists, { title: `Menu ${lists.length + 1}`, buttonText: 'Options', items: [] }])}
            >
              <Plus size={14} /> Add Another List
            </button>
            <span className="fb-hint">Each list sends as its own message, one after another — the subscriber can tap an option from any of them and the flow continues the same way.</span>
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

      case 'condition':
        return (
          <>
            <div className="fb-field">
              <label>Variable</label>
              <input
                value={data.variable || ''}
                onChange={(e) => updateField('variable', e.target.value)}
                placeholder="e.g. user_input"
              />
            </div>
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

      case 'delay':
        return (
          <div className="fb-field">
            <label>Delay (seconds)</label>
            <input
              type="number"
              min={0}
              max={300}
              value={data.seconds || 0}
              onChange={(e) => updateField('seconds', parseInt(e.target.value) || 0)}
            />
          </div>
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

  const nodeColor = NODE_COLORS[type] || '#6366f1';
  const NodeIcon = NODE_ICONS[type] || Settings2;

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

function NodePalette({ platform, isUserInputFlow = false, isSequence = false }) {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const permittedCategories = useMemo(() => {
    const source = isSequence ? SEQUENCE_PALETTE : (isUserInputFlow ? USER_INPUT_FLOW_PALETTE : PALETTE_CATEGORIES);
    return source.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => isNodeSupportedOnPlatform(item.type, platform)),
    })).filter((cat) => cat.items.length > 0);
  }, [platform, isUserInputFlow, isSequence]);

  const channelLabel = (platform || 'WEBCHAT').toUpperCase();

  return (
    <div className="fb-palette">
      <div className="fb-palette-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Components</span>
        <span
          style={{
            fontSize: '9.5px',
            fontWeight: 700,
            color: '#4f46e5',
            background: 'rgba(79, 70, 229, 0.08)',
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
                <div className="fb-palette-item-icon" style={{ background: `${color}14`, color }}>
                  <Icon size={15} style={{ color }} />
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
  payment: PaymentNode,
  handoff: HandoffNode,
  end: EndNode,
  runUserInputFlow: RunUserInputFlowNode,
  question: CollectInputNode, // same "ask & wait" UI as Collect Input — see PropertiesPanel for shared config
  finalAnswer: FinalAnswerNode,
  startSequenceAction: StartSequenceActionNode,
  stopSequenceAction: StopSequenceActionNode,
  wait: WaitNode,
};

/* ── Removable / Deletable Edge ────────────────────────────── */
function RemovableEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  selected,
}) {
  const { setEdges } = useReactFlow();
  const { emptySourceNodes } = useContext(FlowNodeActionsContext);
  const [isHovered, setIsHovered] = useState(false);

  const isEmpty = emptySourceNodes?.has(source);

  // Plain curve straight from the connector — no straight exit stub (that's
  // being revisited separately, per-element, later). Keep the bow modest so
  // close nodes still read as a curve without ballooning into a big loop.
  const gapX = targetX - sourceX;
  const gapY = targetY - sourceY;

  let pull;
  let bow = 0;
  if (gapX >= 0) {
    pull = Math.min(Math.max(gapX * 0.4, 30), 90);
  } else {
    // Target sits behind the source: needs a loop wide enough to swing clear.
    pull = Math.min(Math.abs(gapX) * 0.3 + 60, 150);
    bow = Math.abs(gapY) < 90 ? 50 : 0;
  }

  const edgePath =
    `M ${sourceX},${sourceY} ` +
    `C ${sourceX + pull},${sourceY + bow} ${targetX - pull},${targetY + bow} ${targetX},${targetY}`;

  // Midpoint of that cubic, used to park the delete button on the wire.
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2 + bow * 0.5;

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
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: (isHovered || selected) ? 2.5 : 2,
          stroke: (isHovered || selected) ? '#0f172a' : (style.stroke || '#64748b'),
          strokeDasharray: 'none',
        }}
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
function QuickComponentPicker({ position, onClose, onSelect, platform, isUserInputFlow = false, isSequence = false }) {
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
        if (search.trim()) {
          return (
            item.label.toLowerCase().includes(search.toLowerCase()) ||
            item.type.toLowerCase().includes(search.toLowerCase())
          );
        }
        return true;
      }),
    })).filter((cat) => cat.items.length > 0);
  }, [search, platform, isUserInputFlow, isSequence]);

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
  style: { stroke: '#64748b', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: '#64748b',
  },
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
    } catch {}
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
    } catch {}
  }, [referrerState, id]);

  // Dynamic breadcrumb label matching the source page
  const backLabel = useMemo(() => {
    if (referrerState?.label) return referrerState.label;
    try {
      const cachedLabel = sessionStorage.getItem('flow_builder_return_label');
      if (cachedLabel) return cachedLabel;
    } catch {}

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
    if (dest.startsWith('/inbox')) return 'Live Chat';
    return 'Automations';
  }, [referrerState, returnUrl]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowData, setFlowData] = useState(null);
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

  // Re-fetched whenever the channel changes, so the "Run User Input Flow" picker
  // only ever offers same-channel flows (see the userInputFlows note above).
  useEffect(() => {
    if (isUserInputFlow || isSequence) return; // neither can run/reference another one
    userInputFlowAPI
      .getAll(platform ? { platform } : undefined)
      .then((res) => setUserInputFlows(res.data?.userInputFlows || []))
      .catch(() => {});
  }, [platform, isUserInputFlow, isSequence]);

  // Agency's reusable Sequences — offered as a target on "Start Sequence" /
  // "Stop Sequence" action nodes (main Flow Builder only, per the Sequence
  // Messages plan — a Sequence step can't itself start another Sequence).
  const [sequencesList, setSequencesList] = useState([]);
  useEffect(() => {
    if (isUserInputFlow || isSequence) return;
    sequenceAPI.getAll().then((res) => setSequencesList(res.data?.sequences || [])).catch(() => {});
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
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
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
          isSequence ? sequenceAPI.getOne(id) : (isUserInputFlow ? userInputFlowAPI.getOne(id) : flowAPI.getOne(id)),
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
          setNodes([{
            id: generateNodeId('start'),
            type: 'start',
            position: { x: 400, y: 100 },
            data: { ...DEFAULT_NODE_DATA.start },
          }]);
          setLoading(false);
          return;
        }

        setFlowData(flow);
        setFlowName(flow.name || 'Untitled Flow');
        
        let resolvedPlatform = flow.platform || 'WEBCHAT';
        if (flow.integration_id && intRes.status === 'fulfilled') {
          const matched = (intRes.value.data?.integrations || []).find((i) => String(i.id) === String(flow.integration_id));
          if (matched?.platform) resolvedPlatform = matched.platform.toUpperCase();
        }
        setPlatform(resolvedPlatform);
        setIntegrationId(flow.integration_id || null);

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

        // Auto-add start node if empty. A brand-new User Input Flow starts with its
        // Start node plus one Question, so it opens ready to fill in rather than
        // as a bare canvas.
        if (!loadedNodes.length) {
          if (isUserInputFlow) {
            const seeded = buildDefaultUifNodesEdges();
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
            _unsupported: !isNodeSupportedOnPlatform(n.type, flow.platform || 'WEBCHAT'),
          };

          // Skipped for a User Input Flow's / Sequence's Start node — neither
          // has a trigger to backfill, and injecting placeholder keywords
          // there would be misleading.
          if (n.type === 'start' && !isUserInputFlow && !isSequence) {
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
          style: { stroke: '#64748b', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: '#64748b',
          },
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

    if (id) loadFlow();
  }, [id, setNodes, setEdges]);

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
        const triggerType = (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
        let triggerKeyword = flowData?.trigger_keyword || '';
        if (startNode?.data?.keywords) {
          triggerKeyword = Array.isArray(startNode.data.keywords)
            ? startNode.data.keywords.join(',')
            : startNode.data.keywords;
        }

        const serializedNodes = JSON.stringify(currentNodes.map((n) => {
          const { _unsupported, _validationError, ...rest } = n.data;
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
        }
      } catch (err) {
        console.error('Save before exit error:', err);
      }
    }
  }, [id, flowName, platform, integrationId, flowData]);

  /* ── Go back to origin page ───────────────────────────────── */
  const handleGoBack = useCallback(async () => {
    await flushAutoSave();

    // 1. Explicit return URL from caller or session
    if (returnUrl) {
      try {
        sessionStorage.removeItem('flow_builder_return_url');
        sessionStorage.removeItem('flow_builder_return_label');
      } catch {}
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
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: '#64748b',
        },
        sourceHandle: (e.sourceHandle === 'default' || e.sourceHandle === 'bottom') ? undefined : e.sourceHandle,
        targetHandle: (e.targetHandle === 'default' || e.targetHandle === 'top') ? undefined : e.targetHandle,
      }))
    );
    setTimeout(() => {
      fitView({ padding: 0.25, duration: 400 });
    }, 50);
  }, [nodes, edges, setNodes, setEdges, fitView]);

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

      if (invalidList.length > 0) {
        // Highlight invalid nodes on canvas
        setNodes((nds) =>
          nds.map((n) => {
            const err = validateNodeData(n);
            return {
              ...n,
              data: {
                ...n.data,
                _validationError: err || null,
              },
            };
          })
        );

        const first = invalidList[0];
        setSelectedNode(first.node);

        Swal.fire({
          title: 'Missing Component Data',
          html: `
            <div style="text-align: left; font-size: 13px; color: #475569; line-height: 1.5;">
              <p style="margin-bottom: 8px;">The flow cannot be saved because some components have missing data:</p>
              <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 10px 12px; color: #b91c1c; font-weight: 600;">
                <strong>${first.node.data?.label || first.node.type}</strong>: ${first.error}
              </div>
              ${invalidList.length > 1 ? `<p style="margin-top: 8px; font-size: 11px; color: #94a3b8;">+ ${invalidList.length - 1} other component(s) need attention.</p>` : ''}
            </div>
          `,
          icon: 'warning',
          confirmButtonText: 'Fill In Data',
          confirmButtonColor: '#4f46e5',
        });
        return;
      }

      setSaving(true);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      let triggerKeyword = flowData?.trigger_keyword || '';
      const startNode = currentNodes.find((n) => n.type === 'start');
      const triggerType = (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
      if (startNode?.data?.keywords) {
        triggerKeyword = Array.isArray(startNode.data.keywords)
          ? startNode.data.keywords.join(',')
          : startNode.data.keywords;
      }

      const serializedNodes = JSON.stringify(currentNodes.map((n) => {
        const { _unsupported, _validationError, ...rest } = n.data;
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
    platform, integrationId, drilledIn, setNodes,
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
      style: { stroke: '#64748b', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#64748b' },
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
    (params) =>
      setEdges((eds) => {
        const filtered = eds.filter(
          (edge) => !(edge.source === params.source && (edge.sourceHandle || null) === (params.sourceHandle || null))
        );
        return addEdge({
          ...params,
          type: 'default',
          animated: false,
          style: { stroke: '#64748b', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: '#64748b',
          },
        }, filtered);
      }),
    [setEdges]
  );

  /* ── Drag to Connect: onConnectStart & onConnectEnd ──────── */
  const onConnectStart = useCallback((_, { nodeId, handleId, handleType }) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeRef.current) return;

      // Only truly empty canvas counts as "open the quick-add list" — every
      // node/handle on the canvas is a DOM descendant of .react-flow__pane,
      // so the previous .closest('.react-flow__pane') fallback matched
      // almost anything you could drop on (including a real handle), which
      // is why the list kept opening even after successfully connecting to
      // an existing node. Only the exact pane element itself should count.
      const targetIsPane = event.target?.classList?.contains('react-flow__pane');

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
    [screenToFlowPosition]
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
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: '#64748b',
        },
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
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#64748b' },
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
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#64748b' },
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

          {/* Interactive Device Preview Toggle */}
          <button
            type="button"
            className={`flow-preview-toggle-btn ${previewOpen ? 'active' : ''}`}
            onClick={() => setPreviewOpen((prev) => !prev)}
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
        <NodePalette platform={platform} isUserInputFlow={isUserInputFlow} isSequence={isSequence} />

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
            connectionLineStyle={{ stroke: '#64748b', strokeWidth: 2 }}
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
