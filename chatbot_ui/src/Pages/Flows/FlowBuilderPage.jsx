import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, useNodesState, useEdgesState,
  addEdge, ReactFlowProvider, useReactFlow,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Save, Loader2, Check, AlertTriangle,
  MessageSquare, ListOrdered, LayoutGrid, CreditCard,
  Layers, Keyboard, GitBranch, Clock, Headphones,
  CircleStop, Play, Type, GripVertical, X, Plus, Trash2,
  ChevronRight, Zap, MousePointerClick, Mail, Phone,
  User, Settings2, CornerDownRight, Image, Upload,
  Video, Music, FileText, Globe, ExternalLink
} from 'lucide-react';
import { flowAPI, uploadAPI, integrationAPI } from '../../services/api';
import Swal from 'sweetalert2';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PLATFORM_RULES = {
  WHATSAPP: {
    text: true,
    image: true,
    video: true,
    audio: true,
    file: true,
    buttons: 3,        // WhatsApp Interactive Reply Buttons (max 3)
    quickReplies: false, // WhatsApp uses buttons or listMenu
    listMenu: 10,      // WhatsApp Interactive List Message (max 10 items)
    card: false,
    carousel: false,
    collectInput: true,
    condition: true,
    delay: true,
    webhook: true,
    payment: true,
    handoff: true,
    end: true,
  },
  FACEBOOK: {
    text: true,
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
    condition: true,
    delay: true,
    webhook: true,
    payment: true,
    handoff: true,
    end: true,
  },
  INSTAGRAM: {
    text: true,
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
    condition: true,
    delay: true,
    webhook: true,
    payment: false,
    handoff: true,
    end: true,
  },
  TELEGRAM: {
    text: true,
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
    condition: true,
    delay: true,
    webhook: true,
    payment: true,
    handoff: true,
    end: true,
  },
  TIKTOK: {
    text: true,
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
    condition: true,
    delay: true,
    webhook: true,
    payment: false,
    handoff: true,
    end: true,
  },
  WEBCHAT: {
    text: true,
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
};

const NODE_ICONS = {
  start: Play,
  text: Type,
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
  payment: CreditCard,
  handoff: Headphones,
  end: CircleStop,
};

const PALETTE_CATEGORIES = [
  {
    label: 'Messages',
    items: [
      { type: 'text', label: 'Text Message' },
      { type: 'buttons', label: 'Buttons' },
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
      { type: 'condition', label: 'Condition' },
      { type: 'delay', label: 'Delay' },
      { type: 'webhook', label: 'Webhook / Zapier' },
      { type: 'payment', label: 'Collect Payment' },
    ],
  },
  {
    label: 'Actions',
    items: [
      { type: 'handoff', label: 'Agent Handoff' },
      { type: 'end', label: 'End Flow' },
    ],
  },
];

const DEFAULT_NODE_DATA = {
  start:        { label: 'Start Trigger', trigger_type: 'keyword', match_type: 'contains' },
  text:         { label: 'Text Message', message: '' },
  image:        { label: 'Image', imageUrl: '', caption: '' },
  video:        { label: 'Video', mediaUrl: '', caption: '' },
  audio:        { label: 'Audio', mediaUrl: '' },
  file:         { label: 'File / Document', mediaUrl: '', filename: '' },
  buttons:      { label: 'Buttons', message: '', buttons: ['Button 1'] },
  quickReplies: { label: 'Quick Replies', message: '', replies: ['Reply 1'] },
  listMenu:     { label: 'List Menu', title: 'Menu', items: ['Item 1'] },
  card:         { label: 'Card', title: '', subtitle: '', imageUrl: '' },
  carousel:     { label: 'Carousel', cards: [{ title: 'Card 1', subtitle: '', imageUrl: '' }] },
  collectInput: { label: 'Collect Input', variable: '', inputType: 'name' },
  condition:    { label: 'Condition', variable: '', operator: 'equals', value: '' },
  delay:        { label: 'Delay', seconds: 3 },
  webhook:      { label: 'Webhook / Zapier Action', url: '', method: 'POST', payloadMode: 'ALL_VARIABLES', customPayload: '', customHeaders: '' },
  payment:      { label: 'Collect Payment', productName: 'Order Product / Service', amount: 49.99, currency: 'USD', buttonLabel: '💳 Pay Now', successMessage: '🎉 Payment received! Your order is confirmed.' },
  handoff:      { label: 'Agent Handoff', message: '' },
  end:          { label: 'End', message: '' },
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

  /* ── Properties Panel (Right) ──────────────────────────────── */
  .fb-props {
    width: 310px;
    flex-shrink: 0;
    background: #ffffff;
    border-left: 1px solid #e4e4f0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    animation: fb-slide-in 0.2s ease-out;
    overflow-y: auto;
    box-shadow: -2px 0 8px rgba(0,0,0,0.04);
  }
  @keyframes fb-slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .fb-props::-webkit-scrollbar { width: 4px; }
  .fb-props::-webkit-scrollbar-thumb { background: #d0d0e8; border-radius: 4px; }
  .fb-props-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #e4e4f0;
    background: #fafafa;
  }
  .fb-props-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #1a1a2e;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fb-props-close {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: #5c5c80;
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-props-close:hover { background: rgba(239, 68, 68, 0.10); color: #ef4444; }
  .fb-props-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .fb-field { display: flex; flex-direction: column; gap: 5px; }
  .fb-field label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #5c5c80;
  }
  .fb-field input,
  .fb-field textarea,
  .fb-field select {
    background: #f8f8fc;
    border: 1px solid #e4e4f0;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: #1a1a2e;
    outline: none;
    transition: all 0.2s;
    font-family: inherit;
    resize: vertical;
  }
  .fb-field input:focus,
  .fb-field textarea:focus,
  .fb-field select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.10);
    background: #ffffff;
  }
  .fb-field textarea { min-height: 80px; }
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
    border-radius: 6px;
    background: transparent;
    border: none;
    color: #9999bb;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .fb-list-item-del:hover { background: rgba(239, 68, 68, 0.10); color: #ef4444; }
  .fb-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1.5px dashed #d0d0e8;
    background: transparent;
    color: #6366f1;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-add-btn:hover { background: rgba(99, 102, 241, 0.06); border-color: #6366f1; }
  .fb-delete-node-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.20);
    background: rgba(239, 68, 68, 0.05);
    color: #ef4444;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
  }
  .fb-delete-node-btn:hover { background: rgba(239, 68, 68, 0.12); }

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

  /* ── React Flow Handle overrides ───────────────────────────── */
  .react-flow__handle {
    width: 12px !important;
    height: 12px !important;
    border: 2px solid #ffffff !important;
    border-radius: 50% !important;
    transition: all 0.2s !important;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
  }
  .react-flow__handle:hover {
    transform: scale(1.3) !important;
  }
  .react-flow__handle-top { top: -6px !important; }
  .react-flow__handle-bottom { bottom: -6px !important; }
  .react-flow__handle-right { right: -6px !important; }

  /* ── Edge styling ──────────────────────────────────────────── */
  .react-flow__edge-path {
    stroke: rgba(99, 102, 241, 0.55) !important;
    stroke-width: 2 !important;
  }
  .react-flow__edge.selected .react-flow__edge-path {
    stroke: #6366f1 !important;
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
    case 'start':
      if (data.trigger_type === 'keyword') {
        const rawKw = data.keywords || (data.trigger_keyword ? data.trigger_keyword.split(',') : []);
        const kwList = Array.isArray(rawKw) ? rawKw.filter((k) => k && String(k).trim()) : [];
        if (kwList.length === 0) return 'Please set at least one trigger keyword';
      }
      return null;

    case 'text':
      if (!data.message || !data.message.trim()) {
        return 'Text Message cannot be empty';
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
        return 'Buttons prompt message cannot be empty';
      }
      const validBtns = (data.buttons || []).filter((b) => (typeof b === 'string' ? b : b?.title || '').trim());
      if (validBtns.length === 0) {
        return 'At least one button label is required';
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

    case 'listMenu':
      if (!data.title || !data.title.trim()) {
        return 'List Menu title cannot be empty';
      }
      const validItems = (data.items || []).filter((it) => (typeof it === 'string' ? it : it?.title || '').trim());
      if (validItems.length === 0) {
        return 'At least one menu option is required';
      }
      return null;

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
  const width = 220;
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
    case 'buttons': {
      const count = (node.data?.buttons || []).length;
      return { width, height: 90 + Math.max(1, count) * 34 };
    }
    case 'listMenu': {
      const count = (node.data?.items || []).length;
      return { width, height: 90 + Math.max(1, count) * 34 };
    }
    case 'card':
      return { width, height: 185 };
    case 'condition':
      return { width, height: 145 };
    case 'collectInput':
    case 'payment':
    case 'webhook':
      return { width, height: 130 };
    case 'delay':
    case 'video':
    case 'audio':
    case 'file':
      return { width, height: 120 };
    case 'handoff':
    case 'end':
    default:
      return { width, height: 100 };
  }
}

