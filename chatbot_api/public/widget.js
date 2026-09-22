(function () {
  const BUTTON_SIZES = {
    MEDIUM: { padding: "12px 20px", fontSize: "14px", iconBox: "22px" },
    LARGE: { padding: "14px 24px", fontSize: "15px", iconBox: "24px" },
    XLARGE: { padding: "16px 28px", fontSize: "16px", iconBox: "26px" },
  };

  function computeGradientEnd(hex) {
    if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#8b5cf6";
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    if (c.length !== 6) return "#8b5cf6";
    let r = parseInt(c.substring(0, 2), 16);
    let g = parseInt(c.substring(2, 4), 16);
    let b = parseInt(c.substring(4, 6), 16);
    r = Math.min(255, Math.round(r * 0.95 + 40));
    g = Math.max(0, Math.round(g * 0.72));
    b = Math.min(255, Math.round(b * 1.05 + 25));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  // Shared Socket.io and CSS injection
  function ensureSharedResources() {
    if (!window.io && !document.getElementById("chatsaas-socketio-script")) {
      const socketScript = document.createElement("script");
      socketScript.id = "chatsaas-socketio-script";
      socketScript.src = "https://cdn.socket.io/4.7.5/socket.io.min.js";
      document.head.appendChild(socketScript);
    }

    if (!document.getElementById("chatsaas-widget-styles")) {
      const style = document.createElement("style");
      style.id = "chatsaas-widget-styles";
      style.textContent = `
        .chatsaas-widget-container {
          position: fixed;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .chatsaas-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 20px;
          height: 20px;
          padding: 0 5px;
          box-sizing: border-box;
          border-radius: 999px;
          background: #ef4444;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          line-height: 20px;
          text-align: center;
          box-shadow: 0 0 0 2px #fff;
          z-index: 10;
        }
        .chatsaas-bubble {
          position: relative;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #3b82f6;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          border: none;
          padding: 0;
          outline: none;
          transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease;
          user-select: none;
        }
        .chatsaas-bubble:hover {
          transform: scale(1.07);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.24);
        }
        .chatsaas-bubble:active {
          transform: scale(0.95);
        }
        .chatsaas-bubble-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, opacity 0.15s ease;
        }
        .chatsaas-bubble img.chatsaas-bubble-logo {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }
        .chatsaas-online-dot {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 13px;
          height: 13px;
          background: #22c55e;
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          box-sizing: border-box;
          pointer-events: none;
        }
        .chatsaas-window {
          position: fixed;
          width: 380px;
          height: 540px;
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 100px);
          border-radius: 20px;
          background: #ffffff;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 2px 10px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transform: translateY(20px) scale(0.96);
          opacity: 0;
          pointer-events: none;
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
        }
        .chatsaas-window.open {
          transform: translateY(0) scale(1);
          opacity: 1;
          pointer-events: auto;
        }
        .chatsaas-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }
        /* Home Screen Styles */
        .chatsaas-home-header {
          padding: 22px 24px 20px 24px;
          color: #ffffff;
          position: relative;
          flex-shrink: 0;
        }
        .chatsaas-home-header-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .chatsaas-home-title {
          margin: 0;
          font-size: 21px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.3px;
          line-height: 1.2;
        }
        .chatsaas-home-sub {
          margin: 4px 0 0 0;
          font-size: 13.5px;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 400;
        }
        .chatsaas-close-btn {
          background: transparent;
          border: none;
          color: #ffffff;
          cursor: pointer;
          padding: 2px;
          opacity: 0.85;
          transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
        }
        .chatsaas-close-btn:hover {
          opacity: 1;
          transform: scale(1.08);
          background: rgba(255, 255, 255, 0.16);
        }
        .chatsaas-home-body {
          padding: 20px 22px 16px 22px;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }
        .chatsaas-home-question {
          font-size: 15px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 4px;
        }
        .chatsaas-reply-time {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          color: #64748b;
          margin-bottom: 18px;
        }
        .chatsaas-cards-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .chatsaas-bot-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: #ffffff;
          border: 1px solid #f1f5f9;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
          user-select: none;
        }
        .chatsaas-bot-card:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        .chatsaas-bot-card:active {
          transform: translateY(0);
        }
        .chatsaas-card-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .chatsaas-card-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s;
        }
        .chatsaas-bot-card:hover .chatsaas-card-icon {
          background: #e2e8f0;
        }
        .chatsaas-card-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #1e293b;
          line-height: 1.25;
        }
        .chatsaas-card-sub {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
          line-height: 1.2;
        }
        .chatsaas-card-arrow {
          color: #94a3b8;
          font-size: 18px;
          font-weight: 300;
          transition: transform 0.2s;
        }
        .chatsaas-bot-card:hover .chatsaas-card-arrow {
          transform: translateX(2px);
          color: #64748b;
        }
        .chatsaas-start-btn {
          width: 100%;
          padding: 13px 18px;
          border-radius: 10px;
          color: #ffffff;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: opacity 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
          user-select: none;
        }
        .chatsaas-start-btn:hover {
          opacity: 0.94;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
          transform: translateY(-1px);
        }
        .chatsaas-start-btn:active {
          transform: translateY(0);
        }
        .chatsaas-footer {
          padding: 11px 20px;
          text-align: center;
          font-size: 11.5px;
          color: #94a3b8;
          border-top: 1px solid #f1f5f9;
          background: #ffffff;
          flex-shrink: 0;
        }
        .chatsaas-footer strong {
          font-weight: 600;
          color: #64748b;
        }
        /* Chat View Styles */
        .chatsaas-chat-header {
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
          flex-shrink: 0;
        }
        .chatsaas-back-btn {
          background: none;
          border: none;
          color: #ffffff;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          opacity: 0.9;
          transition: opacity 0.2s, background 0.2s;
        }
        .chatsaas-back-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.16);
        }
        .chatsaas-chat-header-info {
          flex: 1;
          min-width: 0;
        }
        .chatsaas-chat-header-title {
          font-weight: 600;
          font-size: 15px;
          color: #ffffff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chatsaas-chat-header-status {
          font-size: 11.5px;
          color: rgba(255, 255, 255, 0.85);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .chatsaas-header-online-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          display: inline-block;
        }
        .chatsaas-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .chatsaas-message {
          max-width: 82%;
          padding: 10px 14px;
          font-size: 13.5px;
          line-height: 1.45;
          word-break: break-word;
        }
        .chatsaas-message.inbound {
          align-self: flex-end;
          color: #ffffff;
          border-radius: 16px 16px 4px 16px;
        }
        .chatsaas-message.outbound {
          align-self: flex-start;
          background: #ffffff;
          color: #1e293b;
          border: 1px solid #e2e8f0;
          border-radius: 16px 16px 16px 4px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        }
        .chatsaas-input-area {
          padding: 12px 14px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 8px;
          background: #ffffff;
          align-items: center;
          flex-shrink: 0;
        }
        .chatsaas-input {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          padding: 9px 16px;
          font-size: 13.5px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .chatsaas-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .chatsaas-send {
          border: none;
          color: #fff;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          transition: opacity 0.2s, transform 0.15s;
          flex-shrink: 0;
        }
        .chatsaas-send:hover {
          opacity: 0.9;
          transform: scale(1.05);
        }
      `;
      document.head.appendChild(style);
    }
  }

  function initWidget(targetScript, explicitKey) {
    const scriptTag =
      targetScript ||
      (explicitKey ? document.querySelector(`script[data-key="${explicitKey}"]`) : null) ||
      document.currentScript;
    const widgetKey =
      explicitKey ||
      (scriptTag ? scriptTag.getAttribute("data-key") || scriptTag.getAttribute("data-widget-id") : null);
    if (!widgetKey) return;

    const containerId = `chatsaas-widget-container-${widgetKey}`;
    if (document.getElementById(containerId)) {
      return; // Already initialized for this key
    }

    ensureSharedResources();

    // Get backend URL from script source
    const scriptSrc = scriptTag && scriptTag.src ? scriptTag.src : "";
    let backendUrl = "";
    try {
      const urlObj = scriptSrc ? new URL(scriptSrc, window.location.origin) : window.location;
      backendUrl = `${urlObj.protocol}//${urlObj.host}`;
    } catch {
      backendUrl = window.location.origin;
    }

    // Create DOM elements
    const container = document.createElement("div");
    container.id = containerId;
    container.className = "chatsaas-widget-container";
    container.setAttribute("data-widget-key", widgetKey);
    container.style.bottom = "20px";
    container.style.right = "20px";
    container.style.display = "flex";
    container.style.flexDirection = "column-reverse";
    container.style.alignItems = "flex-end";
    container.style.gap = "10px";

    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = "chatsaas-bubble";

    const windowEl = document.createElement("div");
    windowEl.id = `chatsaas-window-${widgetKey}`;
    windowEl.className = "chatsaas-window";
    windowEl.setAttribute("data-widget-key", widgetKey);

    container.appendChild(bubble);
    container.appendChild(windowEl);
    document.body.appendChild(container);

    let visitorId = localStorage.getItem(`chatsaas_visitor_${widgetKey}`);
    let conversationId = null;
    let socket = null;
    let config = null;
    const seenOutbound = new Set();
    let unread = 0;
    let firstConnect = true;
    let syncing = false;
    let currentView = "home"; // 'home' | 'chat'
    let chatInitialized = false;
    const originalTitle = document.title;

    // Toggle chat window
    bubble.addEventListener("click", () => {
      requestNotificationPermission();
      if (windowEl.classList.contains("open")) {
        closeWindow();
      } else {
        openWindow();
      }
    });

    function openWindow() {
      windowEl.classList.add("open");
      unread = 0;
      updateBadge();
      updateBubbleIcon();

      if (config && config.widgetType === "DEEPLINK") {
        renderDeepLinkWindow(config);
      } else {
        if (currentView === "chat") {
          renderChatView(config || {});
          if (conversationId) syncMessages();
          else initChat();
        } else {
          renderHomeView(config || {});
        }
      }
    }

    function closeWindow() {
      windowEl.classList.remove("open");
      updateBubbleIcon();
    }

    function updateBubbleIcon() {
      const isOpen = windowEl.classList.contains("open");
      const iconContainer = bubble.querySelector(".chatsaas-bubble-icon");
      if (!iconContainer) return;

      if (isOpen) {
        // Show Close 'X' icon
        iconContainer.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
      } else {
        // Show Chat Bubble icon or logo
        if (config && config.logoUrl) {
          iconContainer.innerHTML = `<img class="chatsaas-bubble-logo" src="${resolveAssetUrl(config.logoUrl)}" alt="" />`;
        } else {
          iconContainer.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          `;
        }
      }
    }

    function updateBadge() {
      let badge = bubble.querySelector(".chatsaas-badge");
      if (!unread) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "chatsaas-badge";
        bubble.appendChild(badge);
      }
      badge.textContent = unread > 9 ? "9+" : String(unread);
    }

    function requestNotificationPermission() {
      try {
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
      } catch (e) {}
    }

    function notifyIncoming(msg) {
      const windowOpen = windowEl.classList.contains("open");
      const pageHidden = document.hidden;
      if (windowOpen && !pageHidden && currentView === "chat") return;

      unread += 1;
      updateBadge();

      if (pageHidden) {
        document.title = `(${unread || 1}) New message`;
      }

      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const body =
            (msg && msg.body) ||
            (msg && (msg.media_url || msg.mediaUrl) ? "Sent you an image" : "New message");
          const n = new Notification((config && (config.displayName || config.name)) || "New message", {
            body,
            tag: `chatsaas-${widgetKey}`,
            icon: config && config.logoUrl ? resolveAssetUrl(config.logoUrl) : undefined,
          });
          n.onclick = () => {
            window.focus();
            openWindow();
            n.close();
          };
        }
      } catch (e) {}
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      document.title = originalTitle;
      if (conversationId) {
        if (socket && !socket.connected) socket.connect();
        syncMessages();
      }
    });

    async function syncMessages() {
      if (syncing || !visitorId) return;
      syncing = true;
      try {
        const response = await fetch(`${backendUrl}/api/v1/webchat/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgetKey, visitorId }),
        });
        const data = await response.json();
        if (!data.success) return;

        if (data.conversationId !== conversationId) {
          conversationId = data.conversationId;
          if (socket && socket.connected) {
            socket.emit("webchat_join", { widgetId: widgetKey, sessionId: visitorId, conversationId });
          }
        }

        (data.messages || []).forEach((m) => {
          if (m.direction !== "OUTBOUND") return;
          if (appendMessage(m, "outbound")) notifyIncoming(m);
        });
      } catch (err) {
        console.error("ChatSaaS Widget sync failed:", err);
      } finally {
        syncing = false;
      }
    }

    setInterval(() => {
      if (conversationId && (!socket || !socket.connected)) syncMessages();
    }, 30000);

    function applyPlacement(cfg) {
      const offsetX = Number(cfg.offsetX ?? 20);
      const offsetY = Number(cfg.offsetY ?? 20);
      const pos = cfg.position || "BOTTOM_RIGHT";
      const isTop = pos.startsWith("TOP");
      const isLeft = pos.endsWith("LEFT");

      container.style.top = isTop ? `${offsetY}px` : "";
      container.style.bottom = isTop ? "" : `${offsetY}px`;
      container.style.left = isLeft ? `${offsetX}px` : "";
      container.style.right = isLeft ? "" : `${offsetX}px`;
      container.style.display = "flex";
      container.style.flexDirection = isTop ? "column" : "column-reverse";
      container.style.alignItems = isLeft ? "flex-start" : "flex-end";
      container.style.gap = "10px";

      windowEl.style.top = isTop ? `${offsetY + 70}px` : "";
      windowEl.style.bottom = isTop ? "" : `${offsetY + 70}px`;
      windowEl.style.left = isLeft ? `${offsetX}px` : "";
      windowEl.style.right = isLeft ? "" : `${offsetX}px`;
    }

    function applyButtonStyle(cfg) {
      const primary = cfg.primaryColor || "#3b82f6";
      const buttonBg = cfg.buttonBgColor || primary;
      bubble.style.background = buttonBg;

      bubble.innerHTML = `
        <div class="chatsaas-bubble-icon"></div>
        <span class="chatsaas-online-dot"></span>
      `;
      updateBubbleIcon();
      updateBadge();
    }

    function resolveAssetUrl(url) {
      if (!url) return "";
      return url.startsWith("http") || url.startsWith("data:")
        ? url
        : `${backendUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str == null ? "" : String(str);
      return div.innerHTML;
    }

    async function loadConfig() {
      try {
        const response = await fetch(`${backendUrl}/api/v1/webchat/config?widgetKey=${encodeURIComponent(widgetKey)}`);
        const data = await response.json();
        if (!data.success) return;

        config = data.widget;
        applyPlacement(config);
        applyButtonStyle(config);

        if (config.openOnStartup) {
          openWindow();
        } else if (visitorId && config.widgetType !== "DEEPLINK") {
          initChat();
        }
      } catch (err) {
        console.error("ChatSaaS Widget config load failed:", err);
      }
    }

    async function initChat() {
      if (chatInitialized && conversationId) return;

      try {
        const response = await fetch(`${backendUrl}/api/v1/webchat/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgetKey, visitorId }),
        });
        const data = await response.json();

        if (data.success) {
          chatInitialized = true;
          visitorId = data.visitorId;
          conversationId = data.conversationId;
          localStorage.setItem(`chatsaas_visitor_${widgetKey}`, visitorId);

          config = data.widget || config || {};
          applyPlacement(config);
          applyButtonStyle(config);

          initSocketConnection();

          // If chat view is open, append messages
          if (currentView === "chat") {
            const messagesContainer = windowEl.querySelector(".chatsaas-messages");
            if (messagesContainer) {
              messagesContainer.innerHTML = "";
              (data.messages || []).forEach((msg) => {
                appendMessage(msg, msg.direction === "INBOUND" ? "inbound" : "outbound");
              });
            }
          }
        }
      } catch (err) {
        console.error("ChatSaaS Widget initialization failed:", err);
      }
    }

    // ─── RENDER HOME VIEW (Matches Screenshot with 3 Pre-built Bot Cards) ──────
    function renderHomeView(widget) {
      currentView = "home";
      const primary = widget.primaryColor || "#3b82f6";
      const gradientEnd = widget.headerBgColor && widget.headerBgColor !== primary
        ? widget.headerBgColor
        : computeGradientEnd(primary);
      const buttonBg = widget.buttonBgColor || primary;
      const brandName = widget.brandName || "Sky Free";

      windowEl.innerHTML = `
        <div class="chatsaas-view chatsaas-home-view">
          <div class="chatsaas-home-header" style="background: linear-gradient(135deg, ${primary} 0%, ${gradientEnd} 100%);">
            <div class="chatsaas-home-header-top">
              <h2 class="chatsaas-home-title">Welcome!</h2>
              <button type="button" class="chatsaas-close-btn" title="Close chat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <p class="chatsaas-home-sub">How can we help?</p>
          </div>

          <div class="chatsaas-home-body">
            <div class="chatsaas-home-question">How can we help?</div>
            <div class="chatsaas-reply-time">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>We typically reply within a few minutes</span>
            </div>

            <div class="chatsaas-cards-list">
              <!-- Option 1: Book a demo -->
              <div class="chatsaas-bot-card" data-trigger="Book a demo">
                <div class="chatsaas-card-left">
                  <div class="chatsaas-card-icon" style="color: ${primary};">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>
                  <div>
                    <div class="chatsaas-card-title">Book a demo</div>
                    <div class="chatsaas-card-sub">Schedule a personalized demo</div>
                  </div>
                </div>
                <div class="chatsaas-card-arrow">&rsaquo;</div>
              </div>

              <!-- Option 2: Product tour -->
              <div class="chatsaas-bot-card" data-trigger="Product tour">
                <div class="chatsaas-card-left">
                  <div class="chatsaas-card-icon" style="color: ${primary};">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <polygon points="6 4 19 12 6 20 6 4"></polygon>
                    </svg>
                  </div>
                  <div>
                    <div class="chatsaas-card-title">Product tour</div>
                    <div class="chatsaas-card-sub">See how it works</div>
                  </div>
                </div>
                <div class="chatsaas-card-arrow">&rsaquo;</div>
              </div>

              <!-- Option 3: Documentation -->
              <div class="chatsaas-bot-card" data-trigger="Documentation">
                <div class="chatsaas-card-left">
                  <div class="chatsaas-card-icon" style="color: ${primary};">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                  </div>
                  <div>
                    <div class="chatsaas-card-title">Documentation</div>
                    <div class="chatsaas-card-sub">Browse our guides</div>
                  </div>
                </div>
                <div class="chatsaas-card-arrow">&rsaquo;</div>
              </div>
            </div>

            <!-- Start a conversation button -->
            <button type="button" class="chatsaas-start-btn" style="background: ${buttonBg};">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Start a conversation</span>
            </button>
          </div>

          <div class="chatsaas-footer">
            Powered by <strong>${escapeHtml(brandName)}</strong>
          </div>
        </div>
      `;

      // Event listener: Close window
      const closeBtn = windowEl.querySelector(".chatsaas-close-btn");
      if (closeBtn) closeBtn.addEventListener("click", closeWindow);

      // Event listeners: 3 Pre-built Bot Cards
      const cards = windowEl.querySelectorAll(".chatsaas-bot-card");
      cards.forEach((card) => {
        card.addEventListener("click", async () => {
          const trigger = card.getAttribute("data-trigger");
          transitionToChat();
          await ensureChatReady();
          if (trigger) {
            sendMessage(trigger);
          }
        });
      });

      // Event listener: Start a conversation button
      const startBtn = windowEl.querySelector(".chatsaas-start-btn");
      if (startBtn) {
        startBtn.addEventListener("click", async () => {
          transitionToChat();
          await ensureChatReady();
          // If conversation has a default flow or prefill, trigger it
          if (widget.flow_id || widget.prefillMessage) {
            const startText = widget.prefillMessage || "Start a conversation";
            sendMessage(startText);
          }
        });
      }
    }

    function transitionToChat() {
      currentView = "chat";
      renderChatView(config || {});
    }

    async function ensureChatReady() {
      if (!conversationId) {
        await initChat();
      }
    }

    // ─── RENDER CHAT VIEW (Live Conversation Screen) ───────────────────────────
    function renderChatView(widget) {
      currentView = "chat";
      const primary = widget.primaryColor || "#3b82f6";
      const gradientEnd = widget.headerBgColor && widget.headerBgColor !== primary
        ? widget.headerBgColor
        : computeGradientEnd(primary);
      const headerText = widget.headerTextColor || "#ffffff";
      const logo = widget.logoUrl
        ? `<img class="chatsaas-header-logo" src="${resolveAssetUrl(widget.logoUrl)}" alt="" style="width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0;" />`
        : "";

      windowEl.innerHTML = `
        <div class="chatsaas-view chatsaas-chat-view">
          <div class="chatsaas-chat-header" style="background: linear-gradient(135deg, ${primary} 0%, ${gradientEnd} 100%); color: ${headerText};">
            <button type="button" class="chatsaas-back-btn" title="Back to home">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
            ${logo}
            <div class="chatsaas-chat-header-info">
              <div class="chatsaas-chat-header-title">${escapeHtml(widget.displayName || widget.name || "Live Chat")}</div>
              <div class="chatsaas-chat-header-status">
                <span class="chatsaas-header-online-dot"></span>
                <span>We typically reply in minutes</span>
              </div>
            </div>
            <button type="button" class="chatsaas-close-btn" title="Close chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="chatsaas-messages"></div>
          <div class="chatsaas-input-area">
            <input class="chatsaas-input" placeholder="${escapeHtml(widget.placeholderText || "Type a message...")}" value="" />
            <button class="chatsaas-send" style="background: ${widget.buttonBgColor || primary};">➤</button>
          </div>
        </div>
      `;

      // Back button: return to home view
      const backBtn = windowEl.querySelector(".chatsaas-back-btn");
      if (backBtn) {
        backBtn.addEventListener("click", () => {
          renderHomeView(config || {});
        });
      }

      // Close button
      const closeBtn = windowEl.querySelector(".chatsaas-close-btn");
      if (closeBtn) closeBtn.addEventListener("click", closeWindow);

      const sendBtn = windowEl.querySelector(".chatsaas-send");
      const inputEl = windowEl.querySelector(".chatsaas-input");

      const handleSend = () => {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = "";
        sendMessage(text);
      };

      if (sendBtn) sendBtn.addEventListener("click", handleSend);
      if (inputEl) {
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") handleSend();
        });
        setTimeout(() => inputEl.focus(), 100);
      }
    }

    async function sendMessage(text) {
      if (!text) return;
      requestNotificationPermission();

      // Ensure chat is ready
      await ensureChatReady();

      // Append instantly to UI
      appendMessage(text, "inbound");

      // Send to server
      try {
        await fetch(`${backendUrl}/api/v1/webchat/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgetKey, visitorId, conversationId, body: text }),
        });
      } catch (err) {
        console.error("Error sending webchat message:", err);
      }
    }

    function renderDeepLinkWindow(widget) {
      const headerBg = widget.headerBgColor || widget.primaryColor || "#3b82f6";
      const headerText = widget.headerTextColor || "#ffffff";
      const logo = widget.logoUrl
        ? `<img class="chatsaas-header-logo" src="${resolveAssetUrl(widget.logoUrl)}" alt="" style="width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0;" />`
        : "";
      const canEditText = widget.targetPlatform === "WHATSAPP" || widget.targetPlatform === "FACEBOOK";

      windowEl.innerHTML = `
        <div class="chatsaas-view">
          <div class="chatsaas-chat-header" style="background: ${headerBg}; color: ${headerText}">
            ${logo}
            <div class="chatsaas-chat-header-info">
              <div class="chatsaas-chat-header-title">${escapeHtml(widget.displayName || widget.name || "Chat")}</div>
            </div>
            <button type="button" class="chatsaas-close-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="chatsaas-messages">
            <div class="chatsaas-message outbound">${escapeHtml(widget.greetingMessage || "Hi there! How can we help?")}</div>
          </div>
          ${
            canEditText
              ? `<div class="chatsaas-input-area">
                   <input class="chatsaas-input" placeholder="${escapeHtml(widget.placeholderText || "Type a message...")}" value="${escapeHtml(widget.prefillMessage || "")}" />
                   <button class="chatsaas-send" style="background: ${widget.buttonBgColor || headerBg}">➤</button>
                 </div>`
              : `<div class="chatsaas-input-area">
                   <button class="chatsaas-deeplink-go" style="flex:1; background: ${widget.buttonBgColor || headerBg}; color: ${widget.buttonTextColor || "#fff"}; border:none; border-radius:20px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer;">${escapeHtml(widget.buttonText || "Continue")}</button>
                 </div>`
          }
        </div>
      `;

      const closeBtn = windowEl.querySelector(".chatsaas-close-btn");
      if (closeBtn) closeBtn.addEventListener("click", closeWindow);

      if (canEditText) {
        const sendBtn = windowEl.querySelector(".chatsaas-send");
        const inputEl = windowEl.querySelector(".chatsaas-input");
        const go = () => {
          const text = inputEl.value.trim();
          const base = (widget.deepLink || "").split("?")[0];
          const url = text ? `${base}?text=${encodeURIComponent(text)}` : base;
          if (url) window.open(url, "_blank");
        };
        if (sendBtn) sendBtn.addEventListener("click", go);
        if (inputEl) {
          inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") go();
          });
        }
      } else {
        const goBtn = windowEl.querySelector(".chatsaas-deeplink-go");
        if (goBtn) {
          goBtn.addEventListener("click", () => {
            if (widget.deepLink) window.open(widget.deepLink, "_blank");
          });
        }
      }
    }

    function appendMessage(msgData, direction) {
      const messagesContainer = windowEl.querySelector(".chatsaas-messages");
      if (!messagesContainer) return false;

      if (direction === "outbound" && msgData && typeof msgData === "object" && msgData.id != null) {
        if (seenOutbound.has(msgData.id)) return false;
        seenOutbound.add(msgData.id);
      }

      const msgEl = document.createElement("div");
      msgEl.className = `chatsaas-message ${direction}`;
      if (direction === "inbound") {
        msgEl.style.background = (config && (config.buttonBgColor || config.primaryColor)) || "#3b82f6";
      }

      const text = typeof msgData === "string" ? msgData : msgData?.body || "";
      const rawMedia =
        typeof msgData === "object" ? msgData.media_url || msgData.mediaUrl || msgData.imageUrl : null;
      const normType = typeof msgData === "object" ? (msgData.type || "").toUpperCase() : "";

      let hasContent = false;

      if (rawMedia || normType === "IMAGE") {
        const fullImgUrl = rawMedia ? resolveAssetUrl(rawMedia) : null;
        if (fullImgUrl) {
          const imgEl = document.createElement("img");
          imgEl.src = fullImgUrl;
          imgEl.alt = "Image";
          imgEl.style.maxWidth = "100%";
          imgEl.style.maxHeight = "220px";
          imgEl.style.borderRadius = "8px";
          imgEl.style.display = "block";
          imgEl.style.cursor = "pointer";
          imgEl.onclick = () => window.open(fullImgUrl, "_blank");
          if (text) {
            imgEl.style.marginBottom = "6px";
          }
          msgEl.appendChild(imgEl);
          hasContent = true;
        }
      }

      if (text) {
        const textSpan = document.createElement("span");
        textSpan.textContent = text;
        msgEl.appendChild(textSpan);
        hasContent = true;
      }

      if (hasContent) {
        messagesContainer.appendChild(msgEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      return hasContent;
    }

    function initSocketConnection() {
      if (typeof io === "undefined") {
        setTimeout(initSocketConnection, 500);
        return;
      }

      if (socket) return;

      socket = io(backendUrl, {
        transports: ["websocket", "polling"],
      });

      const joinRoom = () => {
        socket.emit("webchat_join", {
          widgetId: widgetKey,
          sessionId: visitorId,
          conversationId: conversationId,
        });
      };

      const onConnect = () => {
        joinRoom();
        if (!firstConnect) syncMessages();
        firstConnect = false;
      };
      socket.on("connect", onConnect);
      if (socket.connected) {
        onConnect();
      }

      socket.on("new_message", (data) => {
        if (data.conversationId === conversationId && data.message.direction === "OUTBOUND") {
          if (appendMessage(data.message, "outbound")) notifyIncoming(data.message);
        }
      });
    }

    loadConfig();
  }

  // Auto-init for currentScript if executing directly via script tag
  if (document.currentScript) {
    initWidget(document.currentScript);
  }

  function scanAndInit() {
    const scripts = document.querySelectorAll("script[data-key], script[data-widget-id], #nexa-chat-widget");
    scripts.forEach((s) => initWidget(s));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndInit);
  } else {
    scanAndInit();
  }

  // Expose global helper
  window.initChatSaaSWidget = function (keyOrScript) {
    if (typeof keyOrScript === "string") {
      initWidget(null, keyOrScript);
    } else if (keyOrScript) {
      initWidget(keyOrScript);
    }
  };
})();
