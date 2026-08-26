import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
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
  Video, Music, FileText
} from 'lucide-react';
import { flowAPI, uploadAPI, integrationAPI } from '../../services/api';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PLATFORM_RULES = {
  WHATSAPP:  { text: true, image: true, video: true, audio: true, file: true, buttons: 3, quickReplies: false, listMenu: 10, card: false, carousel: false },
  FACEBOOK:  { text: true, image: true, video: true, audio: true, file: true, buttons: 3, quickReplies: 13, listMenu: false, card: true, carousel: 10 },
  INSTAGRAM: { text: true, image: true, video: true, audio: true, file: true, buttons: false, quickReplies: 13, listMenu: false, card: true, carousel: false },
  TELEGRAM:  { text: true, image: true, video: true, audio: true, file: true, buttons: true, quickReplies: false, listMenu: true, card: true, carousel: false },
  WEBCHAT:   { text: true, image: true, video: true, audio: true, file: true, buttons: true, quickReplies: true, listMenu: true, card: true, carousel: true },
};

const NODE_COLORS = {
  start: '#10b981',
  text: '#6366f1',
  image: '#ec4899',
  video: '#f43f5e',
  audio: '#06b6d4',
  file: '#64748b',
  buttons: '#f59e0b',
  quickReplies: '#22d3ee',
  listMenu: '#8b5cf6',
  card: '#a855f7',
  carousel: '#d946ef',
  collectInput: '#14b8a6',
  condition: '#f97316',
  delay: '#64748b',
  handoff: '#6366f1',
  end: '#ef4444',
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
    label: 'Logic',
    items: [
      { type: 'collectInput', label: 'Collect Input' },
      { type: 'condition', label: 'Condition' },
      { type: 'delay', label: 'Delay' },
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
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px;
    background: transparent;
    border: 1px solid #e4e4f0;
    color: #5c5c80;
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-toolbar-back:hover {
    background: #f0f0fa;
    color: #1a1a2e;
    border-color: #c4c4e0;
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
    min-width: 180px;
    max-width: 260px;
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
  if (!platform || !PLATFORM_RULES[platform]) return true;
  const rules = PLATFORM_RULES[platform];
  if (['start', 'end', 'condition', 'delay', 'handoff', 'collectInput'].includes(nodeType)) return true;
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
   CUSTOM NODE COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

/* ── Base wrapper for standard nodes ─────────────────────────── */
function NodeWrapper({ children, color, label, icon: Icon, selected, data, type }) {
  const unsupported = data?._unsupported;
  return (
    <div className={`fb-node${selected ? ' selected' : ''}`}>
      {unsupported && (
        <div className="fb-node-warning" title="Not supported on this platform">
          <AlertTriangle size={12} color="#fff" />
        </div>
      )}
      <div className="fb-node-header" style={{ background: color }}>
        {Icon && <Icon size={14} />}
        <span>{label}</span>
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
          <span style={{ fontWeight: 700, color: '#10b981', textTransform: 'capitalize', fontSize: 11 }}>
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
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
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
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.start }} />
    </NodeWrapper>
  );
}

/* ── Text Node ───────────────────────────────────────────────── */
function TextNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.text} label="Text Message" icon={Type} selected={selected} data={data} type="text">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.text }} />
      <div className="fb-node-body">
        <div className="fb-node-body-preview">
          {data.message || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No message set</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.text }} />
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
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.image }} />
      <div className="fb-node-body">
        {fullUrl ? (
          <img
            src={fullUrl}
            alt="Preview"
            style={{ width: '100%', maxHeight: 90, borderRadius: 6, objectFit: 'cover', display: 'block', marginBottom: 6 }}
          />
        ) : (
          <div style={{
            width: '100%', height: 50, borderRadius: 6, marginBottom: 6,
            background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}>
            <Image size={16} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 10, opacity: 0.4 }}>No image set</span>
          </div>
        )}
        {data.caption && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }} className="fb-node-body-preview">{data.caption}</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.image }} />
    </NodeWrapper>
  );
}

