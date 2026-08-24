import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, useNodesState, useEdgesState,
  addEdge, ReactFlowProvider, useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Save, Loader2, Check, AlertTriangle,
  MessageSquare, ListOrdered, LayoutGrid, CreditCard,
  Layers, Keyboard, GitBranch, Clock, Headphones,
  CircleStop, Play, Type, GripVertical, X, Plus, Trash2,
  ChevronRight, Zap, MousePointerClick, Mail, Phone,
  User, Settings2, CornerDownRight, Image
} from 'lucide-react';
import { flowAPI } from '../../services/api';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PLATFORM_RULES = {
  WHATSAPP:  { text: true, buttons: 3, quickReplies: false, listMenu: 10, card: false, carousel: false },
  FACEBOOK:  { text: true, buttons: 3, quickReplies: 13, listMenu: false, card: true, carousel: 10 },
  INSTAGRAM: { text: true, buttons: false, quickReplies: 13, listMenu: false, card: true, carousel: false },
  TELEGRAM:  { text: true, buttons: true, quickReplies: false, listMenu: true, card: true, carousel: false },
  WEBCHAT:   { text: true, buttons: true, quickReplies: true, listMenu: true, card: true, carousel: true },
};

const NODE_COLORS = {
  start: '#10b981',
  text: '#6366f1',
  buttons: '#f59e0b',
  quickReplies: '#22d3ee',
  listMenu: '#8b5cf6',
  card: '#ec4899',
  carousel: '#f472b6',
  collectInput: '#14b8a6',
  condition: '#f97316',
  delay: '#64748b',
  handoff: '#6366f1',
  end: '#ef4444',
};

