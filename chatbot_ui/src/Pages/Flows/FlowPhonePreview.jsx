import React, { useState, useEffect, useRef } from 'react';
import {
  X, RotateCcw, Send, MessageSquare, Image as ImageIcon,
  Clock, Sparkles, User, ExternalLink
} from 'lucide-react';

export default function FlowPhonePreview({
  open = true,
  onClose,
  nodes = [],
  edges = [],
  platform = 'FACEBOOK',
  businessName = 'CareSphere',
}) {
  if (!open) return null;

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

  // Find start node
  const startNode = nodes.find((n) => n.type === 'start');

  // Initialize or restart conversation
  const restartPreview = () => {
    setMessages([]);
    setWaitingForInput(null);
    setIsTyping(false);

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

  useEffect(() => {
    restartPreview();
  }, [open, startNode?.id]);

  // Execute and append a node's content to the chat messages
  const renderNodeMessages = (node, existingMessages = messages) => {
    if (!node) return;

    const data = node.data || {};
    const newItems = [];

    // 1. Text Message
    if (node.type === 'text') {
      newItems.push({
        id: `msg-${Date.now()}-text`,
        sender: 'bot',
        type: 'text',
        text: data.message || 'Hello! (Empty message)',
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

    // 3. Image (with optional Facebook interactive buttons)
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

    // If this node has a direct single outgoing edge and is not waiting for input/button click:
    const hasButtons = (node.type === 'buttons' || node.type === 'interactive' || (node.type === 'image' && (node.data?.buttons || []).length > 0));
    if (node.type !== 'collectInput' && !hasButtons && node.type !== 'quickReplies') {
      const nextEdge = edges.find((e) => e.source === node.id && !e.sourceHandle);
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
  const handleButtonClick = (buttonTitle, index, sourceNodeId) => {
    // Append user response
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      type: 'text',
      text: buttonTitle,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    scrollToBottom();

    // Find matching edge for this button handle
    const matchedEdge =
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `btn-${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `btn_${index}`) ||
      edges.find((e) => e.source === sourceNodeId && e.sourceHandle === `qr-${index}`) ||
      edges.find((e) => e.source === sourceNodeId && !e.sourceHandle);

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
        // Unmatched response
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `fallback-${Date.now()}`,
              sender: 'bot',
              type: 'text',
              text: "I didn't quite catch that. Type one of your trigger keywords (e.g. 'hi' or 'hello') to start the flow!",
            },
          ]);
          scrollToBottom();
        }, 600);
      }
    }
  };

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
          {/* Top App Header */}
          <div className="flow-phone-header">
            <div className="flow-phone-header-left">
              <div className="flow-phone-avatar">
                {platform === 'WHATSAPP' ? '💬' : platform === 'INSTAGRAM' ? '📸' : '⚡'}
              </div>
              <div className="flow-phone-header-info">
                <div className="flow-phone-header-name">{businessName || 'CareSphere'}</div>
                <div className="flow-phone-header-status">Business chat</div>
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
                      {platform === 'WHATSAPP' ? '💬' : platform === 'INSTAGRAM' ? '📸' : '⚡'}
                    </div>
                  )}

                  {/* Image with Buttons (Messenger Card: Zero space between image & buttons) */}
                  {m.type === 'image' && m.buttons && m.buttons.length > 0 ? (
                    <div className="max-w-[85%] w-full rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/80 shadow-md text-slate-100 flex flex-col my-1">
                      {m.imageUrl ? (
                        <img
                          src={m.imageUrl}
                          alt="Attached"
                          className="w-full max-h-[160px] object-cover block m-0 p-0"
                        />
                      ) : (
                        <div className="h-28 bg-slate-800 flex flex-col items-center justify-center gap-1.5 text-slate-400 text-xs">
                          <ImageIcon size={28} />
                          <span>Image Attachment</span>
                        </div>
                      )}

                      {m.caption && (
                        <div className="px-3.5 py-2 text-xs text-slate-200 bg-slate-800/90 border-t border-slate-700/50 leading-relaxed font-medium">
                          {m.caption}
                        </div>
                      )}

                      {/* Attached Buttons for Messenger Card (Flush directly against image/caption with ZERO space) */}
                      <div className="flex flex-col m-0 p-0 border-t border-slate-700/80 divide-y divide-slate-700/60 bg-slate-800">
                        {m.buttons.map((b, bIdx) => {
                          const title = typeof b === 'string' ? b : b.title || `Button ${bIdx + 1}`;
                          return (
                            <button
                              key={bIdx}
                              type="button"
                              className="w-full py-2.5 px-3 text-xs font-semibold text-sky-400 hover:text-sky-300 hover:bg-slate-700/60 active:bg-slate-700/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-slate-800"
                              onClick={() => handleButtonClick(title, bIdx, m.nodeId)}
                            >
                              <span>{title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={`flow-phone-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
                      {/* Text content */}
                      {m.text && <div className="flow-phone-text">{m.text}</div>}

                      {/* Image content (No buttons) */}
                      {m.type === 'image' && (
                        <div className="flow-phone-image-box">
                          {m.imageUrl ? (
                            <img src={m.imageUrl} alt="Attached" className="flow-phone-img" />
                          ) : (
                            <div className="flow-phone-img-placeholder">
                              <ImageIcon size={32} />
                              <span>Image Attachment</span>
                            </div>
                          )}
                          {m.caption && <div className="flow-phone-caption">{m.caption}</div>}
                        </div>
                      )}

                    {/* Interactive Buttons */}
                    {m.type === 'buttons' && m.buttons && m.buttons.length > 0 && (
                      <div className="flow-phone-btn-list">
                        {m.buttons.map((b, bIdx) => {
                          const title = typeof b === 'string' ? b : b.title || `Button ${bIdx + 1}`;
                          return (
                            <button
                              key={bIdx}
                              type="button"
                              className="flow-phone-choice-btn"
                              onClick={() => handleButtonClick(title, bIdx, m.nodeId)}
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
                                  onClick={() => handleButtonClick(title, bIdx, m.nodeId)}
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
                              onClick={() => handleButtonClick(title, rIdx, m.nodeId)}
                            >
                              {title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}

            {/* Animated Typing Indicator */}
            {isTyping && (
              <div className="flow-phone-msg-row bot-row">
                <div className="flow-phone-chat-avatar">
                  {platform === 'WHATSAPP' ? '💬' : platform === 'INSTAGRAM' ? '📸' : '⚡'}
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
        </div>
      </div>
    </div>
  );
}