/* ── Video Node ──────────────────────────────────────────────── */
function VideoNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.video} label="Video" icon={Video} selected={selected} data={data} type="video">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.video }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Video size={16} style={{ color: NODE_COLORS.video, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Video Message</div>
          <div style={{ fontSize: 10, opacity: 0.6 }} className="truncate">{data.mediaUrl ? 'Video linked' : 'No video attached'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.video }} />
    </NodeWrapper>
  );
}

/* ── Audio Node ──────────────────────────────────────────────── */
function AudioNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.audio} label="Audio" icon={Music} selected={selected} data={data} type="audio">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.audio }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Music size={16} style={{ color: NODE_COLORS.audio, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Audio Note</div>
          <div style={{ fontSize: 10, opacity: 0.6 }} className="truncate">{data.mediaUrl ? 'Audio linked' : 'No audio attached'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.audio }} />
    </NodeWrapper>
  );
}

/* ── File Node ───────────────────────────────────────────────── */
function FileNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.file} label="File / Document" icon={FileText} selected={selected} data={data} type="file">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.file }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={16} style={{ color: NODE_COLORS.file, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{data.filename || 'Document'}</div>
          <div style={{ fontSize: 10, opacity: 0.6 }} className="truncate">{data.mediaUrl ? 'File linked' : 'No file attached'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.file }} />
    </NodeWrapper>
  );
}

/* ── Buttons Node ────────────────────────────────────────────── */
function ButtonsNode({ data, selected }) {
  const buttons = data.buttons || [];
  return (
    <NodeWrapper color={NODE_COLORS.buttons} label="Buttons" icon={MousePointerClick} selected={selected} data={data} type="buttons">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.buttons }} />
      {data.message && (
        <div className="fb-node-body">
          <div className="fb-node-body-preview">{data.message}</div>
        </div>
      )}
      <div className="fb-node-btn-list">
        {buttons.map((btn, i) => (
          <div key={i} className="fb-node-btn-chip">
            <span>{btn || `Button ${i + 1}`}</span>
            <ChevronRight size={12} style={{ opacity: 0.5 }} />
            <Handle
              type="source"
              position={Position.Right}
              id={`btn-${i}`}
              style={{
                background: NODE_COLORS.buttons,
                top: 'auto',
                right: -6,
              }}
            />
          </div>
        ))}
      </div>
    </NodeWrapper>
  );
}

/* ── Quick Replies Node ──────────────────────────────────────── */
function QuickRepliesNode({ data, selected }) {
  const replies = data.replies || [];
  return (
    <NodeWrapper color={NODE_COLORS.quickReplies} label="Quick Replies" icon={Keyboard} selected={selected} data={data} type="quickReplies">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.quickReplies }} />
      {data.message && (
        <div className="fb-node-body">
          <div className="fb-node-body-preview">{data.message}</div>
        </div>
      )}
      <div className="fb-node-reply-chips">
        {replies.map((r, i) => (
          <span key={i} className="fb-node-reply-chip">{r || `Reply ${i + 1}`}</span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.quickReplies }} />
    </NodeWrapper>
  );
}

/* ── List Menu Node ──────────────────────────────────────────── */
function ListMenuNode({ data, selected }) {
  const items = data.items || [];
  return (
    <NodeWrapper color={NODE_COLORS.listMenu} label="List Menu" icon={ListOrdered} selected={selected} data={data} type="listMenu">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.listMenu }} />
      <div className="fb-node-body">
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary, #e2e8f0)' }}>
          {data.title || 'Menu'}
        </div>
        {items.slice(0, 4).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: NODE_COLORS.listMenu, flexShrink: 0 }} />
            <span style={{ fontSize: 11 }}>{item || `Item ${i + 1}`}</span>
          </div>
        ))}
        {items.length > 4 && (
          <span style={{ fontSize: 10, opacity: 0.5 }}>+{items.length - 4} more</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.listMenu }} />
    </NodeWrapper>
  );
}

