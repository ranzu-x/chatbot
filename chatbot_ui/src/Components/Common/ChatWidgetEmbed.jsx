import { useEffect, useState } from 'react';

const WIDGET_SCRIPT_ID_PREFIX = 'nexa-chat-widget-';
const WIDGET_SRC = 'https://basics-cash-wimp.ngrok-free.dev/widget.js';

// Default active landing page widget key
const DEFAULT_WIDGET_KEYS = [
  'wc_fa74e1d5f95e028437623732041faf945c79b6a8e129d8fe',
];

/**
 * Embeds the Webchat widget(s) (widget.js) on public marketing pages.
 * Each script self-inits off its own `data-key` and manages its own
 * floating bubble/container in the DOM.
 */
export default function ChatWidgetEmbed() {
  const [widgetKeys, setWidgetKeys] = useState(DEFAULT_WIDGET_KEYS);

  // Fetch all active landing page widgets dynamically
  useEffect(() => {
    let isMounted = true;
    fetch('/api/v1/webchat/landing-widgets')
      .then((r) => r.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.widgetKeys) && data.widgetKeys.length > 0) {
          setWidgetKeys(data.widgetKeys);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    for (const key of widgetKeys) {
      const scriptId = WIDGET_SCRIPT_ID_PREFIX + key;
      const existingScript = document.getElementById(scriptId);
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = WIDGET_SRC;
        script.setAttribute('data-key', key);
        script.async = true;
        script.onerror = () => {
          // If ngrok tunnel is temporarily unreachable, fall back to relative /widget.js
          if (!script.src.endsWith('/widget.js')) {
            console.warn('Falling back to /widget.js for key:', key);
            script.src = '/widget.js';
          }
        };
        document.body.appendChild(script);
      } else if (window.initChatSaaSWidget) {
        window.initChatSaaSWidget(key);
      }
    }

    return () => {
      // Clean up widgets when navigating away from public pages to dashboard or auth
      setTimeout(() => {
        const path = window.location.pathname;
        const isPublicPage =
          path === '/' ||
          path.startsWith('/landing') ||
          path.startsWith('/pricing') ||
          path.startsWith('/blog') ||
          path.startsWith('/privacy-policy') ||
          path.startsWith('/terms-of-service');

        if (!isPublicPage) {
          for (const key of widgetKeys) {
            const s = document.getElementById(WIDGET_SCRIPT_ID_PREFIX + key);
            if (s) s.remove();
            const c = document.getElementById(`chatsaas-widget-container-${key}`);
            if (c) c.remove();
            const w = document.getElementById(`chatsaas-window-${key}`);
            if (w) w.remove();
          }
          document.querySelectorAll('.chatsaas-widget-container, .chatsaas-window').forEach((el) => el.remove());
        }
      }, 100);
    };
  }, [widgetKeys]);

  return null;
}
