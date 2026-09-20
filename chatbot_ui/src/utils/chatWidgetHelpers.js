// Shared logic for every Chat Widget creation/edit/delete surface —
// previously duplicated (with small, confusing divergences) between
// Components/Engagement/ChatWidgetManager.jsx and Pages/Channels/
// WebchatPage.jsx. Both now call into this single module instead of each
// keeping its own copy of "build a default reply flow graph", "create the
// widget + flow + link them", or "confirm and delete".
import { channelAPI, flowAPI } from '../services/api';
import { showAlert } from './alerts';

// A widget's platform, normalized the same way everywhere it's needed
// (list filtering, default-flow-graph platform, edit-flow platform). WEBCHAT
// widgets have target_platform = NULL in the schema (they don't point at an
// external account), so widget_type is the fallback signal.
export function getWidgetPlatform(widget) {
  return (widget.target_platform || (widget.widget_type === 'WEBCHAT' ? 'WEBCHAT' : 'WHATSAPP')).toUpperCase();
}

// Real URL parsing (never substring matching) for the "where will you use
// this Chat Widget" prompt — rejects anything that isn't the customer's own
// live website: unparseable input, localhost/loopback, tunnel hosts, and
// this SaaS dashboard's own origin. Returns the lowercased hostname to store
// as the widget's allowed_domains on success.
export function validateWebsiteUrl(rawValue) {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return { ok: false, error: 'Enter a website URL.' };

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return { ok: false, error: 'Enter a valid website URL, e.g. https://example.com' };
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Enter a valid website URL, e.g. https://example.com' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.')) {
    return { ok: false, error: 'Enter a valid website URL, e.g. https://example.com' };
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return { ok: false, error: 'This widget must point at your live website, not localhost.' };
  }
  if (hostname.includes('ngrok')) {
    return { ok: false, error: 'This widget must point at your live website, not a temporary tunnel URL.' };
  }
  if (typeof window !== 'undefined' && hostname === window.location.hostname.toLowerCase()) {
    return { ok: false, error: "Enter the website where you'll embed this widget, not this dashboard's own address." };
  }

  return { ok: true, hostname };
}

// Same "Blank Canvas" shape BotManagerPage.jsx's STARTER_TEMPLATES uses for
// a brand-new flow — one Start node feeding one Text reply node — since
// FlowBuilderPage.jsx itself never seeds nodes for a new flow (it only
// fetches an existing one by :id), the caller has to build & POST them.
export function buildDefaultWidgetFlowGraph(widgetName, platform = 'WHATSAPP', extra = {}) {
  const normPlat = (platform || 'WHATSAPP').toUpperCase();
  const isWhatsApp = normPlat === 'WHATSAPP';
  const isWebchat = normPlat === 'WEBCHAT';
  const platColor = extra.primaryColor || extra.buttonBgColor || (isWhatsApp ? '#25D366' : normPlat === 'FACEBOOK' ? '#0084FF' : normPlat === 'TELEGRAM' ? '#26A5E4' : normPlat === 'INSTAGRAM' ? '#E1306C' : '#6366f1');
  const greeting = extra.greetingMessage || (isWebchat ? 'Hello! How can we help you today?' : `Hi! Thanks for reaching out to us on ${normPlat} 👋 How can we help?`);
  const btnText = extra.buttonText || 'Chat with us';

  const nodes = [
    {
      id: 'start_1',
      type: 'start',
      position: { x: 80, y: 120 },
      data: {
        label: 'Chat Widget',
        chatWidgetStart: true,
        targetPlatform: normPlat,
        widgetName: widgetName || (isWebchat ? 'Live Webchat Widget' : `${normPlat} Chat Widget`),
        displayName: extra.displayName || widgetName || 'Support Chat',
        greetingMessage: greeting,
        placeholderText: extra.placeholderText || 'Type a message…',
        prefillMessage: extra.prefillMessage || '',
        buttonText: btnText,
        buttonBgColor: platColor,
      },
    },
    {
      id: isWhatsApp ? 'interactive_1' : 'text_1',
      type: isWhatsApp ? 'interactive' : 'buttons',
      position: { x: 440, y: 120 },
      data: {
        label: isWhatsApp ? 'Welcome Reply' : 'Welcome Message',
        message: greeting,
        headerType: 'text',
        headerText: widgetName || 'Welcome',
        buttons: isWhatsApp ? [{ title: 'Talk to Sales', action: 'flow' }, { title: 'Support', action: 'flow' }] : [],
      },
    },
  ];
  const edges = [{ id: 'e1', source: 'start_1', sourceHandle: 'next-step', target: isWhatsApp ? 'interactive_1' : 'text_1', targetHandle: 'target', type: 'default', animated: false }];
  return { nodes, edges };
}