function getAutoLayoutedNodes(nodes, edges) {
  if (!nodes || nodes.length === 0) return [];

  const H_GAP = 70; // Ample, clean horizontal gap between stages
  const V_GAP = 36; // Generous vertical gap between adjacent cards to prevent any cramping

  // Calculate actual dimensions for each node
  const dimMap = {};
  nodes.forEach((n) => {
    dimMap[n.id] = getNodeDimensions(n);
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

/* ── Base wrapper for standard nodes ─────────────────────────── */
function NodeWrapper({ children, color, label, icon: Icon, selected, data, type }) {
  const unsupported = data?._unsupported;
  const validationError = data?._validationError;

  return (
    <div
      className={`fb-node${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        borderColor: validationError ? '#ef4444' : selected ? color : '#e2e8f0',
        background: '#ffffff',
      }}
    >
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
        <span style={{ fontWeight: 700, fontSize: '11.5px', color: validationError ? '#b91c1c' : '#1e293b' }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

/* ── Start Node ──────────────────────────────────────────────── */
function StartNode({ data, selected }) {
  const triggerType = data.trigger_type || 'keyword';
  const rawKeywords = data.keywords || (data.trigger_keyword ? data.trigger_keyword.split(',') : []);
  const keywords = Array.isArray(rawKeywords) ? rawKeywords : [rawKeywords].filter(Boolean);

  return (
    <NodeWrapper color={NODE_COLORS.start} label="Start Trigger" icon={Play} selected={selected} data={data} type="start">
      <div className="fb-node-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.8 }}>Trigger:</span>
          <span style={{ fontWeight: 700, color: '#059669', textTransform: 'capitalize', fontSize: 11 }}>
            {triggerType === 'keyword' ? '🔑 Keywords' : triggerType === 'first_message' ? '👋 First Message' : triggerType === 'any_message' ? '💬 Any Message' : triggerType}
          </span>
        </div>

        {triggerType === 'keyword' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {keywords.length === 0 ? (
              <span style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic' }}>No keywords set (click to add)</span>
            ) : (
              keywords.slice(0, 4).map((kw, i) => (
                <span
                  key={i}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(5, 150, 105, 0.12)',
                    color: '#059669',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {kw}
                </span>
              ))
            )}
            {keywords.length > 4 && (
              <span style={{ fontSize: 10, opacity: 0.6 }}>+{keywords.length - 4} more</span>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.start, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Text Node ───────────────────────────────────────────────── */
function TextNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.text} label="Text Message" icon={Type} selected={selected} data={data} type="text">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.text, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body">
        <div className="fb-node-body-preview">
          {data.message || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No message set</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.text, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Image Node ──────────────────────────────────────────────── */
function ImageNode({ data, selected }) {
  const rawUrl = data.imageUrl || data.mediaUrl || '';
  const backendUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
    : 'http://localhost:5000';
  const fullUrl = rawUrl && !rawUrl.startsWith('http') ? `${backendUrl}${rawUrl}` : rawUrl;

  return (
    <NodeWrapper color={NODE_COLORS.image} label="Image" icon={Image} selected={selected} data={data} type="image">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.image, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body">
        {fullUrl ? (
          <img
            src={fullUrl}
            alt="Preview"
            style={{ width: '100%', height: 80, borderRadius: 6, objectFit: 'cover', display: 'block', marginBottom: 6 }}
          />
        ) : (
          <div style={{
            width: '100%', height: 60, borderRadius: 6, marginBottom: 6,
            background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}>
            <Image size={16} style={{ color: '#94a3b8' }} />
            <span style={{ fontSize: 10, color: '#94a3b8' }}>No image set</span>
          </div>
        )}
        {data.caption && (
          <div style={{ fontSize: 11, color: '#475569' }} className="fb-node-body-preview">{data.caption}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.image, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Video Node ──────────────────────────────────────────────── */
function VideoNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.video} label="Video" icon={Video} selected={selected} data={data} type="video">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.video, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Video size={16} style={{ color: NODE_COLORS.video, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>Video Message</div>
          <div style={{ fontSize: 10, color: '#64748b' }} className="truncate">{data.mediaUrl ? 'Video linked' : 'No video attached'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.video, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Audio Node ──────────────────────────────────────────────── */
function AudioNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.audio} label="Audio" icon={Music} selected={selected} data={data} type="audio">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.audio, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Music size={16} style={{ color: NODE_COLORS.audio, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>Audio Note</div>
          <div style={{ fontSize: 10, color: '#64748b' }} className="truncate">{data.mediaUrl ? 'Audio linked' : 'No audio attached'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.audio, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── File Node ───────────────────────────────────────────────── */
function FileNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.file} label="File / Document" icon={FileText} selected={selected} data={data} type="file">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.file, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={16} style={{ color: NODE_COLORS.file, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{data.filename || 'Document'}</div>
          <div style={{ fontSize: 10, color: '#64748b' }} className="truncate">{data.mediaUrl ? 'File linked' : 'No file attached'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.file, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Buttons Node ────────────────────────────────────────────── */
function ButtonsNode({ data, selected }) {
  const buttons = data.buttons || [];
  return (
    <NodeWrapper color={NODE_COLORS.buttons} label="Buttons" icon={MousePointerClick} selected={selected} data={data} type="buttons">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.buttons, width: 8, height: 8, border: '2px solid #ffffff' }} />
      {data.message && (
        <div className="fb-node-body" style={{ paddingBottom: buttons.length ? 6 : 10 }}>
          <div className="fb-node-body-preview">{data.message}</div>
        </div>
      )}
      <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
        {buttons.map((btn, i) => (
          <div key={i} className="fb-node-btn-chip" style={{ background: 'rgba(217, 119, 6, 0.08)', borderColor: 'rgba(217, 119, 6, 0.2)', color: '#b45309' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{btn || `Button ${i + 1}`}</span>
            <ChevronRight size={12} style={{ opacity: 0.6 }} />
            <Handle
              type="source"
              position={Position.Right}
              id={`btn-${i}`}
              style={{
                background: '#d97706',
                top: '50%',
                right: -6,
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
                border: '2px solid #ffffff',
              }}
            />
          </div>
        ))}
      </div>
    </NodeWrapper>
  );
}

/* ── Quick Replies Node (With individual branch handles) ─────── */
function QuickRepliesNode({ data, selected }) {
  const replies = data.replies || [];
  return (
    <NodeWrapper color={NODE_COLORS.quickReplies} label="Quick Replies" icon={Keyboard} selected={selected} data={data} type="quickReplies">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.quickReplies, width: 8, height: 8, border: '2px solid #ffffff' }} />
      {data.message && (
        <div className="fb-node-body" style={{ paddingBottom: replies.length ? 6 : 10 }}>
          <div className="fb-node-body-preview">{data.message}</div>
        </div>
      )}
      <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
        {replies.map((r, i) => (
          <div key={i} className="fb-node-btn-chip" style={{ background: 'rgba(2, 132, 199, 0.08)', borderColor: 'rgba(2, 132, 199, 0.2)', color: '#0369a1' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{r || `Reply ${i + 1}`}</span>
            <ChevronRight size={12} style={{ opacity: 0.6 }} />
            <Handle
              type="source"
              position={Position.Right}
              id={`qr-${i}`}
              style={{
                background: '#0284c7',
                top: '50%',
                right: -6,
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
                border: '2px solid #ffffff',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ padding: '4px 10px 8px', fontSize: '9.5px', color: '#64748b', textAlign: 'center', borderTop: '1px dashed #e2e8f0' }}>
        Connect reply to each button 👉
      </div>
    </NodeWrapper>
  );
}

/* ── List Menu Node (WhatsApp Interactive List) ──────────────── */
function ListMenuNode({ data, selected }) {
  const items = data.items || [];
  return (
    <NodeWrapper color={NODE_COLORS.listMenu} label="List Menu" icon={ListOrdered} selected={selected} data={data} type="listMenu">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.listMenu, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body" style={{ paddingBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>
          {data.title || 'Menu Options'}
        </div>
      </div>
      <div className="fb-node-btn-list" style={{ marginTop: 2 }}>
        {items.map((item, i) => (
          <div key={i} className="fb-node-btn-chip" style={{ background: 'rgba(124, 58, 237, 0.08)', borderColor: 'rgba(124, 58, 237, 0.2)', color: '#6d28d9' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{item || `Option ${i + 1}`}</span>
            <ChevronRight size={12} style={{ opacity: 0.6 }} />
            <Handle
              type="source"
              position={Position.Right}
              id={`item-${i}`}
              style={{
                background: '#7c3aed',
                top: '50%',
                right: -6,
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
                border: '2px solid #ffffff',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ padding: '4px 10px 8px', fontSize: '9.5px', color: '#64748b', textAlign: 'center', borderTop: '1px dashed #e2e8f0' }}>
        Connect reply to each option 👉
      </div>
    </NodeWrapper>
  );
}

/* ── Card Node ───────────────────────────────────────────────── */
function CardNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.card} label="Card" icon={CreditCard} selected={selected} data={data} type="card">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.card, width: 8, height: 8, border: '2px solid #ffffff' }} />
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
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.card, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Carousel Node ───────────────────────────────────────────── */
function CarouselNode({ data, selected }) {
  const cardCount = data.cards?.length || 0;
  return (
    <NodeWrapper color={NODE_COLORS.carousel} label="Carousel" icon={Layers} selected={selected} data={data} type="carousel">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.carousel, width: 8, height: 8, border: '2px solid #ffffff' }} />
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
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.carousel, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Collect Input Node ──────────────────────────────────────── */
function CollectInputNode({ data, selected }) {
  const typeIcons = { name: User, email: Mail, phone: Phone, custom: Settings2 };
  const TypeIcon = typeIcons[data.inputType] || Settings2;
  return (
    <NodeWrapper color={NODE_COLORS.collectInput} label="Collect Input" icon={Mail} selected={selected} data={data} type="collectInput">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.collectInput, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TypeIcon size={16} style={{ color: NODE_COLORS.collectInput, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 12 }}>
            {data.inputType || 'custom'}
          </div>
          {data.variable && (
            <div style={{ fontSize: 10, color: '#64748b' }}>→ {data.variable}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.collectInput, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Condition Node ──────────────────────────────────────────── */
function ConditionNode({ data, selected }) {
  const unsupported = data?._unsupported;
  const validationError = data?._validationError;

  return (
    <div
      className={`fb-node-condition${selected ? ' selected' : ''}${validationError ? ' has-error' : ''}`}
      style={{
        background: '#ffffff',
        borderColor: validationError ? '#ef4444' : selected ? NODE_COLORS.condition : '#e2e8f0',
      }}
    >
      {validationError ? (
        <div className="fb-node-warning" style={{ background: '#ef4444' }} title={`Missing Data: ${validationError}`}>
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : unsupported ? (
        <div className="fb-node-warning" title="Not permitted on current channel">
          <AlertTriangle size={12} color="#fff" />
        </div>
      ) : null}
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.condition, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div
        className="fb-node-header"
        style={{
          background: validationError ? '#fef2f2' : `${NODE_COLORS.condition}12`,
          borderBottom: `1px solid ${validationError ? '#fecaca' : `${NODE_COLORS.condition}22`}`,
          borderRadius: '11px 11px 0 0',
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
            style={{ background: '#059669', right: -6, width: 8, height: 8, border: '2px solid #ffffff' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span className="fb-condition-label fb-condition-no">No / False</span>
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            style={{ background: '#dc2626', right: -6, width: 8, height: 8, border: '2px solid #ffffff' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Delay Node ──────────────────────────────────────────────── */
function DelayNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.delay} label="Delay" icon={Clock} selected={selected} data={data} type="delay">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.delay, width: 8, height: 8, border: '2px solid #ffffff' }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clock size={18} style={{ color: NODE_COLORS.delay, flexShrink: 0 }} />
        <div>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>
            {data.seconds || 0}
          </span>
          <span style={{ fontSize: 11, marginLeft: 4, color: '#64748b' }}>seconds</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.delay, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Webhook / Zapier Node ───────────────────────────────────── */
function WebhookNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.webhook} label="Webhook / Zapier" icon={Globe} selected={selected} data={data} type="webhook">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.webhook, width: 8, height: 8, border: '2px solid #ffffff' }} />
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
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.webhook, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Collect Payment Node ────────────────────────────────────── */
function PaymentNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.payment} label="In-Chat Payment" icon={CreditCard} selected={selected} data={data} type="payment">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.payment, width: 8, height: 8, border: '2px solid #ffffff' }} />
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
      <Handle type="source" position={Position.Right} style={{ background: NODE_COLORS.payment, width: 8, height: 8, border: '2px solid #ffffff' }} />
    </NodeWrapper>
  );
}

/* ── Handoff Node ────────────────────────────────────────────── */
function HandoffNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.handoff} label="Agent Handoff" icon={Headphones} selected={selected} data={data} type="handoff">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.handoff, width: 8, height: 8, border: '2px solid #ffffff' }} />
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
function EndNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.end} label="End" icon={CircleStop} selected={selected} data={data} type="end">
      <Handle type="target" position={Position.Left} style={{ background: NODE_COLORS.end, width: 8, height: 8, border: '2px solid #ffffff' }} />
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

/* ── Start Node Properties with Reactive Keywords Manager ──── */
function StartNodeProperties({ data = {}, onUpdateNode }) {
  const [keywordInput, setKeywordInput] = useState('');

  const triggerType = data.trigger_type || 'keyword';
  const rawKeywords = data.keywords !== undefined
    ? data.keywords
    : (data.trigger_keyword ? data.trigger_keyword.split(',') : ['hi', 'hello']);
  const keywords = Array.isArray(rawKeywords) ? rawKeywords : [rawKeywords].filter(Boolean);

  const handleTriggerTypeChange = (newType) => {
    onUpdateNode({
      ...data,
      trigger_type: newType,
    });
  };

  const handleMatchTypeChange = (newMatch) => {
    onUpdateNode({
      ...data,
      match_type: newMatch,
    });
  };

  const handleAddKeyword = () => {
    const val = keywordInput.trim();
    if (!val) return;
    const newItems = val.split(',').map((k) => k.trim()).filter(Boolean);
    const updated = Array.from(new Set([...keywords, ...newItems]));
    onUpdateNode({
      ...data,
      keywords: updated,
      trigger_keyword: updated.join(','),
    });
    setKeywordInput('');
  };

  const handleRemoveKeyword = (indexToRemove) => {
    const updated = keywords.filter((_, idx) => idx !== indexToRemove);
    onUpdateNode({
      ...data,
      keywords: updated,
      trigger_keyword: updated.join(','),
    });
  };

  return (
    <>
      <div className="fb-field">
        <label>Trigger Type</label>
        <select value={triggerType} onChange={(e) => handleTriggerTypeChange(e.target.value)}>
          <option value="keyword">🔑 Keyword Trigger (e.g. hi, pricing, hello)</option>
          <option value="first_message">👋 First Message (Welcome new contacts)</option>
          <option value="any_message">💬 Any Message / Fallback</option>
          <option value="button_payload">🔘 Button Payload / Postback</option>
          <option value="webhook">⚡ Webhook / API</option>
        </select>
      </div>

      {triggerType === 'keyword' && (
        <>
          <div className="fb-field">
            <label>Matching Method</label>
            <select
              value={data.match_type || 'contains'}
              onChange={(e) => handleMatchTypeChange(e.target.value)}
            >
              <option value="contains">Contains (e.g. user says "hey there" matches "hey")</option>
              <option value="exact">Exact Match (user text must match keyword exactly)</option>
              <option value="starts_with">Starts With (e.g. starts with keyword)</option>
            </select>
          </div>

          <div className="fb-field">
            <label>Trigger Keywords ({keywords.length})</label>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
              Type a keyword and press <b>Enter</b> or click <b>+ Add</b>. You can also paste comma-separated keywords (e.g. <i>hi, hello, hey, start</i>).
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, minHeight: 32 }}>
              {keywords.length === 0 ? (
                <span style={{ fontSize: 11, color: '#f59e0b', fontStyle: 'italic', padding: '4px 0' }}>
                  ⚠️ No keywords added. Type a keyword below and click "+ Add".
                </span>
              ) : (
                keywords.map((kw, i) => (
                  <span
                    key={`${kw}_${i}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.18)',
                      color: '#10b981',
                      fontSize: 12,
                      fontWeight: 600,
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    🏷️ {kw}
                    <button
                      type="button"
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '1px 5px',
                        borderRadius: '50%',
                        fontSize: 11,
                        lineHeight: 1,
                        fontWeight: 'bold',
                      }}
                      onClick={() => handleRemoveKeyword(i)}
                      title={`Remove "${kw}"`}
                    >
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="Type keyword (e.g. pricing, support)…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
                style={{ flex: 1, fontSize: 12 }}
              />
              <button
                type="button"
                className="fb-add-btn"
                style={{ padding: '6px 14px', fontSize: 12, flexShrink: 0, fontWeight: 700 }}
                onClick={handleAddKeyword}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROPERTIES PANEL
   ═══════════════════════════════════════════════════════════════════ */

function PropertiesPanel({ node, onClose, onUpdate, onDelete }) {
  if (!node) return null;

  const { data, type } = node;

  const updateField = (field, value) => {
    onUpdate(node.id, { ...data, [field]: value });
  };

  const renderFields = () => {
    switch (type) {
      case 'start':
        return (
          <StartNodeProperties
            data={data}
            onUpdateNode={(newData) => onUpdate(node.id, newData)}
          />
        );

      case 'text':
        return (
          <div className="fb-field">
            <label>Message</label>
            <textarea
              value={data.message || ''}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="Enter your text message..."
            />
          </div>
        );

      case 'image':
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
          </>
        );

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

      case 'buttons':
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
              <label>Buttons</label>
              {(data.buttons || []).map((btn, i) => (
                <div key={i} className="fb-list-item">
                  <input
                    value={btn}
                    onChange={(e) => {
                      const updated = [...(data.buttons || [])];
                      updated[i] = e.target.value;
                      updateField('buttons', updated);
                    }}
                    placeholder={`Button ${i + 1}`}
                  />
                  <button
                    className="fb-list-item-del"
                    onClick={() => {
                      const updated = (data.buttons || []).filter((_, idx) => idx !== i);
                      updateField('buttons', updated);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="fb-add-btn"
                onClick={() => updateField('buttons', [...(data.buttons || []), ''])}
              >
                <Plus size={14} /> Add Button
              </button>
            </div>
          </>
        );

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
                <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 700 }}>
                  {(data.replies || []).length} replies
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#0369a1', marginBottom: 8, lineHeight: 1.45, background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.2)', padding: '8px 10px', borderRadius: '8px' }}>
                <strong>📌 Meta Platform Rule:</strong> Quick replies pause and wait for the user to tap an option. Immediate automatic follow-up replies are prohibited because Meta instantly dismisses quick replies if another message is sent. Connect your responses directly to each individual option handle on the right.
              </div>
              {(data.replies || []).map((reply, i) => (
                <div key={i} className="fb-list-item">
                  <div style={{
                    width: 22, height: 22, borderRadius: 5, background: 'rgba(2, 132, 199, 0.1)',
                    color: '#0284c7', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
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

      case 'listMenu':
        return (
          <>
            <div className="fb-field">
              <label>Section Title</label>
              <input
                value={data.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Menu title..."
              />
            </div>
            <div className="fb-field">
              <label>Menu Items</label>
              {(data.items || []).map((item, i) => (
                <div key={i} className="fb-list-item">
                  <input
                    value={item}
                    onChange={(e) => {
                      const updated = [...(data.items || [])];
                      updated[i] = e.target.value;
                      updateField('items', updated);
                    }}
                    placeholder={`Item ${i + 1}`}
                  />
                  <button
                    className="fb-list-item-del"
                    onClick={() => {
                      const updated = (data.items || []).filter((_, idx) => idx !== i);
                      updateField('items', updated);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="fb-add-btn"
                onClick={() => updateField('items', [...(data.items || []), ''])}
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
          </>
        );

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

      case 'collectInput':
        return (
          <>
            <div className="fb-field">
              <label>Input Type</label>
              <select value={data.inputType || 'name'} onChange={(e) => updateField('inputType', e.target.value)}>
                <option value="name">Name</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="fb-field">
              <label>Variable Name</label>
              <input
                value={data.variable || ''}
                onChange={(e) => updateField('variable', e.target.value)}
                placeholder="e.g. user_name"
              />
            </div>
          </>
        );

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

            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 11, color: '#15803d', lineHeight: 1.4 }}>
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
            width: 24, height: 24, borderRadius: 6,
            background: nodeColor, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <NodeIcon size={13} color="#fff" />
          </div>
          {data.label || type}
        </h3>
        <button className="fb-props-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="fb-props-body">
        {renderFields()}
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

function NodePalette({ platform }) {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const permittedCategories = useMemo(() => {
    return PALETTE_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => isNodeSupportedOnPlatform(item.type, platform)),
    })).filter((cat) => cat.items.length > 0);
  }, [platform]);

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
};

/* ── Removable / Deletable Edge ────────────────────────────── */
function RemovableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}) {
  const { setEdges } = useReactFlow();

  // Force pure horizontal Left-to-Right edge routing (source exits right, target enters left)
  const actualSourcePos = (sourcePosition === Position.Bottom || !sourcePosition) ? Position.Right : sourcePosition;
  const actualTargetPos = (targetPosition === Position.Top || !targetPosition) ? Position.Left : targetPosition;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: actualSourcePos,
    targetX,
    targetY,
    targetPosition: actualTargetPos,
    borderRadius: 12,
  });

  const onEdgeDelete = (e) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3.5 : 2.5,
          stroke: selected ? '#818cf8' : (style.stroke || 'rgba(99, 102, 241, 0.6)'),
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 1000,
          }}
          className="nodrag nopan"
        >
          <button
            type="button"
            className="fb-edge-delete-btn"
            onClick={onEdgeDelete}
            title="Disconnect connection (Delete Edge)"
            style={{
              width: 22,
              height: 22,
              background: '#181b2e',
              border: '1.5px solid #ef4444',
              color: '#ef4444',
              cursor: 'pointer',
              borderRadius: '50%',
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
              transition: 'all 0.15s ease',
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.25)';
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = '#181b2e';
              e.currentTarget.style.color = '#ef4444';
            }}
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = {
  smoothstep: RemovableEdge,
  removable: RemovableEdge,
  default: RemovableEdge,
};

/* ── Floating Quick Component Picker (drag-to-connect) ──────── */
function QuickComponentPicker({ position, onClose, onSelect, platform }) {
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
    return PALETTE_CATEGORIES.map((cat) => ({
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
  }, [search, platform]);

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
  type: 'smoothstep',
  animated: true,
  style: { stroke: 'rgba(99, 102, 241, 0.5)', strokeWidth: 2 },
};

function getPlatformUrl(account, platform) {
  const p = (platform || account?.platform || '').toUpperCase();
  switch (p) {
    case 'INSTAGRAM': {
      const username = account?.ig_username || (account?.name && !account.name.includes(' ') ? account.name : '');
      return username
        ? `https://www.instagram.com/${username.replace('@', '')}/`
        : 'https://www.instagram.com/';
    }
    case 'FACEBOOK': {
      if (account?.fb_page_id) {
        return `https://www.facebook.com/${account.fb_page_id}`;
      }
      return 'https://www.facebook.com/';
    }
    case 'WHATSAPP': {
      const phone = account?.wa_display_phone || account?.wa_phone_number_id;
      const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
      if (cleanPhone && cleanPhone.length >= 7 && cleanPhone.length <= 15) {
        return `https://wa.me/${cleanPhone}`;
      }
      return 'https://business.facebook.com/wa/manage/home/';
    }
    case 'TELEGRAM': {
      const tgName = account?.name ? account.name.replace('@', '') : '';
      return tgName ? `https://t.me/${tgName}` : 'https://web.telegram.org/';
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
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { screenToFlowPosition, fitView } = useReactFlow();

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
  const [autoSaveStatus, setAutoSaveStatus] = useState('');

  const autoSaveTimerRef = useRef(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Resolve the exact connected page / account name for this flow
  const currentAccount = useMemo(() => {
    if (integrationId) {
      const matched = integrations.find((i) => String(i.id) === String(integrationId));
      if (matched) return matched;
    }
    if (flowData?.integration_id) {
      const matched = integrations.find((i) => String(i.id) === String(flowData.integration_id));
      if (matched) return matched;
    }
    return null;
  }, [integrationId, flowData, integrations]);

  const currentAccountName = useMemo(() => {
    if (currentAccount) {
      return currentAccount.fb_page_name || currentAccount.ig_username || currentAccount.name || currentAccount.wa_phone_number_id;
    }
    if (flowData?.fb_page_name) return flowData.fb_page_name;
    if (flowData?.ig_username) return `@${flowData.ig_username}`;
    if (flowData?.integration_name) return flowData.integration_name;
    return null;
  }, [currentAccount, flowData]);

  const platformUrl = useMemo(() => {
    return getPlatformUrl(currentAccount, platform);
  }, [currentAccount, platform]);

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
          flowAPI.getOne(id),
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

        const flow = res.status === 'fulfilled' ? (res.value.data?.flow || res.value.data) : null;
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

        // Auto-add start node if empty
        if (!loadedNodes.length) {
          loadedNodes = [{
            id: generateNodeId('start'),
            type: 'start',
            position: { x: 400, y: 100 },
            data: { ...DEFAULT_NODE_DATA.start },
          }];
        }

        // Ensure all nodes have proper data defaults merged and Left-to-Right handle positions
        loadedNodes = loadedNodes.map((n) => {
          const nodeData = {
            ...(DEFAULT_NODE_DATA[n.type] || {}),
            ...n.data,
            _unsupported: !isNodeSupportedOnPlatform(n.type, flow.platform || 'WEBCHAT'),
          };

          if (n.type === 'start') {
            if (nodeData.keywords === undefined) {
              if (flow.trigger_keyword) {
                nodeData.keywords = flow.trigger_keyword.split(',').map((k) => k.trim()).filter(Boolean);
              } else {
                nodeData.keywords = ['hi', 'hello'];
              }
            }
          }

          return {
            ...n,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: nodeData,
          };
        });

        // Normalize loaded edges to smoothstep with Left-to-Right orientation
        loadedEdges = loadedEdges.map((e) => ({
          ...e,
          type: 'smoothstep',
          animated: true,
          sourceHandle: (e.sourceHandle === 'default' || e.sourceHandle === 'bottom') ? undefined : e.sourceHandle,
          targetHandle: (e.targetHandle === 'default' || e.targetHandle === 'top') ? undefined : e.targetHandle,
        }));

        setNodes(loadedNodes);
        setEdges(loadedEdges);
      } catch (err) {
        console.error('Failed to load flow:', err);
      } finally {
        setLoading(false);
      }
    }

    if (id) loadFlow();
  }, [id, setNodes, setEdges]);

  /* ── Auto-save debounced ────────────────────────────────── */
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        if (!id || id === 'new') return;
        const currentNodes = nodesRef.current || [];
        // Do not auto-save if any node has missing data
        const hasErrors = currentNodes.some((n) => validateNodeData(n) !== null);
        if (hasErrors) return;

        setAutoSaveStatus('saving');
        const startNode = currentNodes.find((n) => n.type === 'start');
        const triggerType = (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
        let triggerKeyword = flowData?.trigger_keyword || '';
        if (startNode?.data?.keywords) {
          triggerKeyword = Array.isArray(startNode.data.keywords)
            ? startNode.data.keywords.join(',')
            : startNode.data.keywords;
        }

        await flowAPI.update(id, {
          name: flowName,
          platform,
          integration_id: integrationId || null,
          trigger_type: triggerType,
          trigger_keyword: triggerKeyword,
          nodes_json: JSON.stringify(currentNodes.map((n) => {
            const { _unsupported, _validationError, ...rest } = n.data;
            return { ...n, data: rest };
          })),
          edges_json: JSON.stringify(edgesRef.current),
        });
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(''), 2500);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('');
      }
    }, 2000);
  }, [id, flowName, platform, integrationId, flowData]);

  /* ── Trigger auto-save on changes ───────────────────────── */
  useEffect(() => {
    if (!loading && flowData) {
      triggerAutoSave();
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [nodes, edges, triggerAutoSave, loading, flowData]);

  /* ── Auto-Layout / Rearrange Flow ───────────────────────── */
  const handleAutoLayout = useCallback(() => {
    const currentNodes = nodesRef.current || nodes;
    const currentEdges = edgesRef.current || edges;
    const layouted = getAutoLayoutedNodes(currentNodes, currentEdges);
    setNodes(layouted);
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        type: 'smoothstep',
        animated: true,
        sourceHandle: (e.sourceHandle === 'default' || e.sourceHandle === 'bottom') ? undefined : e.sourceHandle,
        targetHandle: (e.targetHandle === 'default' || e.targetHandle === 'top') ? undefined : e.targetHandle,
      }))
    );
    setTimeout(() => {
      fitView({ padding: 0.25, duration: 400 });
    }, 50);
  }, [nodes, edges, setNodes, setEdges, fitView]);

  /* ── Manual save (with strict data validation) ─────────── */
  const handleSave = async () => {
    try {
      // 1. Validate all components have required data
      const currentNodes = nodesRef.current || [];
      const invalidList = [];
      currentNodes.forEach((n) => {
        const err = validateNodeData(n);
        if (err) invalidList.push({ node: n, error: err });
      });

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

      await flowAPI.update(id, {
        name: flowName,
        platform,
        integration_id: integrationId || null,
        trigger_type: triggerType,
        trigger_keyword: triggerKeyword,
        nodes_json: JSON.stringify(currentNodes.map((n) => {
          const { _unsupported, _validationError, ...rest } = n.data;
          return { ...n, data: rest };
        })),
        edges_json: JSON.stringify(edges),
      });
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 2500);

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Flow saved successfully!',
        showConfirmButton: false,
        timer: 2000,
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
  };

  const connectingNodeRef = useRef(null);
  const [quickPicker, setQuickPicker] = useState(null);

  /* ── Edge connection ────────────────────────────────────── */
  const onConnect = useCallback(
    (params) =>
      setEdges((eds) => {
        const filtered = eds.filter(
          (edge) => !(edge.source === params.source && (edge.sourceHandle || null) === (params.sourceHandle || null))
        );
        return addEdge({ ...params, type: 'smoothstep', animated: true }, filtered);
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

      const targetIsPane =
        event.target?.classList?.contains('react-flow__pane') ||
        event.target?.closest('.react-flow__pane');

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
        type: 'smoothstep',
        animated: true,
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
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
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
    <div className="flow-builder-root">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="fb-toolbar">
        <button
          type="button"
          className="fb-toolbar-back"
          onClick={() => navigate('/bots')}
          title="Back to Bot Manager"
        >
          <ArrowLeft size={16} />
          <span>Bot Manager</span>
        </button>
        <input
          className="fb-toolbar-name"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          onBlur={triggerAutoSave}
          spellCheck={false}
        />
        <div className="fb-toolbar-spacer" />
        <div className={`fb-autosave-indicator ${autoSaveStatus ? 'visible' : ''}`}>
          {autoSaveStatus === 'saving' && (
            <>
              <Loader2 size={13} className="spin" style={{ animation: 'fb-spin 0.8s linear infinite' }} />
              <span>Saving...</span>
            </>
          )}
          {autoSaveStatus === 'saved' && (
            <>
              <Check size={13} style={{ color: 'var(--success, #10b981)' }} />
              <span style={{ color: 'var(--success, #10b981)' }}>Saved</span>
            </>
          )}
        </div>
        <button
          onClick={handleAutoLayout}
          className="fb-rearrange-btn"
          title="Auto-rearrange all components to save space and look uniform"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: '#334155',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
            height: 35,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f8fafc';
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.color = '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.color = '#334155';
          }}
        >
          <LayoutGrid size={14} style={{ color: '#4f46e5' }} />
          <span>Auto Layout</span>
        </button>

        {/* Connected Platform & Account (Opens live platform profile in new tab) */}
        <a
          href={platformUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fb-account-link"
          title={`Open ${currentAccountName || platform} in new tab`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '6px 13px',
            borderRadius: 8,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            color: '#334155',
            fontSize: 12,
            textDecoration: 'none',
            fontWeight: 600,
            height: 35,
            boxSizing: 'border-box',
            transition: 'all 0.15s ease-in-out',
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f0f2ff';
            e.currentTarget.style.borderColor = '#c7d2fe';
            e.currentTarget.style.color = '#4f46e5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.color = '#334155';
          }}
        >
          <span style={{ fontSize: 13 }}>
            {platform === 'FACEBOOK' ? '📘' : platform === 'INSTAGRAM' ? '📸' : platform === 'WHATSAPP' ? '💬' : platform === 'TELEGRAM' ? '✈️' : platform === 'TIKTOK' ? '🎵' : '🌐'}
          </span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>
            {currentAccountName || `${platform.charAt(0) + platform.slice(1).toLowerCase()} Channel`}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 4,
            background: '#f1f5f9',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}>
            {platform}
          </span>
          <ExternalLink size={12} style={{ color: '#94a3b8', marginLeft: 1 }} />
        </a>

        <button className="fb-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Save size={15} />
          )}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* ── Main Area ───────────────────────────────────────── */}
      <div className="fb-main">
        {/* Left Palette */}
        <NodePalette platform={platform} />

        {/* Canvas */}
        <div className="fb-canvas">
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
            />
          )}
        </div>

        {/* Right Properties Panel */}
        {selectedNode && (
          <PropertiesPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleUpdateNodeData}
            onDelete={handleDeleteNode}
          />
        )}
      </div>
    </div>
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
