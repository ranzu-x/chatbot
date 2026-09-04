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

  // 3. Inject CSS
  const style = document.createElement("style");
  style.textContent = `
    .chatsaas-widget-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .chatsaas-bubble {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 28px;
      transition: transform 0.3s ease, background 0.3s ease;
    }
    .chatsaas-bubble:hover {
      transform: scale(1.05);
    }
    .chatsaas-window {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 520px;
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
      background: #6366f1;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .chatsaas-header-title {
      font-weight: 600;
      font-size: 16px;
    }
    .chatsaas-header-close {
      cursor: pointer;
      font-size: 20px;
      opacity: 0.8;
      transition: opacity 0.2s;
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

  const bubble = document.createElement("div");
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
  let primaryColor = "#6366f1";

  // Toggle chat window
  bubble.addEventListener("click", () => {
    windowEl.classList.toggle("open");
    if (windowEl.classList.contains("open")) {
      initChat();
    }
  });

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

        primaryColor = data.widget?.primaryColor || "#6366f1";
        bubble.style.background = primaryColor;

        // Render header, messages, and input
        renderWindow(data.widget || {});
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
    windowEl.innerHTML = `
      <div class="chatsaas-header" style="background: ${primaryColor}">
        <div class="chatsaas-header-title">${widget.name || "Live Chat"}</div>
        <div class="chatsaas-header-close">×</div>
      </div>
      <div class="chatsaas-messages"></div>
      <div class="chatsaas-input-area">
        <input class="chatsaas-input" placeholder="${widget.placeholderText || "Type a message..."}" />
        <button class="chatsaas-send" style="background: ${primaryColor}">➤</button>
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

  function appendMessage(msgData, direction) {
    const messagesContainer = windowEl.querySelector(".chatsaas-messages");
    if (!messagesContainer) return;

    const msgEl = document.createElement("div");
    msgEl.className = `chatsaas-message ${direction}`;
    if (direction === "inbound") {
      msgEl.style.background = primaryColor;
    }

    const text = typeof msgData === "string" ? msgData : (msgData?.body || "");
    const rawMedia = typeof msgData === "object" ? (msgData.media_url || msgData.mediaUrl || msgData.imageUrl) : null;
    const normType = typeof msgData === "object" ? (msgData.type || "").toUpperCase() : "";

    let hasContent = false;

    if (rawMedia || normType === "IMAGE") {
      const fullImgUrl = rawMedia ? (rawMedia.startsWith("http") ? rawMedia : `${backendUrl}${rawMedia.startsWith("/") ? "" : "/"}${rawMedia}`) : null;
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
})();