/* ── Card Node ───────────────────────────────────────────────── */
function CardNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.card} label="Card" icon={CreditCard} selected={selected} data={data} type="card">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.card }} />
      <div className="fb-node-body">
        {data.imageUrl && (
          <div style={{
            width: '100%', height: 60, borderRadius: 6, marginBottom: 8,
            background: `url(${data.imageUrl}) center/cover no-repeat`,
            backgroundColor: 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!data.imageUrl && <Image size={20} style={{ opacity: 0.3 }} />}
          </div>
        )}
        {!data.imageUrl && (
          <div style={{
            width: '100%', height: 50, borderRadius: 6, marginBottom: 8,
            background: 'rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Image size={18} style={{ opacity: 0.25, color: 'var(--text-secondary)' }} />
          </div>
        )}
        <div style={{ fontWeight: 600, color: 'var(--text-primary, #e2e8f0)', marginBottom: 2 }}>
          {data.title || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No title</span>}
        </div>
        {data.subtitle && (
          <div style={{ fontSize: 11, opacity: 0.6 }}>{data.subtitle}</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.card }} />
    </NodeWrapper>
  );
}

/* ── Carousel Node ───────────────────────────────────────────── */
function CarouselNode({ data, selected }) {
  const cardCount = data.cards?.length || 0;
  return (
    <NodeWrapper color={NODE_COLORS.carousel} label="Carousel" icon={Layers} selected={selected} data={data} type="carousel">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.carousel }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'rgba(244, 114, 182, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 16, color: NODE_COLORS.carousel,
        }}>
          {cardCount}
        </div>
        <span>{cardCount === 1 ? '1 card' : `${cardCount} cards`}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.carousel }} />
    </NodeWrapper>
  );
}

/* ── Collect Input Node ──────────────────────────────────────── */
function CollectInputNode({ data, selected }) {
  const typeIcons = { name: User, email: Mail, phone: Phone, custom: Settings2 };
  const TypeIcon = typeIcons[data.inputType] || Settings2;
  return (
    <NodeWrapper color={NODE_COLORS.collectInput} label="Collect Input" icon={Mail} selected={selected} data={data} type="collectInput">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.collectInput }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TypeIcon size={16} style={{ color: NODE_COLORS.collectInput, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
            {data.inputType || 'custom'}
          </div>
          {data.variable && (
            <div style={{ fontSize: 10, opacity: 0.6 }}>→ {data.variable}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.collectInput }} />
    </NodeWrapper>
  );
}

/* ── Condition Node ──────────────────────────────────────────── */
function ConditionNode({ data, selected }) {
  const unsupported = data?._unsupported;
  return (
    <div className={`fb-node-condition${selected ? ' selected' : ''}`}>
      {unsupported && (
        <div className="fb-node-warning" title="Not supported on this platform">
          <AlertTriangle size={12} color="#fff" />
        </div>
      )}
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.condition }} />
      <div className="fb-node-header" style={{ background: NODE_COLORS.condition, borderRadius: '11px 11px 0 0' }}>
        <GitBranch size={14} />
        <span>Condition</span>
      </div>
      <div className="fb-node-body">
        {data.variable ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
            {data.variable} {data.operator || '=='} {data.value || '?'}
          </span>
        ) : (
          <span style={{ opacity: 0.4, fontStyle: 'italic', fontSize: 11 }}>No condition set</span>
        )}
      </div>
      <div className="fb-condition-outputs">
        <span className="fb-condition-label fb-condition-yes">Yes</span>
        <span className="fb-condition-label fb-condition-no">No</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ background: '#10b981', left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ background: '#ef4444', left: '70%' }}
      />
    </div>
  );
}

/* ── Delay Node ──────────────────────────────────────────────── */
function DelayNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.delay} label="Delay" icon={Clock} selected={selected} data={data} type="delay">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.delay }} />
      <div className="fb-node-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clock size={18} style={{ color: NODE_COLORS.delay, flexShrink: 0 }} />
        <div>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>
            {data.seconds || 0}
          </span>
          <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.6 }}>seconds</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: NODE_COLORS.delay }} />
    </NodeWrapper>
  );
}

