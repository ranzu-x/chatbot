import React, { useState, useEffect, useRef } from 'react';
import {
  X, RotateCcw, Send, MessageSquare, Image as ImageIcon, Video,
  Clock, Sparkles, User, ExternalLink, Music, FileText,
  Calendar, Play, BookOpen, HelpCircle, ShoppingBag, Bot, ArrowLeft, ChevronRight
} from 'lucide-react';
import PlatformIcon from '../../Components/Common/PlatformIcon';
import { expandMessageBlocks } from '../../utils/expandMessageBlocks';

const backendUrl = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
  : 'http://localhost:5000';

const DEFAULT_CHATBOT_CARDS = [
  { id: 'chatbot-1', title: 'Book a demo', subtitle: 'Schedule a personalized demo', icon: 'calendar', trigger: 'Book a demo' },
  { id: 'chatbot-2', title: 'Product tour', subtitle: 'See how it works', icon: 'play', trigger: 'Product tour' },
  { id: 'chatbot-3', title: 'Documentation', subtitle: 'Browse our guides', icon: 'book', trigger: 'Documentation' },
];

function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${backendUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function FlowPhonePreview({
  open = true,
  onClose,
  nodes: rawNodes = [],
  edges: rawEdges = [],
  platform = 'FACEBOOK',
  businessName = 'CareSphere',
}) {
  // A Message Block is previewed as the chain of messages it stands for — the same
  // expansion the server runs before sending (see utils/expandMessageBlocks.js).
  const { nodes, edges } = expandMessageBlocks(rawNodes, rawEdges);

  // Find start node
  const startNode = nodes.find((n) => n.type === 'start');

  const isWebchat = (platform || '').toUpperCase() === 'WEBCHAT' || Boolean(startNode?.data?.chatWidgetStart && (startNode?.data?.targetPlatform || 'WEBCHAT').toUpperCase() === 'WEBCHAT');
  const widgetPrimary = startNode?.data?.buttonBgColor || '#4f46e5';

  const rawCards = startNode?.data?.chatbotCards;
  const cardsList = Array.isArray(rawCards) && rawCards.length > 0
    ? rawCards
    : (typeof rawCards === 'string' ? (() => { try { return JSON.parse(rawCards); } catch { return DEFAULT_CHATBOT_CARDS; } })() : DEFAULT_CHATBOT_CARDS);

  const [viewMode, setViewMode] = useState(isWebchat ? 'home' : 'chat');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(null); // node that needs user input
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef(null);

  // Helper to scroll to bottom of chat
  const scrollToBottom = () => {
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Initialize or restart conversation
  const restartPreview = () => {
    setMessages([]);
    setWaitingForInput(null);
    setIsTyping(false);

    if (isWebchat) {
      setViewMode('home');
      return;
    }

    if (!startNode) return;

    // Find first node connected to start node
    const firstEdge = edges.find((e) => e.source === startNode.id);
    if (firstEdge) {
      const firstTargetNode = nodes.find((n) => n.id === firstEdge.target);
      if (firstTargetNode) {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          renderNodeMessages(firstTargetNode, []);
        }, 500);
      }
    } else {
      // If nothing connected yet, show a welcome preview
      setMessages([
        {
          id: 'welcome',
          sender: 'bot',
          type: 'text',
          text: '👋 Connect steps to the Start Trigger to preview your flow here!',
        },
      ]);
    }
  };

  const handleCardClick = (card, idx) => {
    setViewMode('chat');
    const title = card.title || `Chatbot ${idx + 1}`;
    const handleId = card.id || `chatbot-${idx + 1}`;
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      type: 'text',
      text: title,
    };
    const updated = [userMsg];
    setMessages(updated);
    scrollToBottom();

    if (!startNode) return;

    const matchedEdge =
      edges.find((e) => e.source === startNode.id && e.sourceHandle === handleId) ||
      edges.find((e) => e.source === startNode.id && e.sourceHandle === `chatbot-${idx + 1}`) ||
      edges.find((e) => e.source === startNode.id && e.sourceHandle === 'next-step') ||
      edges.find((e) => e.source === startNode.id);

    if (matchedEdge) {
      const nextNode = nodes.find((n) => n.id === matchedEdge.target);
      if (nextNode) {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          renderNodeMessages(nextNode, updated);
        }, 500);
      }
    }
  };

  const handleStartConversation = () => {
    setViewMode('chat');
    setMessages([]);

    if (!startNode) return;

    const matchedEdge =
      edges.find((e) => e.source === startNode.id && e.sourceHandle === 'next-step') ||
      edges.find((e) => e.source === startNode.id);

    if (matchedEdge) {
      const nextNode = nodes.find((n) => n.id === matchedEdge.target);
      if (nextNode) {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          renderNodeMessages(nextNode, []);
        }, 500);
      }
    } else if (startNode.data?.greetingMessage) {
      setMessages([
        {
          id: `greet-${Date.now()}`,
          sender: 'bot',
          type: 'text',
          text: startNode.data.greetingMessage,
        },
      ]);
    }
  };

  useEffect(() => {
    if (open) restartPreview();
    // Restart only when the preview opens or the Start node changes — not on every canvas edit.
  }, [open, startNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Execute and append a node's content to the chat messages
  const renderNodeMessages = (node, existingMessages = messages) => {
    if (!node) return;

    const data = node.data || {};
    const newItems = [];

    // 1. Text Message
    if (node.type === 'text') {
      const btns = Array.isArray(data.buttons) ? data.buttons : [];
      newItems.push({
        id: `msg-${Date.now()}-text`,
        sender: 'bot',
        type: 'text',
        text: data.message || 'Hello! (Empty message)',
        buttons: btns,
        nodeId: node.id,
      });
    }

    // 2. Buttons / Interactive Choices
    else if (node.type === 'buttons') {
      const btns = Array.isArray(data.buttons) ? data.buttons : [];
      newItems.push({
        id: `msg-${Date.now()}-buttons`,
        sender: 'bot',
        type: 'buttons',
        text: data.message || '',
        buttons: btns,
        nodeId: node.id,
      });
    }

    // 2b. WhatsApp Interactive Message
    else if (node.type === 'interactive') {
      const btns = Array.isArray(data.buttons) ? data.buttons : [];
      newItems.push({
        id: `msg-${Date.now()}-interactive`,
        sender: 'bot',
        type: 'interactive',
        headerType: data.headerType || 'none',
        headerText: data.headerText || '',
        headerMediaUrl: data.headerMediaUrl || '',
        text: data.message || '',
        footerText: data.footerText || '',
        buttons: btns,
        nodeId: node.id,
      });
    }

    // 2c. WhatsApp CTA URL Button — shown like an interactive message with one link button
    else if (node.type === 'whatsappCtaUrl') {
      newItems.push({
        id: `msg-${Date.now()}-cta`,
        sender: 'bot',
        type: 'interactive',
        headerType: data.headerType || 'none',
        headerText: data.headerText || '',
        headerMediaUrl: data.headerMediaUrl || '',
        text: data.body || '',
        footerText: data.footerText || '',
        buttons: [{ title: data.buttonText || 'Open link', type: 'URL', action: 'url', url: data.url || '' }],
        nodeId: node.id,
      });
    }

    // 3. Image (with optional interactive buttons)
    else if (node.type === 'image') {
      const btns = Array.isArray(data.buttons) ? data.buttons : [];
      newItems.push({
        id: `msg-${Date.now()}-image`,
        sender: 'bot',
        type: 'image',
        imageUrl: data.imageUrl || data.mediaUrl || '',
        caption: data.caption || '',
        buttons: btns,
        nodeId: node.id,
      });
    }

    // 3b. Video (with optional interactive buttons)
    else if (node.type === 'video') {
      const btns = Array.isArray(data.buttons) ? data.buttons : [];
      newItems.push({
        id: `msg-${Date.now()}-video`,
        sender: 'bot',
        type: 'video',
        videoUrl: data.mediaUrl || data.videoUrl || '',
        caption: data.caption || data.message || '',
        buttons: btns,
        nodeId: node.id,
      });
    }

    // 4. Quick Replies
    else if (node.type === 'quickReplies') {
      const replies = Array.isArray(data.replies) ? data.replies : [];
      newItems.push({
        id: `msg-${Date.now()}-qr`,
        sender: 'bot',
        type: 'quickReplies',
        text: data.message || '',
        replies,
        nodeId: node.id,
      });
    }

    // 5. Collect Input (User Input Question)
    else if (node.type === 'collectInput') {
      newItems.push({
        id: `msg-${Date.now()}-input`,
        sender: 'bot',
        type: 'collectInput',
        text: data.question || data.message || `Please provide your ${data.inputType || 'information'}:`,
        inputType: data.inputType || 'custom',
        nodeId: node.id,
      });
      setWaitingForInput(node);
    }

    // 6. Delay / Typing
    else if (node.type === 'delay') {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        // Continue to next node automatically
        const nextEdge = edges.find((e) => e.source === node.id);
        if (nextEdge) {
          const nextNode = nodes.find((n) => n.id === nextEdge.target);
          renderNodeMessages(nextNode, [...existingMessages, ...newItems]);
        }
      }, (data.delaySeconds || 2) * 800);
      return;
    }

    // 6a. Message Template — shown as its body text (parameters as typed)
    else if (node.type === 'whatsappTemplate' || node.type === 'messengerTemplate') {
      const meta = data.templateMeta || {};
      const params = data.params || {};
      const fill = (text, section) => String(text || '').replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (m, ph) => params[section]?.[ph] || m);
      const isMessenger = node.type === 'messengerTemplate';
      const chosen = isMessenger ? data.messengerTemplateId : data.templateId;
      const name = isMessenger ? data.messengerTemplateName : data.templateName;
      newItems.push({
        id: `msg-${Date.now()}-template`,
        sender: 'bot',
        type: 'text',
        text: chosen ? [meta.headerText ? fill(meta.headerText, 'header') : '', fill(meta.bodyText, 'body') || `[Template: ${name}]`].filter(Boolean).join('\n\n') : (isMessenger ? '[Utility Template — none selected]' : '[Message Template — none selected]'),
        buttons: (meta.buttons || []).map((b) => ({ title: b.text })),
        nodeId: node.id,
      });
    }

    // 6b. Audio / File / Card / Carousel / List Menu
    else if (node.type === 'audio') {
      newItems.push({ id: `msg-${Date.now()}-audio`, sender: 'bot', type: 'audio', audioUrl: data.audioUrl || data.mediaUrl || '', nodeId: node.id });
    } else if (node.type === 'file') {
      newItems.push({ id: `msg-${Date.now()}-file`, sender: 'bot', type: 'file', filename: data.filename || 'Document', nodeId: node.id });
    } else if (node.type === 'card') {
      newItems.push({ id: `msg-${Date.now()}-card`, sender: 'bot', type: 'card', cards: [{ title: data.title, subtitle: data.subtitle, imageUrl: data.imageUrl }], nodeId: node.id });
    } else if (node.type === 'carousel') {
      newItems.push({ id: `msg-${Date.now()}-carousel`, sender: 'bot', type: 'card', cards: Array.isArray(data.cards) ? data.cards : [], nodeId: node.id });
    } else if (node.type === 'listMenu') {
      const lists = Array.isArray(data.lists) && data.lists.length
        ? data.lists
        : [{ title: data.title, items: data.items || [] }];
      const items = lists.flatMap((l) => (Array.isArray(l.sections) ? l.sections.flatMap((sec) => sec.items || []) : (l.items || [])));
      newItems.push({
        id: `msg-${Date.now()}-list`, sender: 'bot', type: 'text',
        text: lists[0]?.title || 'Menu', buttons: items.map((it) => (typeof it === 'string' ? { title: it } : it)),
        nodeId: node.id, viaList: true,
      });
    }

    // 6c. Silent steps: they change contact data / start something else, they don't send a message
    else if (['actions', 'startSequenceAction', 'stopSequenceAction', 'wait'].includes(node.type)) {
      // nothing to show — the walk just continues to the next step below
    } else if (node.type === 'startAutomation') {
      newItems.push({
        id: `msg-${Date.now()}-auto`, sender: 'bot', type: 'text',
        text: data.flowName ? `▶ Starts the automation "${data.flowName}"` : '▶ Starts another automation',
        nodeId: node.id,
      });
    }

    // 7. Generic Fallback
    else {
      newItems.push({
        id: `msg-${Date.now()}-${node.type}`,
        sender: 'bot',
        type: 'text',
        text: data.message || `[${node.data?.label || node.type}] Executed`,
        nodeId: node.id,
      });
    }

    const updated = [...existingMessages, ...newItems];
    setMessages(updated);
    scrollToBottom();

    // Auto-progress to connected next steps (text, image, video, etc.):
    // If the node has an outgoing next-step / default edge and is not a collectInput,
    // continue automatically so images, videos, and sequential steps show in preview immediately!
    if (node.type !== 'collectInput') {
      const nextEdge =
        edges.find((e) => e.source === node.id && (e.sourceHandle === 'next-step' || !e.sourceHandle)) ||
        edges.find((e) => e.source === node.id);
      if (nextEdge) {
        const nextNode = nodes.find((n) => n.id === nextEdge.target);
        if (nextNode) {
          setIsTyping(true);
          setTimeout(() => {
            setIsTyping(false);
            renderNodeMessages(nextNode, updated);
          }, 600);
        }
      }
    }
  };

  // Handle user clicking an interactive button
  const handleButtonClick = (buttonObjOrTitle, index, sourceNodeId) => {
    const title = typeof buttonObjOrTitle === 'string'
      ? buttonObjOrTitle
      : buttonObjOrTitle?.title || `Button ${index + 1}`;
    const action = typeof buttonObjOrTitle === 'object' ? buttonObjOrTitle?.action : 'flow';
    const targetUrl = typeof buttonObjOrTitle === 'object' ? buttonObjOrTitle?.url : '';

    // If button is URL action, open in new tab
    if (action === 'url' && targetUrl) {
      const urlToOpen = targetUrl.startsWith('http://') || targetUrl.startsWith('https://')
        ? targetUrl
        : `https://${targetUrl}`;
      window.open(urlToOpen, '_blank', 'noopener,noreferrer');
    }

    // If button or quick reply is Go To Flow action, show flow transfer notice in preview
    if (action === 'goToFlow') {
      const flowName = typeof buttonObjOrTitle === 'object' ? buttonObjOrTitle?.flowName : '';
      const userMsg = {
        id: `user-${Date.now()}`,
        sender: 'user',
        type: 'text',
        text: title,
      };
      const jumpMsg = {
        id: `sys-${Date.now() + 1}`,
        sender: 'bot',
        type: 'text',
        text: `↪ [Jumps to flow: ${flowName || 'Selected Flow'}]`,
      };
      setMessages([...messages, userMsg]);
      scrollToBottom();
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, jumpMsg]);
        scrollToBottom();
      }, 600);
      return;
    }

    // Append user response
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      type: 'text',
      text: title,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    scrollToBottom();

    // Find matching edge for this specific button handle first
    const matchedEdge =
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `btn-${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `btn_${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `qr-${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `item-${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `button-${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === 'next-step') ||
      edges.find((e) => e.source === sourceNodeId && !e.sourceHandle) ||
      edges.find((e) => e.source === sourceNodeId);

    if (matchedEdge) {
      const nextNode = nodes.find((n) => n.id === matchedEdge.target);
      if (nextNode) {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          renderNodeMessages(nextNode, updated);
        }, 700);
      }
    }
  };

  // Handle user submitting text input
  const handleSendMessage = (e) => {
    e?.preventDefault();
    const val = inputText.trim();
    if (!val) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      type: 'text',
      text: val,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInputText('');
    scrollToBottom();

    // 1. If currently waiting for user input on collectInput:
    if (waitingForInput) {
      const sourceId = waitingForInput.id;
      setWaitingForInput(null);

      const nextEdge =
        edges.find((e) => e.source === sourceId && e.sourceHandle === 'reply') ||
        edges.find((e) => e.source === sourceId);

      if (nextEdge) {
        const nextNode = nodes.find((n) => n.id === nextEdge.target);
        if (nextNode) {
          setIsTyping(true);
          setTimeout(() => {
            setIsTyping(false);
            renderNodeMessages(nextNode, updated);
          }, 800);
        }
      }
      return;
    }

    // 2. Otherwise, check if text matches any start node trigger keywords
    if (startNode) {
      const triggers = startNode.data?.triggers || [];
      const lower = val.toLowerCase();
      let matched = false;

      for (const t of triggers) {
        const kws = (t.keywords || []).map((k) => k.toLowerCase());
        const mType = t.match_type || 'contains';

        if (mType === 'is' && kws.includes(lower)) matched = true;
        else if (mType === 'begins_with' && kws.some((k) => lower.startsWith(k))) matched = true;
        else if (mType === 'contains' && kws.some((k) => lower.includes(k))) matched = true;
        else if (mType === 'contains_whole_word' && kws.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(lower))) matched = true;
        else if (mType === 'does_not_contain' && !kws.some((k) => lower.includes(k))) matched = true;
        else if (mType === 'thumbs_up' && ['👍', 'thumbs up', '(y)'].includes(lower)) matched = true;
        if (matched) break;
      }

      if (matched) {
        const firstEdge = edges.find((e) => e.source === startNode.id);
        if (firstEdge) {
          const firstTargetNode = nodes.find((n) => n.id === firstEdge.target);
          if (firstTargetNode) {
            setIsTyping(true);
            setTimeout(() => {
              setIsTyping(false);
              renderNodeMessages(firstTargetNode, updated);
            }, 600);
          }
        }
      } else {
        // If it's a webchat / chat widget flow and text was typed, route down next-step
        if (isWebchat || startNode.data?.chatWidgetStart) {
          const nextStepEdge = edges.find((e) => e.source === startNode.id && (e.sourceHandle === 'next-step' || !e.sourceHandle));
          if (nextStepEdge) {
            const nextNode = nodes.find((n) => n.id === nextStepEdge.target);
            if (nextNode) {
              setIsTyping(true);
              setTimeout(() => {
                setIsTyping(false);
                renderNodeMessages(nextNode, updated);
              }, 600);
              return;
            }
          }
        }

        // Unmatched response
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `fallback-${Date.now()}`,
              sender: 'bot',
              type: 'text',
              text: "I didn't quite catch that. Type one of your trigger keywords to start the flow!",
            },
          ]);
          scrollToBottom();
        }, 600);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="flow-preview-wrapper animate-slide-left">
      {/* ── Realistic Smartphone Frame ─────────────────────────── */}
      <div className="flow-phone-device">
        {/* Top Speaker / Camera Notch */}
        <div className="flow-phone-notch">
          <div className="flow-phone-speaker" />
          <div className="flow-phone-camera" />
        </div>

        {/* ── In-App Phone Screen ─────────────────────────────── */}
        <div className="flow-phone-screen">
          {isWebchat && viewMode === 'home' ? (
            /* ── Webchat Widget Home View ─────────────────────── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#ffffff' }}>
              {/* Header with gradient */}
              <div style={{
                padding: '30px 16px 16px',
                background: `linear-gradient(135deg, ${widgetPrimary} 0%, #1e1b4b 100%)`,
                color: '#ffffff', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <PlatformIcon platform="WEBCHAT" size={16} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {startNode?.data?.displayName || businessName || 'Live Chat'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className="flow-phone-header-btn"
                      onClick={restartPreview}
                      title="Restart"
                      style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', width: 24, height: 24 }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      type="button"
                      className="flow-phone-header-btn"
                      onClick={onClose}
                      title="Close"
                      style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', width: 24, height: 24 }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
                <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px 0', lineHeight: 1.2 }}>
                  {startNode?.data?.homeTitle || 'Hi there 👋'}
                </h2>
                <p style={{ fontSize: 11.5, opacity: 0.9, margin: 0 }}>
                  {startNode?.data?.homeSubtitle || 'How can we help you today?'}
                </p>
              </div>

              {/* Body */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex',
                flexDirection: 'column', gap: 11, background: '#f8fafc',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11,
                  color: '#64748b', fontWeight: 600, background: '#ffffff',
                  padding: '4px 10px', borderRadius: 999, border: '1px solid #e2e8f0', alignSelf: 'flex-start',
                }}>
                  <Clock size={12} color={widgetPrimary} />
                  <span>{startNode?.data?.replyTimeText || 'We typically reply within a few minutes'}</span>
                </div>

                {/* 3 Chatbot Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cardsList.map((card, idx) => {
                    const CardIcon = card.icon === 'calendar' ? Calendar
                      : card.icon === 'play' ? Play
                      : card.icon === 'book' ? BookOpen
                      : card.icon === 'sparkles' ? Sparkles
                      : card.icon === 'shopping' ? ShoppingBag
                      : card.icon === 'help' ? HelpCircle
                      : MessageSquare;

                    return (
                      <div
                        key={card.id || idx}
                        onClick={() => handleCardClick(card, idx)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '11px 13px', borderRadius: 12, background: '#ffffff',
                          border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 9, background: '#ede9fe', color: widgetPrimary,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <CardIcon size={16} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                              {card.title || `Chatbot ${idx + 1}`}
                            </div>
                            {card.subtitle && (
                              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 1 }}>
                                {card.subtitle}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} color="#94a3b8" />
                      </div>
                    );
                  })}
                </div>

                {/* Start a conversation button */}
                <button
                  type="button"
                  onClick={handleStartConversation}
                  style={{
                    marginTop: 4, width: '100%', padding: '11px 14px', borderRadius: 12,
                    background: widgetPrimary, color: '#ffffff', border: 'none',
                    fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                  }}
                >
                  <MessageSquare size={15} />
                  <span>{startNode?.data?.startConversationText || 'Start a conversation'}</span>
                </button>
              </div>

              {/* Footer */}
              <div style={{
                padding: '9px 14px', textAlign: 'center', fontSize: 10.5,
                color: '#94a3b8', background: '#ffffff', borderTop: '1px solid #f1f5f9',
              }}>
                Powered by <strong style={{ color: '#64748b' }}>Nexa AI</strong>
              </div>
            </div>
          ) : (
            <>
              {/* Top App Header */}
              <div className="flow-phone-header">
                <div className="flow-phone-header-left">
                  {isWebchat && (
                    <button
                      type="button"
                      className="flow-phone-header-btn"
                      onClick={() => setViewMode('home')}
                      title="Back to widget home"
                      style={{ marginRight: 2 }}
                    >
                      <ArrowLeft size={14} />
                    </button>
                  )}
                  <div className="flow-phone-avatar">
                    <PlatformIcon platform={platform} size={22} />
                  </div>
                  <div className="flow-phone-header-info">
                    <div className="flow-phone-header-name">
                      {startNode?.data?.displayName || businessName || 'CareSphere'}
                    </div>
                    <div className="flow-phone-header-status">
                      {isWebchat ? 'Live Webchat' : 'Business chat'}
                    </div>
                  </div>
                </div>

                <div className="flow-phone-header-actions">
                  <button
                    type="button"
                    className="flow-phone-header-btn"
                    onClick={restartPreview}
                    title="Restart conversation"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    className="flow-phone-header-btn"
                    onClick={onClose}
                    title="Close device preview"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

          {/* ── Chat Messages Body ─────────────────────────────── */}
          <div className="flow-phone-chat-body">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div key={m.id} className={`flow-phone-msg-row ${isUser ? 'user-row' : 'bot-row'}`}>
                  {!isUser && (
                    <div className="flow-phone-chat-avatar">
                      <PlatformIcon platform={platform} size={18} />
                    </div>
                  )}

                  <div className={`flow-phone-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
                    {/* Text content */}
                    {m.text && <div className="flow-phone-text">{m.text}</div>}

                    {/* Image content */}
                    {m.type === 'image' && (
                      <div className="flow-phone-image-box">
                        {m.imageUrl ? (
                          <img draggable={false} onContextMenu={(e) => e.preventDefault()} src={resolveMediaUrl(m.imageUrl)} alt="Attached" className="flow-phone-img" />
                        ) : (
                          <div className="flow-phone-img-placeholder">
                            <ImageIcon size={32} />
                            <span>Image Attachment</span>
                          </div>
                        )}
                        {m.caption && <div className="flow-phone-caption">{m.caption}</div>}
                      </div>
                    )}

                    {/* Video content */}
                    {m.type === 'video' && (
                      <div className="flow-phone-image-box">
                        {m.videoUrl ? (
                          <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
                            src={resolveMediaUrl(m.videoUrl)}
                            controls
                            className="flow-phone-img"
                            style={{ maxHeight: 180, width: '100%', objectFit: 'contain', background: '#000000' }}
                          />
                        ) : (
                          <div className="flow-phone-img-placeholder">
                            <Video size={32} />
                            <span>Video Attachment</span>
                          </div>
                        )}
                        {m.caption && <div className="flow-phone-caption">{m.caption}</div>}
                      </div>
                    )}

                    {/* Audio */}
                    {m.type === 'audio' && (
                      <div className="flow-phone-image-box" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Music size={18} /><span>Audio clip</span></div>
                        {m.audioUrl && <audio controlsList="nodownload noremoteplayback" onContextMenu={(e) => e.preventDefault()} src={resolveMediaUrl(m.audioUrl)} controls style={{ width: '100%', height: 32 }} />}
                      </div>
                    )}

                    {/* File */}
                    {m.type === 'file' && (
                      <div className="flow-phone-image-box" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={20} /><span>{m.filename}</span>
                      </div>
                    )}

                    {/* Card / Carousel */}
                    {m.type === 'card' && (
                      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                        {(m.cards || []).map((c, cIdx) => (
                          <div key={cIdx} className="flow-phone-image-box" style={{ flex: '0 0 180px', padding: 8 }}>
                            {c.imageUrl && <img draggable={false} onContextMenu={(e) => e.preventDefault()} src={resolveMediaUrl(c.imageUrl)} alt="" className="flow-phone-img" style={{ maxHeight: 100, width: '100%', objectFit: 'cover' }} />}
                            <div style={{ fontWeight: 700, marginTop: 4 }}>{c.title || 'Card'}</div>
                            {c.subtitle && <div style={{ opacity: 0.75, fontSize: 12 }}>{c.subtitle}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Interactive Buttons (identical sleek design for text, image, and video) */}
                    {m.type !== 'interactive' && m.buttons && m.buttons.length > 0 && (
                      <div className="flow-phone-btn-list">
                        {m.buttons.map((b, bIdx) => {
                          const title = typeof b === 'string' ? b : b.title || `Button ${bIdx + 1}`;
                          return (
                            <button
                              key={bIdx}
                              type="button"
                              className="flow-phone-choice-btn"
                              onClick={() => handleButtonClick(b, bIdx, m.nodeId)}
                            >
                              {title}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* WhatsApp Interactive Message (Header + Body + Footer + Buttons) */}
                    {m.type === 'interactive' && (
                      <div className="flex flex-col gap-2">
                        {/* Header preview */}
                        {m.headerType && m.headerType !== 'none' && (
                          <div className="pb-1.5 border-b border-slate-700/50">
                            {m.headerType === 'text' ? (
                              <div className="text-xs font-bold text-slate-100">{m.headerText}</div>
                            ) : m.headerMediaUrl ? (
                              m.headerType === 'video' ? (
                                <video controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
                                  src={resolveMediaUrl(m.headerMediaUrl)}
                                  controls
                                  className="flow-phone-img"
                                  style={{ maxHeight: 140, width: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <img draggable={false} onContextMenu={(e) => e.preventDefault()}
                                  src={resolveMediaUrl(m.headerMediaUrl)}
                                  alt="Header Media"
                                  className="flow-phone-img"
                                  style={{ maxHeight: 140, width: '100%', objectFit: 'cover' }}
                                />
                              )
                            ) : (
                              <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                                <span>[{m.headerType.toUpperCase()} HEADER]</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Body Text */}
                        <div className="flow-phone-text font-normal">{m.text}</div>

                        {/* Footer Text */}
                        {m.footerText && (
                          <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-700/30">
                            {m.footerText}
                          </div>
                        )}

                        {/* Reply Buttons */}
                        {m.buttons && m.buttons.length > 0 && (
                          <div className="flow-phone-btn-list mt-1">
                            {m.buttons.map((b, bIdx) => {
                              const title = typeof b === 'string' ? b : b.title || `Reply ${bIdx + 1}`;
                              return (
                                <button
                                  key={bIdx}
                                  type="button"
                                  className="flow-phone-choice-btn text-emerald-400 font-semibold"
                                  onClick={() => handleButtonClick(b, bIdx, m.nodeId)}
                                >
                                  {title}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick Replies */}
                    {m.type === 'quickReplies' && m.replies && m.replies.length > 0 && (
                      <div className="flow-phone-qr-list">
                        {m.replies.map((r, rIdx) => {
                          const title = typeof r === 'string' ? r : r.title || `Reply ${rIdx + 1}`;
                          return (
                            <button
                              key={rIdx}
                              type="button"
                              className="flow-phone-qr-btn"
                              onClick={() => handleButtonClick(r, rIdx, m.nodeId)}
                            >
                              {title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Animated Typing Indicator */}
            {isTyping && (
              <div className="flow-phone-msg-row bot-row">
                <div className="flow-phone-chat-avatar">
                  <PlatformIcon platform={platform} size={18} />
                </div>
                <div className="flow-phone-bubble bot-bubble flow-phone-typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* ── Message Input Bar ──────────────────────────────── */}
          <form className="flow-phone-input-bar" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="flow-phone-input-field"
              placeholder={waitingForInput ? 'Reply to question...' : 'Message...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button
              type="submit"
              className="flow-phone-send-btn"
              disabled={!inputText.trim()}
              title="Send message"
            >
              <Send size={14} />
            </button>
          </form>
        </>
      )}
    </div>
      </div>
    </div>
  );
}