const NODE_ICONS = {
  start: Play,
  text: Type,
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
  start:        { label: 'Start', trigger_type: 'keyword' },
  text:         { label: 'Text Message', message: '' },
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
    background: var(--bg-base, #0f1117);
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
    background: var(--bg-surface, #1a1d2e);
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    z-index: 20;
    flex-shrink: 0;
  }
  .fb-toolbar-back {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-toolbar-back:hover {
    background: var(--bg-hover, rgba(255,255,255,0.05));
    color: var(--text-primary, #f1f5f9);
  }
  .fb-toolbar-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #f1f5f9);
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
    border-color: var(--border, rgba(255,255,255,0.12));
    background: var(--bg-card, #1e2235);
  }
  .fb-platform-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    background: rgba(99, 102, 241, 0.15);
    color: var(--primary, #6366f1);
    border: 1px solid rgba(99, 102, 241, 0.25);
  }
  .fb-toolbar-spacer { flex: 1; }
  .fb-autosave-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, #94a3b8);
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
    background: var(--primary, #6366f1);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-save-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
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
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: rgba(26, 29, 46, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid var(--border, rgba(255,255,255,0.08));
    z-index: 10;
    overflow-y: auto;
  }
  .fb-palette::-webkit-scrollbar { width: 4px; }
  .fb-palette::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
  .fb-palette-header {
    padding: 16px 16px 8px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--text-secondary, #94a3b8);
  }
  .fb-palette-category {
    padding: 4px 12px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary, #64748b);
    margin-top: 12px;
    margin-bottom: 2px;
  }
  .fb-palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    margin: 2px 8px;
    border-radius: 8px;
    cursor: grab;
    transition: all 0.2s;
    user-select: none;
    color: var(--text-primary, #e2e8f0);
    font-size: 13px;
    font-weight: 500;
  }
  .fb-palette-item:hover {
    background: var(--bg-hover, rgba(255,255,255,0.06));
    transform: translateX(2px);
  }
  .fb-palette-item:active { cursor: grabbing; }
  .fb-palette-item-icon {
    width: 32px; height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .fb-palette-item-grip {
    margin-left: auto;
    color: var(--text-secondary, #475569);
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
  .fb-canvas .react-flow__minimap { border-radius: 8px; overflow: hidden; border: 1px solid var(--border, rgba(255,255,255,0.08)); }
  .fb-canvas .react-flow__controls { border-radius: 8px; overflow: hidden; border: 1px solid var(--border, rgba(255,255,255,0.08)); }
  .fb-canvas .react-flow__controls button {
    background: var(--bg-surface, #1a1d2e);
    color: var(--text-primary, #e2e8f0);
    border-color: var(--border, rgba(255,255,255,0.08));
  }
  .fb-canvas .react-flow__controls button:hover {
    background: var(--bg-hover, rgba(255,255,255,0.08));
  }

  /* ── Properties Panel (Right) ──────────────────────────────── */
  .fb-props {
    width: 320px;
    flex-shrink: 0;
    background: rgba(26, 29, 46, 0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-left: 1px solid var(--border, rgba(255,255,255,0.08));
    z-index: 10;
    display: flex;
    flex-direction: column;
    animation: fb-slide-in 0.25s ease-out;
    overflow-y: auto;
  }
  @keyframes fb-slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .fb-props::-webkit-scrollbar { width: 4px; }
  .fb-props::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
  .fb-props-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  }
  .fb-props-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary, #f1f5f9);
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
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-props-close:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  .fb-props-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .fb-field { display: flex; flex-direction: column; gap: 6px; }
  .fb-field label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-secondary, #94a3b8);
  }
  .fb-field input,
  .fb-field textarea,
  .fb-field select {
    background: var(--bg-card, #1e2235);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 13px;
    color: var(--text-primary, #e2e8f0);
    outline: none;
    transition: all 0.2s;
    font-family: inherit;
    resize: vertical;
  }
  .fb-field input:focus,
  .fb-field textarea:focus,
  .fb-field select:focus {
    border-color: var(--primary, #6366f1);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
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
    color: var(--text-secondary, #475569);
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .fb-list-item-del:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  .fb-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px dashed var(--border, rgba(255,255,255,0.12));
    background: transparent;
    color: var(--primary, #6366f1);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .fb-add-btn:hover { background: rgba(99, 102, 241, 0.08); border-color: var(--primary, #6366f1); }
  .fb-delete-node-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.25);
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
  }
  .fb-delete-node-btn:hover { background: rgba(239, 68, 68, 0.18); }

  /* ── Custom Node Styles ────────────────────────────────────── */
  .fb-node {
    min-width: 180px;
    max-width: 260px;
    border-radius: 12px;
    background: var(--bg-card, #1e2235);
    border: 1.5px solid var(--border, rgba(255,255,255,0.08));
    box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2);
    overflow: visible;
    transition: box-shadow 0.2s, border-color 0.2s;
    position: relative;
  }
  .fb-node:hover {
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25);
  }
  .fb-node.selected {
    border-color: var(--primary, #6366f1);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2), 0 8px 32px rgba(0,0,0,0.4);
  }
  .fb-node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 11px 11px 0 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #fff;
  }
  .fb-node-body {
    padding: 10px 14px 12px;
    font-size: 12px;
    color: var(--text-secondary, #94a3b8);
    line-height: 1.5;
  }
  .fb-node-body-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    word-break: break-word;
  }
  .fb-node-warning {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px; height: 22px;
    background: var(--warning, #f59e0b);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
    z-index: 2;
  }
  .fb-node-btn-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 14px 12px;
  }
  .fb-node-btn-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 10px;
    border-radius: 6px;
    background: rgba(255,255,255,0.06);
    font-size: 11px;
    color: var(--text-primary, #e2e8f0);
    font-weight: 500;
    position: relative;
  }
  .fb-node-reply-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 14px 12px;
  }
  .fb-node-reply-chip {
    padding: 4px 10px;
    border-radius: 14px;
    background: rgba(255,255,255,0.08);
    font-size: 10px;
    color: var(--text-primary, #e2e8f0);
    font-weight: 500;
  }

  /* ── Condition diamond ─────────────────────────────────────── */
  .fb-node-condition {
    min-width: 160px;
    max-width: 220px;
    border-radius: 12px;
    background: var(--bg-card, #1e2235);
    border: 1.5px solid var(--border, rgba(255,255,255,0.08));
    box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    transform: rotate(0deg);
    position: relative;
    overflow: visible;
    transition: box-shadow 0.2s, border-color 0.2s;
  }
  .fb-node-condition:hover {
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .fb-node-condition.selected {
    border-color: var(--primary, #6366f1);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2), 0 8px 32px rgba(0,0,0,0.4);
  }

  /* ── React Flow Handle overrides ───────────────────────────── */
  .react-flow__handle {
    width: 12px !important;
    height: 12px !important;
    border: 2px solid var(--bg-surface, #1a1d2e) !important;
    border-radius: 50% !important;
    transition: all 0.2s !important;
  }
  .react-flow__handle:hover {
    transform: scale(1.3) !important;
  }
  .react-flow__handle-top { top: -6px !important; }
  .react-flow__handle-bottom { bottom: -6px !important; }
  .react-flow__handle-right { right: -6px !important; }

  /* ── Edge styling ──────────────────────────────────────────── */
  .react-flow__edge-path {
    stroke: rgba(99, 102, 241, 0.5) !important;
    stroke-width: 2 !important;
  }
  .react-flow__edge.selected .react-flow__edge-path {
    stroke: var(--primary, #6366f1) !important;
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
  return (
    <NodeWrapper color={NODE_COLORS.start} label="Start" icon={Play} selected={selected} data={data} type="start">
      <div className="fb-node-body">
        <span style={{ fontSize: 11, opacity: 0.8 }}>Trigger: </span>
        <span style={{ fontWeight: 600, color: '#10b981' }}>{data.trigger_type || 'keyword'}</span>
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
          <div className="fb-field">
            <label>Trigger Type</label>
            <select value={data.trigger_type || 'keyword'} onChange={(e) => updateField('trigger_type', e.target.value)}>
              <option value="keyword">Keyword</option>
              <option value="first_message">First Message</option>
              <option value="any_message">Any Message</option>
              <option value="button_payload">Button Payload</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
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
            <div className="fb-field">
              <label>Image URL</label>
              <input
                value={data.imageUrl || ''}
                onChange={(e) => updateField('imageUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
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
                  <input
                    value={card.imageUrl || ''}
                    onChange={(e) => {
                      const updated = [...(data.cards || [])];
                      updated[i] = { ...updated[i], imageUrl: e.target.value };
                      updateField('cards', updated);
                    }}
                    placeholder="Image URL"
                    style={{
                      width: '100%',
                      background: 'var(--bg-card)', border: '1px solid var(--border, rgba(255,255,255,0.06))',
                      borderRadius: 6, padding: '6px 10px', fontSize: 12,
                      color: 'var(--text-primary)', outline: 'none',
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
        const res = await flowAPI.getOne(id);
        const flow = res.data?.flow || res.data;

        setFlowData(flow);
        setFlowName(flow.name || 'Untitled Flow');
        setPlatform(flow.platform || 'WEBCHAT');

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
        loadedNodes = loadedNodes.map((n) => ({
          ...n,
          data: {
            ...(DEFAULT_NODE_DATA[n.type] || {}),
            ...n.data,
            _unsupported: !isNodeSupportedOnPlatform(n.type, flow.platform || 'WEBCHAT'),
          },
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
        setAutoSaveStatus('saving');
        await flowAPI.update(id, {
          name: flowName,
          nodes_json: JSON.stringify(nodesRef.current.map((n) => {
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

      await flowAPI.update(id, {
        name: flowName,
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

  /* ── Edge connection ────────────────────────────────────── */
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds)),
    [setEdges]
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
        <button className="fb-toolbar-back" onClick={() => navigate(-1)} title="Go back">
          <ArrowLeft size={18} />
        </button>
        <input
          className="fb-toolbar-name"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          onBlur={triggerAutoSave}
          spellCheck={false}
        />
        <span className="fb-platform-badge">{platform}</span>
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
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.15}
            maxZoom={2}
          >
            <Background variant="dots" gap={20} size={1} color="rgba(255,255,255,0.05)" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              nodeStrokeWidth={3}
              nodeColor={(n) => NODE_COLORS[n.type] || '#6366f1'}
              maskColor="rgba(0, 0, 0, 0.7)"
              style={{ background: 'var(--bg-surface, #1a1d2e)' }}
            />
          </ReactFlow>
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