/* ── Handoff Node ────────────────────────────────────────────── */
function HandoffNode({ data, selected }) {
  return (
    <NodeWrapper color={NODE_COLORS.handoff} label="Agent Handoff" icon={Headphones} selected={selected} data={data} type="handoff">
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.handoff }} />
      <div className="fb-node-body">
        {data.message ? (
          <div className="fb-node-body-preview">{data.message}</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Headphones size={16} style={{ opacity: 0.4 }} />
            <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 11 }}>Transfer to agent</span>
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
      <Handle type="target" position={Position.Top} style={{ background: NODE_COLORS.end }} />
      <div className="fb-node-body">
        {data.message ? (
          <div className="fb-node-body-preview">{data.message}</div>
        ) : (
          <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 11 }}>End of flow</span>
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
              <label>Quick Replies</label>
              {(data.replies || []).map((reply, i) => (
                <div key={i} className="fb-list-item">
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

  return (
    <div className="fb-palette">
      <div className="fb-palette-header">Node Palette</div>
      {PALETTE_CATEGORIES.map((cat) => (
        <React.Fragment key={cat.label}>
          <div className="fb-palette-category">{cat.label}</div>
          {cat.items.map((item) => {
            const Icon = NODE_ICONS[item.type];
            const color = NODE_COLORS[item.type];
            const supported = isNodeSupportedOnPlatform(item.type, platform);
            return (
              <div
                key={item.type}
                className="fb-palette-item"
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
                style={{ opacity: supported ? 1 : 0.45 }}
                title={supported ? item.label : `Not supported on ${platform}`}
              >
                <div className="fb-palette-item-icon" style={{ background: `${color}20` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <span>{item.label}</span>
                {!supported && <AlertTriangle size={13} style={{ color: 'var(--warning, #f59e0b)', marginLeft: 'auto' }} />}
                {supported && (
                  <span className="fb-palette-item-grip">
                    <GripVertical size={14} />
                  </span>
                )}
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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
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
        if (search.trim()) {
          return (
            item.label.toLowerCase().includes(search.toLowerCase()) ||
            item.type.toLowerCase().includes(search.toLowerCase())
          );
        }
        return true;
      }),
    })).filter((cat) => cat.items.length > 0);
  }, [search]);

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

function FlowBuilderInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowData, setFlowData] = useState(null);
  const [flowName, setFlowName] = useState('');
  const [platform, setPlatform] = useState('WEBCHAT');
  const [integrationId, setIntegrationId] = useState(null);
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
          setIntegrations(intRes.value.data?.integrations || []);
        }

        const flow = res.status === 'fulfilled' ? (res.value.data?.flow || res.value.data) : null;
        if (!flow) return;

        setFlowData(flow);
        setFlowName(flow.name || 'Untitled Flow');
        setPlatform(flow.platform || 'WEBCHAT');
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

        // Ensure all nodes have proper data defaults merged
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

          return { ...n, data: nodeData };
        });

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
        setAutoSaveStatus('saving');
        const currentNodes = nodesRef.current || [];
        const startNode = currentNodes.find((n) => n.type === 'start');
        const triggerType = (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
        const rawKeywords = startNode?.data?.keywords || (startNode?.data?.trigger_keyword ? startNode.data.trigger_keyword.split(',') : []);
        const triggerKeyword = Array.isArray(rawKeywords) ? rawKeywords.join(',') : (rawKeywords || '');

        await flowAPI.update(id, {
          name: flowName,
          triggerType,
          triggerKeyword,
          nodes_json: JSON.stringify(currentNodes.map((n) => {
            const { _unsupported, ...rest } = n.data;
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
  }, [id, flowName]);

  /* ── Trigger auto-save on changes ───────────────────────── */
  useEffect(() => {
    if (!loading && flowData) {
      triggerAutoSave();
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [nodes, edges, triggerAutoSave, loading, flowData]);

  /* ── Manual save ────────────────────────────────────────── */
  const handleSave = async () => {
    try {
      setSaving(true);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      const startNode = nodes.find((n) => n.type === 'start');
      const triggerType = (startNode?.data?.trigger_type || 'KEYWORD').toUpperCase();
      const rawKeywords = startNode?.data?.keywords || (startNode?.data?.trigger_keyword ? startNode.data.trigger_keyword.split(',') : []);
      const triggerKeyword = Array.isArray(rawKeywords) ? rawKeywords.join(',') : (rawKeywords || '');

      await flowAPI.update(id, {
        name: flowName,
        platform,
        integrationId: integrationId ? Number(integrationId) : null,
        triggerType,
        triggerKeyword,
        nodes_json: JSON.stringify(nodes.map((n) => {
          const { _unsupported, ...rest } = n.data;
          return { ...n, data: rest };
        })),
        edges_json: JSON.stringify(edges),
      });
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 2500);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const connectingNodeRef = useRef(null);
  const [quickPicker, setQuickPicker] = useState(null);

  /* ── Edge connection ────────────────────────────────────── */
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds)),
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
      setEdges((eds) => [...eds, newEdge]);
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
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...newData, _unsupported: !isNodeSupportedOnPlatform(n.type, platform) } } : n
        )
      );
      // Keep selectedNode in sync
      setSelectedNode((prev) =>
        prev && prev.id === nodeId
          ? { ...prev, data: { ...newData, _unsupported: !isNodeSupportedOnPlatform(prev.type, platform) } }
          : prev
      );
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
          className="fb-toolbar-back"
          onClick={() => navigate('/bots')}
          title="Back to Bot Manager"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8 }}
        >
          <ArrowLeft size={16} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Bot Manager</span>
        </button>
        <input
          className="fb-toolbar-name"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          onBlur={triggerAutoSave}
          spellCheck={false}
        />
        <select
          value={integrationId ? `integ_${integrationId}` : `plat_${platform}`}
          onChange={(e) => {
            const val = e.target.value;
            if (val.startsWith('integ_')) {
              const selId = val.replace('integ_', '');
              const matched = integrations.find((i) => String(i.id) === String(selId));
              setIntegrationId(selId);
              if (matched?.platform) setPlatform(matched.platform.toUpperCase());
            } else if (val.startsWith('plat_')) {
              setIntegrationId(null);
              setPlatform(val.replace('plat_', ''));
            }
            triggerAutoSave();
          }}
          className="fb-platform-badge"
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            background: '#f0f0fa',
            border: '1px solid #e4e4f0',
            color: '#4f46e5',
            cursor: 'pointer',
            outline: 'none',
          }}
          title="Assigned Page / Channel (Click to switch)"
        >
          {integrations.length > 0 && (
            <optgroup label="Connected Pages & Channels" style={{ background: '#ffffff', color: '#1a1a2e' }}>
              {integrations.map((i) => {
                const icon = i.platform === 'FACEBOOK' ? '📘' : i.platform === 'INSTAGRAM' ? '📸' : i.platform === 'WHATSAPP' ? '💬' : '🌐';
                return (
                  <option key={i.id} value={`integ_${i.id}`} style={{ background: '#ffffff', color: '#1a1a2e' }}>
                    {icon} {i.fb_page_name || i.name} ({i.platform})
                  </option>
                );
              })}
            </optgroup>
          )}
          <optgroup label="General Platform (All Pages)" style={{ background: '#ffffff', color: '#1a1a2e' }}>
            <option value="plat_FACEBOOK" style={{ background: '#ffffff', color: '#1a1a2e' }}>📘 Facebook (All Pages)</option>
            <option value="plat_INSTAGRAM" style={{ background: '#ffffff', color: '#1a1a2e' }}>📸 Instagram (All Accounts)</option>
            <option value="plat_WHATSAPP" style={{ background: '#ffffff', color: '#1a1a2e' }}>💬 WhatsApp (All Numbers)</option>
            <option value="plat_TELEGRAM" style={{ background: '#ffffff', color: '#1a1a2e' }}>✈️ Telegram</option>
            <option value="plat_WEBCHAT" style={{ background: '#ffffff', color: '#1a1a2e' }}>🌐 Website Live Chat</option>
          </optgroup>
        </select>
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
            fitView
            fitViewOptions={{ padding: 0.4, maxZoom: 0.72 }}
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