// Creates the widget row + its default reply flow + links them — the exact
// sequence every "Create Chat Widget" entry point needs. `websiteHostname`
// (already validated via validateWebsiteUrl) becomes the widget's
// allowed_domains, so it's enforceable server-side from the moment it exists.
export async function createChatWidgetAndFlow({ platformType, name, websiteHostname, integrationId = null, extraWidgetFields = {} }) {
  const normPlat = (platformType || 'WHATSAPP').toUpperCase();
  const isWebchat = normPlat === 'WEBCHAT';

  const widgetRes = await channelAPI.addWebchat({
    name,
    widgetType: isWebchat ? 'WEBCHAT' : 'DEEPLINK',
    integrationId,
    allowedDomains: websiteHostname,
    ...extraWidgetFields,
  });
  const widgetId = widgetRes.data?.id;
  const resolvedIntegrationId = isWebchat ? widgetRes.data?.integrationId : integrationId;

  const { nodes, edges } = buildDefaultWidgetFlowGraph(name, normPlat, extraWidgetFields);
  const flowRes = await flowAPI.create({
    name,
    platform: normPlat,
    integrationId: resolvedIntegrationId,
    triggerType: 'CHAT_WIDGET',
    nodes_json: JSON.stringify(nodes),
    edges_json: JSON.stringify(edges),
  });
  const flowId = flowRes.data?.flowId || flowRes.data?.flow?.id || flowRes.data?.id;

  if (widgetId && flowId) {
    await channelAPI.updateWebchat(widgetId, { flowId });
  }

  return { widgetId, flowId };
}

// For a widget that already exists but has no reply flow yet (e.g. one
// created before this flow existed, or an edit-time fallback) — builds and
// links a default flow the same way, without touching the widget row itself.
export async function createReplyFlowForWidget(widget) {
  const plat = getWidgetPlatform(widget);
  const { nodes, edges } = buildDefaultWidgetFlowGraph(widget.name, plat, widget);
  const flowRes = await flowAPI.create({
    name: widget.name,
    platform: plat,
    integrationId: widget.integration_id,
    triggerType: 'CHAT_WIDGET',
    nodes_json: JSON.stringify(nodes),
    edges_json: JSON.stringify(edges),
  });
  const flowId = flowRes.data?.flowId || flowRes.data?.flow?.id || flowRes.data?.id;
  if (flowId) {
    await channelAPI.updateWebchat(widget.id, { flowId });
  }
  return flowId;
}

// SweetAlert2 confirm, matching the app-wide convention (see
// ConnectAccountsPage.jsx's handleDisconnect / FacebookPage.jsx's
// handleDeleteRule) — resolves false without calling the delete API at all
// if the user cancels.
export async function confirmAndDeleteWidget(widget) {
  const ok = await showAlert.confirm({
    title: 'Delete Chat Widget?',
    text: `"${widget.name}" and its embed code will stop working immediately. This cannot be undone.`,
    confirmButtonText: 'Yes, Delete',
  });
  if (!ok) return false;
  await channelAPI.deleteWebchat(widget.id);
  return true;
}
