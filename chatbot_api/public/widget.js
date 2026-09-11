(function () {
  // 1. Get widget key from script tag
  const scriptTag = document.currentScript;
  const widgetKey = scriptTag.getAttribute("data-key") || scriptTag.getAttribute("data-widget-id");
  if (!widgetKey) {
    console.error("ChatSaaS Widget: Missing data-key attribute on script tag.");
    return;
  }

  // Get backend URL from script source
  const scriptSrc = scriptTag.src;
  const urlObj = new URL(scriptSrc);
  const backendUrl = `${urlObj.protocol}//${urlObj.host}`;

  // 2. Load Socket.io Client library dynamically
  const socketScript = document.createElement("script");
  socketScript.src = "https://cdn.socket.io/4.7.5/socket.io.min.js";
  document.head.appendChild(socketScript);

  // 3. Inject CSS. Colors/position/sizing are re-applied per-widget via
  // inline styles once /webchat/config resolves (below) — these are just
  // structural/layout rules and sane pre-config defaults.
  const BUTTON_SIZES = {
    MEDIUM: { padding: "12px 20px", fontSize: "14px", iconBox: "22px" },
    LARGE: { padding: "14px 24px", fontSize: "15px", iconBox: "24px" },
    XLARGE: { padding: "16px 28px", fontSize: "16px", iconBox: "26px" },
  };

  const style = document.createElement("style");
  style.textContent = `
    .chatsaas-widget-container {
      position: fixed;
      z-index: 999999;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .chatsaas-bubble {
      border-radius: 999px;
      background: #6366f1;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fff;
      font-weight: 600;
      border: none;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .chatsaas-bubble:hover {
      transform: scale(1.04);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    }
    .chatsaas-bubble img.chatsaas-bubble-logo {
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .chatsaas-window {
      position: fixed;
      width: 380px;
      height: 520px;
      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(20px);
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .chatsaas-window.open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .chatsaas-header {
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .chatsaas-header img.chatsaas-header-logo {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .chatsaas-header-title {
      font-weight: 600;
      font-size: 16px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chatsaas-header-close {
      cursor: pointer;
      font-size: 20px;
      opacity: 0.8;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }
    .chatsaas-header-close:hover {
      opacity: 1;
    }
    .chatsaas-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      background: #f8f9fa;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .chatsaas-message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      word-break: break-word;
    }
    .chatsaas-message.inbound {
      background: #6366f1;
      color: #fff;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .chatsaas-message.outbound {
      background: #e9ecef;
      color: #212529;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .chatsaas-input-area {
      padding: 12px;
      border-top: 1px solid #e9ecef;
      display: flex;
      gap: 8px;
      background: #fff;
    }
    .chatsaas-input {
      flex: 1;
      border: 1px solid #ced4da;
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .chatsaas-input:focus {
      border-color: #6366f1;
    }
    .chatsaas-send {
      background: #6366f1;
      border: none;
      color: #fff;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: opacity 0.2s;
    }
    .chatsaas-send:hover {
      opacity: 0.9;
    }
  `;
  document.head.appendChild(style);

  // 4. Create DOM elements
  const container = document.createElement("div");
  container.className = "chatsaas-widget-container";

  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "chatsaas-bubble";
  bubble.innerHTML = "💬";

  const windowEl = document.createElement("div");
  windowEl.className = "chatsaas-window";

  container.appendChild(bubble);
  container.appendChild(windowEl);
  document.body.appendChild(container);

  let visitorId = localStorage.getItem(`chatsaas_visitor_${widgetKey}`);
  let conversationId = null;
  let socket = null;
  let config = null; // resolved from GET /webchat/config, see loadConfig()

  // Toggle chat window
  bubble.addEventListener("click", () => openWindow());

  function openWindow() {
    windowEl.classList.add("open");
    if (config && config.widgetType === "DEEPLINK") {
      renderDeepLinkWindow(config);
    } else {
      initChat();
    }
  }

  // Positions the fixed container in whichever corner the widget is
  // configured for, and places the button/window on the matching side.
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

    // The window itself is also fixed (so it isn't clipped by the
    // container's own flow sizing) — anchor it to the same corner.
    windowEl.style.top = isTop ? `${offsetY + 60}px` : "";
    windowEl.style.bottom = isTop ? "" : `${offsetY + 60}px`;
    windowEl.style.left = isLeft ? `${offsetX}px` : "";
    windowEl.style.right = isLeft ? "" : `${offsetX}px`;
  }

  function applyButtonStyle(cfg) {
    const size = BUTTON_SIZES[cfg.buttonSize] || BUTTON_SIZES.MEDIUM;
    bubble.style.background = cfg.buttonBgColor || "#6366f1";
    bubble.style.color = cfg.buttonTextColor || "#fff";
    bubble.style.padding = size.padding;
    bubble.style.fontSize = size.fontSize;

    const logo = cfg.logoUrl
      ? `<img class="chatsaas-bubble-logo" src="${resolveAssetUrl(cfg.logoUrl)}" alt="" style="width:${size.iconBox};height:${size.iconBox}" />`
      : `<span style="font-size:${size.iconBox}">💬</span>`;
    bubble.innerHTML = `${logo}<span>${escapeHtml(cfg.buttonText || "Chat with us")}</span>`;
  }

  function resolveAssetUrl(url) {
    if (!url) return "";
    return url.startsWith("http") || url.startsWith("data:") ? url : `${backendUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // Fired immediately on page load — styling only, no contact/conversation
  // is created by this call (see routes/webchat.js's GET /webchat/config).
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
      }
    } catch (err) {
      console.error("ChatSaaS Widget config load failed:", err);
    }
  }

  async function initChat() {
    if (conversationId) return; // Already initialized

    try {
      const response = await fetch(`${backendUrl}/api/v1/webchat/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetKey, visitorId }),
      });
      const data = await response.json();

      if (data.success) {
        visitorId = data.visitorId;
        conversationId = data.conversationId;
        localStorage.setItem(`chatsaas_visitor_${widgetKey}`, visitorId);

        config = data.widget || config || {};
        applyPlacement(config);
        applyButtonStyle(config);

        // Render header, messages, and input
        renderWindow(config);
        data.messages.forEach(msg => {
          appendMessage(msg, msg.direction === "INBOUND" ? "inbound" : "outbound");
        });

        // Initialize Sockets
        initSocketConnection();
      }
    } catch (err) {
      console.error("ChatSaaS Widget initialization failed:", err);
    }
  }

  function renderWindow(widget) {
    const headerBg = widget.headerBgColor || widget.primaryColor || "#6366f1";
    const headerText = widget.headerTextColor || "#ffffff";
    const logo = widget.logoUrl
      ? `<img class="chatsaas-header-logo" src="${resolveAssetUrl(widget.logoUrl)}" alt="" />`
      : "";

    windowEl.innerHTML = `
      <div class="chatsaas-header" style="background: ${headerBg}; color: ${headerText}">
        ${logo}
        <div class="chatsaas-header-title">${escapeHtml(widget.displayName || widget.name || "Live Chat")}</div>
        <div class="chatsaas-header-close">×</div>
      </div>
      <div class="chatsaas-messages"></div>
      <div class="chatsaas-input-area">
        <input class="chatsaas-input" placeholder="${escapeHtml(widget.placeholderText || "Type a message...")}" value="${escapeHtml(widget.prefillMessage || "")}" />
        <button class="chatsaas-send" style="background: ${widget.buttonBgColor || headerBg}">➤</button>
      </div>
    `;

    const closeBtn = windowEl.querySelector(".chatsaas-header-close");
    closeBtn.addEventListener("click", () => {
      windowEl.classList.remove("open");
    });

    const sendBtn = windowEl.querySelector(".chatsaas-send");
    const inputEl = windowEl.querySelector(".chatsaas-input");

    const sendMsg = () => {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = "";

      // Append instantly
      appendMessage(text, "inbound");

      // Send to server
      fetch(`${backendUrl}/api/v1/webchat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetKey, visitorId, conversationId, body: text }),
      }).catch(err => console.error("Error sending webchat message:", err));
    };

    sendBtn.addEventListener("click", sendMsg);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        sendMsg();
      }
    });
  }

  // A deep-link widget (WhatsApp/Messenger/Telegram/Instagram) never talks
  // to our backend at all beyond the one-time config fetch above — it just
  // shows a small preview popup and hands the visitor off to the platform's
  // own app. WhatsApp/Messenger support an editable pre-filled message
  // (rebuilt into the link on click); Telegram's payload and Instagram's
  // ig.me link are fixed, so those platforms just get a single button.
  function renderDeepLinkWindow(widget) {
    const headerBg = widget.headerBgColor || widget.primaryColor || "#6366f1";
    const headerText = widget.headerTextColor || "#ffffff";
    const logo = widget.logoUrl
      ? `<img class="chatsaas-header-logo" src="${resolveAssetUrl(widget.logoUrl)}" alt="" />`
      : "";
    const canEditText = widget.targetPlatform === "WHATSAPP" || widget.targetPlatform === "FACEBOOK";

    windowEl.innerHTML = `
      <div class="chatsaas-header" style="background: ${headerBg}; color: ${headerText}">
        ${logo}
        <div class="chatsaas-header-title">${escapeHtml(widget.displayName || widget.name || "Chat")}</div>
        <div class="chatsaas-header-close">×</div>
      </div>
      <div class="chatsaas-messages">
        <div class="chatsaas-message outbound">${escapeHtml(widget.greetingMessage || "Hi there! How can we help?")}</div>
      </div>
      ${canEditText
        ? `<div class="chatsaas-input-area">
             <input class="chatsaas-input" placeholder="${escapeHtml(widget.placeholderText || "Type a message...")}" value="${escapeHtml(widget.prefillMessage || "")}" />
             <button class="chatsaas-send" style="background: ${widget.buttonBgColor || headerBg}">➤</button>
           </div>`
        : `<div class="chatsaas-input-area">
             <button class="chatsaas-deeplink-go" style="flex:1; background: ${widget.buttonBgColor || headerBg}; color: ${widget.buttonTextColor || '#fff'}; border:none; border-radius:20px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer;">${escapeHtml(widget.buttonText || "Continue")}</button>
           </div>`}
    `;

    const closeBtn = windowEl.querySelector(".chatsaas-header-close");
    closeBtn.addEventListener("click", () => windowEl.classList.remove("open"));

    if (canEditText) {
      const sendBtn = windowEl.querySelector(".chatsaas-send");
      const inputEl = windowEl.querySelector(".chatsaas-input");
      const go = () => {
        const text = inputEl.value.trim();
        const base = (widget.deepLink || "").split("?")[0];
        const url = text ? `${base}?text=${encodeURIComponent(text)}` : base;
        if (url) window.open(url, "_blank");
      };
      sendBtn.addEventListener("click", go);
      inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    } else {
      const goBtn = windowEl.querySelector(".chatsaas-deeplink-go");
      goBtn.addEventListener("click", () => {
        if (widget.deepLink) window.open(widget.deepLink, "_blank");
      });
    }
  }

  function appendMessage(msgData, direction) {
    const messagesContainer = windowEl.querySelector(".chatsaas-messages");
    if (!messagesContainer) return;

    const msgEl = document.createElement("div");
    msgEl.className = `chatsaas-message ${direction}`;
    if (direction === "inbound") {
      msgEl.style.background = (config && config.buttonBgColor) || (config && config.primaryColor) || "#6366f1";
    }

    const text = typeof msgData === "string" ? msgData : (msgData?.body || "");
    const rawMedia = typeof msgData === "object" ? (msgData.media_url || msgData.mediaUrl || msgData.imageUrl) : null;
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
  }

  function initSocketConnection() {
    if (typeof io === "undefined") {
      // Retry in 500ms if script is not fully loaded
      setTimeout(initSocketConnection, 500);
      return;
    }

    if (socket) return;

    socket = io(backendUrl, {
      transports: ["websocket", "polling"],
    });

    socket.emit("webchat_join", {
      widgetId: widgetKey,
      sessionId: visitorId,
      conversationId: conversationId,
    });

    socket.on("new_message", (data) => {
      // If message is from agent or bot (outbound from visitor's perspective)
      if (data.conversationId === conversationId && data.message.direction === "OUTBOUND") {
        appendMessage(data.message, "outbound");
      }
    });
  }

  loadConfig();
})();
