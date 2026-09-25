import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import pool from "../db.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A listMenu payload carries `sections: [{title, rows}]` (flowEngine.js's own
 * listMenu node case, which already groups by section) OR the older flat
 * `items: [{id, title, description}]` (the Multiple-Choice-as-list fallback,
 * and any other caller that hasn't been updated) — this normalizes either
 * into `[{title, rows}]` so every platform branch below has one shape to
 * read regardless of which the caller sent.
 */
function getListMenuSections(listMenu) {
  if (Array.isArray(listMenu?.sections) && listMenu.sections.length > 0) return listMenu.sections;
  return [{ title: listMenu?.title || "Options", rows: listMenu?.items || [] }];
}

function convertAudioToWhatsAppVoice(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat("ogg")
      .audioCodec("libopus")
      .audioChannels(1)
      .audioFrequency(48000)
      .audioBitrate("32k")
      .outputOptions([
        "-application", "voip",
        "-avoid_negative_ts", "make_zero"
      ])
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

function getMimeType(filePath, defaultType = "IMAGE") {
  const ext = path.extname(filePath || "").toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".3gp": "video/3gp",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg; codecs=opus",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".zip": "application/zip",
  };
  if (map[ext]) return map[ext];
  const upper = (defaultType || "").toUpperCase();
  if (upper === "VIDEO") return "video/mp4";
  if (upper === "AUDIO" || upper === "VOICE") return "audio/ogg; codecs=opus";
  if (upper === "DOCUMENT" || upper === "FILE") return "application/pdf";
  return "image/jpeg";
}

function isLocalHostUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(url);
}

let cachedTunnelUrl = null;
let lastTunnelCheck = 0;

export async function getPublicBackendUrl() {
  const now = Date.now();
  if (cachedTunnelUrl && (now - lastTunnelCheck < 30000)) {
    return cachedTunnelUrl;
  }

  const envUrl = (process.env.BACKEND_URL || process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  const isNgrokEnv = /ngrok/i.test(envUrl);

  // If running locally, check if local ngrok agent is active on port 4040.
  // When ngrok is running locally or envUrl is a dynamic ngrok URL, the live tunnel from
  // port 4040 takes precedence because ngrok assigns new URLs on every restart.
  if (!envUrl || isLocalHostUrl(envUrl) || isNgrokEnv) {
    try {
      const res = await axios.get("http://127.0.0.1:4040/api/tunnels", { timeout: 1500 });
      const httpsTunnel = res.data?.tunnels?.find((t) => t.proto === "https") || res.data?.tunnels?.[0];
      if (httpsTunnel?.public_url) {
        cachedTunnelUrl = httpsTunnel.public_url.replace(/\/+$/, "");
        lastTunnelCheck = now;
        return cachedTunnelUrl;
      }
    } catch (e) {
      // ngrok not running or not reachable
    }
  }

  if (envUrl && !isLocalHostUrl(envUrl)) {
    return envUrl;
  }

  return "http://localhost:5000";
}

export function resolvePublicImageUrl(rawUrl, publicBackendUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const base = (publicBackendUrl && !isLocalHostUrl(publicBackendUrl))
    ? publicBackendUrl.replace(/\/+$/, "")
    : (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

  // If already an absolute URL
  if (/^https?:\/\//i.test(trimmed)) {
    if (!isLocalHostUrl(trimmed)) {
      return trimmed;
    }
    // Rewrite localhost URL with public host if available
    if (base && !isLocalHostUrl(base)) {
      try {
        const parsed = new URL(trimmed);
        return `${base}${parsed.pathname}${parsed.search}`;
      } catch (e) {
        return trimmed.replace(/^https?:\/\/[^/]+/i, base);
      }
    }
    return trimmed;
  }

  // Relative path (e.g. /uploads/image.jpg)
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalizedPath}`;
}

export function normalizeMessengerButton(btn) {
  if (!btn) return null;
  const isUrl = btn.type === "URL" || btn.action === "url" || (Boolean(btn.url) && !btn.payload);
  const title = String(typeof btn === "string" ? btn : (btn.title || btn.label || "Select")).trim().slice(0, 20) || "Select";
  if (isUrl) {
    let url = btn.url || "https://example.com";
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return {
      type: "web_url",
      title,
      url,
    };
  }
  return {
    type: "postback",
    title,
    payload: String(btn.payload || btn.id || btn.sequenceId || btn.title || "select").slice(0, 1000),
  };
}

function resolveLocalMediaPath(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;
  let urlPath = mediaUrl.trim();
  try {
    if (urlPath.startsWith("http://") || urlPath.startsWith("https://")) {
      const parsed = new URL(urlPath);
      urlPath = parsed.pathname;
    }
  } catch (e) {}

  const cleanPath = urlPath.replace(/^[/\\]+/, "");
  const filename = path.basename(cleanPath);

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateDirs = [
    path.resolve(moduleDir, "..", "uploads"),
    path.resolve(moduleDir, ".."),
    path.resolve(process.cwd(), "chatbot_api", "uploads"),
    path.resolve(process.cwd(), "uploads"),
    process.cwd(),
  ];

  for (const dir of candidateDirs) {
    const check1 = path.resolve(dir, cleanPath);
    if (fs.existsSync(check1) && fs.statSync(check1).isFile()) return check1;
    const check2 = path.resolve(dir, filename);
    if (fs.existsSync(check2) && fs.statSync(check2).isFile()) return check2;
  }

  return null;
}

async function uploadLocalWhatsAppMedia(phoneNumberId, accessToken, localPath, mimeType) {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  const fileBuffer = fs.readFileSync(localPath);
  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  const uploadFilename = path.extname(localPath).toLowerCase() === ".ogg" ? "voice_message.ogg" : path.basename(localPath);
  formData.append("file", fileBlob, uploadFilename);

  const uploadRes = await axios.post(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/media`,
    formData,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    }
  );
  return uploadRes.data?.id || null;
}

const whatsAppMediaUploadCache = new Map();

export async function getOrUploadWhatsAppMedia(phoneNumberId, accessToken, localPath, mimeType) {
  let stat;
  try {
    stat = fs.statSync(localPath);
  } catch (e) {
    return null;
  }
  const cacheKey = `${phoneNumberId}:${localPath}:${stat.mtimeMs}`;
  const now = Date.now();
  const cached = whatsAppMediaUploadCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.mediaId) {
    return cached.mediaId;
  }

  const mediaId = await uploadLocalWhatsAppMedia(phoneNumberId, accessToken, localPath, mimeType);
  if (mediaId) {
    // Meta media IDs remain valid for 30 days; cache for 24 hours
    whatsAppMediaUploadCache.set(cacheKey, {
      mediaId,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
  }
  return mediaId;
}

async function uploadFacebookAttachment(accessToken, localPath, fullMediaUrl, defaultType = "IMAGE") {
  const uploadUrl = `https://graph.facebook.com/${META_API_VERSION}/me/message_attachments?access_token=${accessToken}`;

  // 1. If local file exists, upload via multipart FormData
  if (localPath && fs.existsSync(localPath)) {
    const formData = new FormData();
    formData.append("message", JSON.stringify({
      attachment: {
        type: "image",
        payload: { is_reusable: true }
      }
    }));
    const mimeType = getMimeType(localPath, defaultType);
    const fileBuffer = fs.readFileSync(localPath);
    const fileBlob = new Blob([fileBuffer], { type: mimeType });
    formData.append("filedata", fileBlob, path.basename(localPath));

    const uploadRes = await axios.post(uploadUrl, formData, {
      timeout: 30000,
    });
    return uploadRes.data?.attachment_id || null;
  }

  // 2. If reachable external URL, upload by URL to get attachment_id
  if (fullMediaUrl && !isLocalHostUrl(fullMediaUrl)) {
    const uploadRes = await axios.post(uploadUrl, {
      message: {
        attachment: {
          type: "image",
          payload: {
            url: fullMediaUrl,
            is_reusable: true,
          }
        }
      }
    }, { timeout: 30000 });
    return uploadRes.data?.attachment_id || null;
  }

  return null;
}

/**
 * Send message to external platform APIs (WhatsApp, Facebook Messenger, Instagram, Telegram)
 */
/** See utils/whatsappFlowCrypto.js / routes/whatsappFlowEndpoint.js — the
 * only place flow_token, contact and relay-webhook get tied together. */
async function recordFlowSession(integration, contactExternalId, flowToken, metaFlowId) {
  const [[contact]] = await pool.query(
    "SELECT id FROM contacts WHERE agency_id = ? AND platform = 'WHATSAPP' AND external_id = ?",
    [integration.agency_id, contactExternalId]
  );
  const [[conversation]] = contact
    ? await pool.query("SELECT id FROM conversations WHERE contact_id = ? AND integration_id = ?", [contact.id, integration.id])
    : [[null]];
  const [[flowRef]] = await pool.query(
    "SELECT id, relay_webhook_url FROM whatsapp_flow_refs WHERE flow_id = ? AND agency_id = ? AND (integration_id = ? OR integration_id IS NULL)",
    [metaFlowId, integration.agency_id, integration.id]
  );

  await pool.query(
    `INSERT INTO whatsapp_flow_sessions (flow_token, agency_id, integration_id, contact_id, conversation_id, flow_ref_id, relay_webhook_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT')`,
    [flowToken, integration.agency_id, integration.id, contact?.id || null, conversation?.id || null, flowRef?.id || null, flowRef?.relay_webhook_url || null]
  );
}

export async function sendPlatformMessage(platform, integration, contactExternalId, messageData) {
  const {
    type = "TEXT",
    body = "",
    mediaUrl,
    caption,
    buttons,
    quickReplies,
    listMenu,
    card,
    carousel,
    headerType,
    headerText,
    headerMediaUrl,
    footerText,
    whatsappTemplate,
    whatsappFlow,
  } = messageData;
  const accessToken = integration.access_token;
  const backendUrl = await getPublicBackendUrl();
  const fullMediaUrl = resolvePublicImageUrl(mediaUrl, backendUrl);

  const upperType = (type || "TEXT").toUpperCase();
  const isMedia = ["IMAGE", "VIDEO", "AUDIO", "VOICE", "DOCUMENT", "FILE"].includes(upperType);

  try {
    if (platform === "WHATSAPP") {
      const phoneNumberId = integration.wa_phone_number_id;
      const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
      let payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: contactExternalId,
      };

      // Outside the 24h customer-service window, WhatsApp only accepts a
      // pre-approved Template message — used by Sequence Messages
      // (utils/messagingWindow.js) when a scheduled step falls outside the
      // window and the step has a linked approved template, and now also by
      // the Live Inbox Send Menu's Message Template option (routes/conversations.js's
      // POST /conversations/:id/messages, which builds `components` from the
      // template's variables_json + the agent-filled values before calling
      // this). `components` is optional — omitted, this behaves exactly as
      // before (name + language only, for templates that need no variables).
      if (whatsappTemplate?.name) {
        let components = Array.isArray(whatsappTemplate.components) ? whatsappTemplate.components : [];
        // A header image/video/document may be an uploaded file (/uploads/…)
        // — Meta fetches the link itself, so it must be a public absolute URL.
        const hasHeaderMedia = components.some((c) => c.type === "header" && c.parameters?.some((p) => p[p.type]?.link));
        const hasCarouselMedia = components.some((c) => c.type === "carousel" && Array.isArray(c.cards) && c.cards.some((card) =>
          card.components?.some((cc) => cc.type === "header" && cc.parameters?.some((p) => p[p.type]?.link))
        ));

        if (hasHeaderMedia || hasCarouselMedia) {
          const publicBase = await getPublicBackendUrl();
          const resolveParams = async (params) => {
            const out = [];
            for (const p of params || []) {
              const mediaType = p?.type;
              const rawLink = p?.[mediaType]?.link;
              if (!rawLink || !["image", "video", "document"].includes(mediaType)) {
                out.push(p);
                continue;
              }

              const localPath = resolveLocalMediaPath(rawLink);
              let mediaId = null;
              if (localPath && fs.existsSync(localPath)) {
                try {
                  const mime = getMimeType(localPath, mediaType.toUpperCase());
                  console.log(`📤 [WhatsApp Template Media] Uploading binary to Meta: ${localPath} (${mime})`);
                  mediaId = await getOrUploadWhatsAppMedia(phoneNumberId, accessToken, localPath, mime);
                  if (mediaId && (mediaType === "video" || mediaType === "document")) {
                    await sleep(1500);
                  }
                } catch (upErr) {
                  console.warn(`[WhatsApp Template Media Upload Warning] Binary upload failed, falling back to link:`, upErr.response?.data || upErr.message);
                }
              }

              const existingFilename = p?.[mediaType]?.filename;
              const extraDoc = existingFilename ? { filename: existingFilename } : {};
              if (mediaId) {
                out.push({
                  type: mediaType,
                  [mediaType]: { id: mediaId, ...extraDoc },
                });
              } else {
                out.push({
                  type: mediaType,
                  [mediaType]: { link: resolvePublicImageUrl(rawLink, publicBase), ...extraDoc },
                });
              }
            }
            return out;
          };

          const newComponents = [];
          for (const c of components) {
            if (c.type === "header" && Array.isArray(c.parameters)) {
              const newParams = await resolveParams(c.parameters);
              newComponents.push({ ...c, parameters: newParams });
            } else if (c.type === "carousel" && Array.isArray(c.cards)) {
              const newCards = [];
              for (const card of c.cards) {
                const newCardComps = [];
                for (const cc of card.components || []) {
                  if (cc.type === "header" && Array.isArray(cc.parameters)) {
                    const newParams = await resolveParams(cc.parameters);
                    newCardComps.push({ ...cc, parameters: newParams });
                  } else {
                    newCardComps.push(cc);
                  }
                }
                newCards.push({ ...card, components: newCardComps });
              }
              newComponents.push({ ...c, cards: newCards });
            } else {
              newComponents.push(c);
            }
          }
          components = newComponents;
        }
        payload.type = "template";
        payload.template = {
          name: whatsappTemplate.name,
          language: { code: whatsappTemplate.language || "en_US" },
          ...(components.length ? { components } : {}),
        };
        const response = await axios.post(url, payload, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        return response.data?.messages?.[0]?.id || null;
      }

      // Send Menu's "WhatsApp Flow" option — references an already-published
      // Meta Flow by flow_id (see whatsapp_flow_refs / routes/whatsappFlowRefs.js);
      // this app does not author/publish Flow JSON itself. Meta's real-time
      // interactive Flow message, only usable within the 24h customer-service
      // window (unlike a Flow referenced from an approved Template's button).
      if (whatsappFlow?.flowId) {
        const flowToken = `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        payload.type = "interactive";
        payload.interactive = {
          type: "flow",
          body: { text: (body && body.trim()) || "Please complete this form:" },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: flowToken,
              flow_id: whatsappFlow.flowId,
              flow_cta: (whatsappFlow.cta || "Open").slice(0, 20),
              flow_action: "navigate",
              flow_action_payload: { screen: whatsappFlow.screen || "START" },
            },
          },
        };
        const response = await axios.post(url, payload, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        // Records flow_token -> agency/contact/relay so the encrypted
        // data-exchange endpoint (routes/whatsappFlowEndpoint.js) can later
        // trace an incoming, otherwise-anonymous encrypted POST back to who
        // it's for. Best-effort: a logging failure must never break the
        // send that already succeeded.
        recordFlowSession(integration, contactExternalId, flowToken, whatsappFlow.flowId).catch((err) => {
          console.error("[WA Flow] Failed to record flow session:", err.message);
        });
        return response.data?.messages?.[0]?.id || null;
      }

      const hasButtons = Array.isArray(buttons) && buttons.length > 0;
      const isInteractive = upperType === "INTERACTIVE" || Boolean(headerType || footerText);

      // WhatsApp's plain interactive "reply button" message type has no real
      // link-button concept at all — a button configured as a URL action still
      // just replies with its title when tapped, it never opens anything. A
      // single URL button needs the dedicated CTA-URL message type instead, which
      // genuinely opens the link in the browser. Meta only allows exactly one
      // button on a CTA-URL message (no mixing with reply buttons), so this only
      // applies when the whole message is just that one URL button.
      // https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-cta-url-messages/
      const singleUrlButton = hasButtons && buttons.length === 1 && (() => {
        const btn = buttons[0];
        if (typeof btn !== "object" || !btn) return null;
        const isUrlType = btn.type === "URL" || btn.action === "url";
        return (isUrlType && btn.url) ? btn : null;
      })();

      if (singleUrlButton) {
        const ctaBodyText = (body && body.trim()) || (caption && caption.trim()) || "Tap below to continue:";
        payload.type = "interactive";
        payload.interactive = {
          type: "cta_url",
          body: { text: ctaBodyText.slice(0, 1024) },
          action: {
            name: "cta_url",
            parameters: {
              display_text: String(singleUrlButton.title || singleUrlButton.label || "Open Link").slice(0, 20),
              url: singleUrlButton.url,
            },
          },
        };

        const effectiveHeaderType = (headerType || "").toLowerCase();
        if (effectiveHeaderType === "text" && headerText && headerText.trim()) {
          payload.interactive.header = { type: "text", text: headerText.trim().slice(0, 60) };
        }
        if (footerText && footerText.trim()) {
          payload.interactive.footer = { text: footerText.trim().slice(0, 60) };
        }

        const response = await axios.post(url, payload, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        return response.data?.messages?.[0]?.id || null;
      } else if (hasButtons) {
        // WhatsApp interactive buttons (Max 3)
        const interactiveBodyText = (body && body.trim()) || (caption && caption.trim()) || (upperType === "IMAGE" ? "\u200B" : "Please select an option:");
        payload.type = "interactive";
        payload.interactive = {
          type: "button",
          body: { text: interactiveBodyText.slice(0, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((btn, index) => {
              const btnTitle = typeof btn === "string" ? btn : (btn.title || btn.label || btn.reply_text || `Option ${index + 1}`);
              const btnId = typeof btn === "string" ? `btn-${index}` : (btn.id || btn.payload || `btn_${index}`);
              return {
                type: "reply",
                reply: {
                  id: String(btnId).slice(0, 256),
                  title: String(btnTitle).slice(0, 20),
                },
              };
            }),
          },
        };

        // Handle Header for interactive message
        const effectiveHeaderType = (headerType || (upperType === "IMAGE" ? "image" : "")).toLowerCase();
        const headerMedia = headerMediaUrl || (upperType === "IMAGE" ? (mediaUrl || fullMediaUrl) : "");

        if (effectiveHeaderType === "text" && headerText && headerText.trim()) {
          payload.interactive.header = {
            type: "text",
            text: headerText.trim().slice(0, 60),
          };
        } else if (["image", "video", "document"].includes(effectiveHeaderType) && headerMedia) {
          const localHeaderPath = resolveLocalMediaPath(headerMedia);
          let headerMediaId = null;
          if (localHeaderPath && fs.existsSync(localHeaderPath)) {
            try {
              const mime = getMimeType(localHeaderPath, effectiveHeaderType.toUpperCase());
              headerMediaId = await getOrUploadWhatsAppMedia(phoneNumberId, accessToken, localHeaderPath, mime);
            } catch (upErr) {
              console.warn(`[WhatsApp Header Upload Warning]`, upErr.response?.data || upErr.message);
            }
          }
          const fullHeaderMediaUrl = resolvePublicImageUrl(headerMedia, backendUrl);

          if (effectiveHeaderType === "image") {
            payload.interactive.header = {
              type: "image",
              image: headerMediaId ? { id: headerMediaId } : { link: fullHeaderMediaUrl },
            };
          } else if (effectiveHeaderType === "video") {
            payload.interactive.header = {
              type: "video",
              video: headerMediaId ? { id: headerMediaId } : { link: fullHeaderMediaUrl },
            };
          } else if (effectiveHeaderType === "document") {
            payload.interactive.header = {
              type: "document",
              document: headerMediaId ? { id: headerMediaId } : { link: fullHeaderMediaUrl },
            };
          }
        }

        // Handle Footer for interactive message
        if (footerText && footerText.trim()) {
          payload.interactive.footer = {
            text: footerText.trim().slice(0, 60),
          };
        }
      } else if (quickReplies && quickReplies.length > 0) {
        // WhatsApp interactive quick replies (Meta WhatsApp Cloud API):
        // Up to 3 buttons send as Interactive Reply Buttons (type: "reply", title <= 20 chars).
        // If 4 to 10 options, automatically adapts to Meta WhatsApp Interactive List Message.
        const qrBodyText = (body && body.trim()) || (caption && caption.trim()) || "Please select an option:";
        if (quickReplies.length <= 3) {
          payload.type = "interactive";
          payload.interactive = {
            type: "button",
            body: { text: qrBodyText.slice(0, 1024) },
            action: {
              buttons: quickReplies.slice(0, 3).map((qr, index) => {
                const qrTitle = typeof qr === "string" ? qr : (qr.title || qr.label || `Option ${index + 1}`);
                const qrId = typeof qr === "string" ? `qr_${index}` : (qr.payload || qr.id || `qr_${index}`);
                return {
                  type: "reply",
                  reply: {
                    id: String(qrId).slice(0, 256),
                    title: String(qrTitle).slice(0, 20),
                  },
                };
              }),
            },
          };
        } else {
          // If > 3 options, automatically render as WhatsApp Interactive List (up to 10 rows)
          payload.type = "interactive";
          payload.interactive = {
            type: "list",
            body: { text: qrBodyText.slice(0, 1024) },
            action: {
              button: "Options",
              sections: [
                {
                  title: "Options",
                  rows: quickReplies.slice(0, 10).map((qr, index) => {
                    const qrTitle = typeof qr === "string" ? qr : (qr.title || qr.label || `Option ${index + 1}`);
                    const qrId = typeof qr === "string" ? `qr_${index}` : (qr.payload || qr.id || `qr_${index}`);
                    return {
                      id: String(qrId).slice(0, 200),
                      title: String(qrTitle).slice(0, 24),
                      description: "",
                    };
                  }),
                },
              ],
            },
          };
        }

        if (headerText && headerText.trim()) {
          payload.interactive.header = {
            type: "text",
            text: headerText.trim().slice(0, 60),
          };
        }
        if (footerText && footerText.trim()) {
          payload.interactive.footer = {
            text: footerText.trim().slice(0, 60),
          };
        }
      } else if (isInteractive && !hasButtons) {
        // Interactive node without buttons: Meta WhatsApp doesn't accept interactive button with 0 buttons,
        // so send formatted text message with bold header and italic footer.
        let fullText = "";
        if (headerType === "text" && headerText && headerText.trim()) {
          fullText += `*${headerText.trim()}*\n\n`;
        }
        fullText += (body && body.trim()) || "";
        if (footerText && footerText.trim()) {
          fullText += `\n\n_${footerText.trim()}_`;
        }
        payload.type = "text";
        payload.text = { body: fullText.trim() || "..." };
      } else if (isMedia && (mediaUrl || fullMediaUrl)) {
        // Resolve media file stored locally on server
        let localPath = resolveLocalMediaPath(mediaUrl);
        let mediaId = null;

        if (localPath && fs.existsSync(localPath)) {
          try {
            // If audio was recorded in webm or non-ogg format, transcode to WhatsApp native VoIP Opus voice note
            if (upperType === "AUDIO" || upperType === "VOICE") {
              const ext = path.extname(localPath).toLowerCase();
              if (ext === ".webm" || ext === ".wav" || ext === ".m4a") {
                const oggPath = localPath.replace(new RegExp(`${ext}$`, "i"), ".ogg");
                console.log(`🎙️ [WhatsApp Voice] Transcoding ${localPath} to native WhatsApp VoIP Opus voice note...`);
                await convertAudioToWhatsAppVoice(localPath, oggPath);
                if (fs.existsSync(oggPath)) {
                  localPath = oggPath;
                  messageData.finalMediaUrl = "/" + path.relative(process.cwd(), oggPath).replace(/\\/g, "/");
                }
              }
            }

            const mimeType = getMimeType(localPath, upperType);
            console.log(`📤 [WhatsApp Upload] Uploading binary to Meta: ${localPath} (${mimeType})`);
            mediaId = await getOrUploadWhatsAppMedia(phoneNumberId, accessToken, localPath, mimeType);
            console.log(`📤 [WhatsApp Upload] Got media ID: ${mediaId}`);

            if (mediaId && (upperType === "VIDEO" || upperType === "DOCUMENT" || upperType === "FILE")) {
              // Documented Meta Cloud API quirk: referencing a media id in a message
              // send immediately after uploading it can fail with error 131053
              // ("no video/media stream found") because Meta hasn't finished
              // indexing the upload yet — video (and large documents) need more
              // server-side processing time than images do. A short delay before
              // the send fixes it. Confirmed against two separate, independently
              // valid H.264 video files that both failed identically without this.
              await sleep(1500);
            }
          } catch (uploadErr) {
            console.error(`❌ [WhatsApp Upload Error]:`, uploadErr.response?.data || uploadErr.message);
            if (!fullMediaUrl || isLocalHostUrl(fullMediaUrl)) {
              throw uploadErr;
            }
          }
        } else if (!localPath && isLocalHostUrl(fullMediaUrl)) {
          throw new Error(`Cannot send media to WhatsApp: Local media file not found on disk, and Meta cannot fetch localhost URLs (${mediaUrl})`);
        }

        const mediaCaption = (caption && caption.trim()) || (body && body.trim()) || undefined;

        if (upperType === "IMAGE") {
          payload.type = "image";
          payload.image = mediaId
            ? { id: mediaId, caption: mediaCaption }
            : { link: fullMediaUrl, caption: mediaCaption };
        } else if (upperType === "VIDEO") {
          payload.type = "video";
          payload.video = mediaId
            ? { id: mediaId, caption: mediaCaption }
            : { link: fullMediaUrl, caption: mediaCaption };
        } else if (upperType === "AUDIO" || upperType === "VOICE") {
          payload.type = "audio";
          payload.audio = mediaId
            ? { id: mediaId }
            : { link: fullMediaUrl };
        } else if (upperType === "DOCUMENT" || upperType === "FILE") {
          payload.type = "document";
          const filename = messageData.filename || (localPath ? path.basename(localPath) : "Document.pdf");
          payload.document = mediaId
            ? { id: mediaId, caption: mediaCaption, filename }
            : { link: fullMediaUrl, caption: mediaCaption, filename };
        }
      } else if (listMenu) {
        // WhatsApp interactive list — real native sections (Meta's own
        // `action.sections[]`), up to 10 sections and 10 rows TOTAL across
        // all of them combined in this one message (flowEngine.js's listMenu
        // node case already enforces the "split into another list" cap on
        // the author side; this just carries whatever it sends through).
        const rawSections = getListMenuSections(listMenu).filter((s) => (s.rows || []).length > 0).slice(0, 10);
        let rowsBudget = 10;
        const sections = rawSections.map((s) => {
          const rows = (s.rows || []).slice(0, rowsBudget).map((item, index) => ({
            id: item.id || `item_${index}`,
            title: (item.title || "").slice(0, 24),
            description: item.description ? item.description.slice(0, 72) : "",
          }));
          rowsBudget -= rows.length;
          return { title: (s.title || "Options").slice(0, 24), rows };
        }).filter((s) => s.rows.length > 0);

        payload.type = "interactive";
        payload.interactive = {
          type: "list",
          body: { text: body || "Please select an option:" },
          action: {
            button: listMenu.buttonText || "Select",
            sections,
          },
        };
      } else {
        // Default text message
        payload.type = "text";
        payload.text = { body: body };
      }

      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      return response.data?.messages?.[0]?.id || null;
    }

    if (platform === "FACEBOOK" || platform === "INSTAGRAM") {
      const url = `https://graph.facebook.com/${META_API_VERSION}/me/messages?access_token=${accessToken}`;
      let payload = {
        recipient: { id: contactExternalId },
        messaging_type: "RESPONSE",
        message: {},
      };

      if (carousel && carousel.length > 0) {
        const resolvedCarouselImages = carousel.slice(0, 10).map((item) => {
          const raw = item.imageUrl || item.mediaUrl || item.image;
          if (!raw) return null;
          const resolved = resolvePublicImageUrl(raw, backendUrl);
          if (isLocalHostUrl(resolved)) {
            console.warn(`[FB Carousel] Local image_url without public domain: ${resolved}`);
            return null;
          }
          return resolved;
        });

        payload.message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: carousel.slice(0, 10).map((item, idx) => {
                const element = {
                  title: String(item.title || "Option").trim().slice(0, 80) || "Option",
                };
                if (item.subtitle && String(item.subtitle).trim()) {
                  element.subtitle = String(item.subtitle).trim().slice(0, 80);
                }
                if (resolvedCarouselImages[idx]) {
                  element.image_url = resolvedCarouselImages[idx];
                }
                const rawButtons = Array.isArray(item.buttons) ? item.buttons : [];
                const formattedButtons = rawButtons.map(normalizeMessengerButton).filter(Boolean).slice(0, 3);
                if (formattedButtons.length > 0) {
                  element.buttons = formattedButtons;
                }
                return element;
              }),
            },
          },
        };
      } else if (card) {
        const rawCardImage = card.imageUrl || card.mediaUrl || card.image;
        let resolvedCardImage = rawCardImage ? resolvePublicImageUrl(rawCardImage, backendUrl) : null;
        if (resolvedCardImage && isLocalHostUrl(resolvedCardImage)) {
          console.warn(`[FB Card] Local image_url without public domain: ${resolvedCardImage}`);
          resolvedCardImage = null;
        }

        const rawButtons = Array.isArray(card.buttons) ? card.buttons : [];
        const formattedButtons = rawButtons.map(normalizeMessengerButton).filter(Boolean).slice(0, 3);

        const element = {
          title: String(card.title || "Option").trim().slice(0, 80) || "Option",
        };
        if (card.subtitle && String(card.subtitle).trim()) {
          element.subtitle = String(card.subtitle).trim().slice(0, 80);
        }
        if (resolvedCardImage) {
          element.image_url = resolvedCardImage;
        }
        if (formattedButtons.length > 0) {
          element.buttons = formattedButtons;
        }

        payload.message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: [element],
            },
          },
        };
      } else if (upperType === "IMAGE" && buttons && buttons.length > 0) {
        const localPath = resolveLocalMediaPath(mediaUrl);
        const hasCaption = Boolean(caption && caption.trim());

        // ── 1. FACEBOOK MESSENGER ──
        if (platform === "FACEBOOK") {
          // A) When no caption is provided (the ManyChat image + buttons style):
          // Meta's "media" template attaches buttons DIRECTLY to the image with NO title, NO text, and ZERO blank space!
          if (!hasCaption) {
            try {
              const attachmentId = await uploadFacebookAttachment(accessToken, localPath, fullMediaUrl, "IMAGE");
              if (attachmentId) {
                payload.message = {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "media",
                      elements: [
                        {
                          media_type: "image",
                          attachment_id: attachmentId,
                          buttons: buttons.slice(0, 3).map((btn) => ({
                            type: btn.type === "URL" ? "web_url" : "postback",
                            title: (typeof btn === "string" ? btn : (btn.title || btn.label || "Select")).slice(0, 20),
                            [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || (typeof btn === "string" ? btn : btn.title) || "select",
                          })),
                        },
                      ],
                    },
                  },
                };
                const response = await axios.post(url, payload);
                console.log(`[FB Send Media Template] Image with flush buttons sent to ${contactExternalId}, msgId:`, response.data?.message_id);
                return response.data?.message_id || null;
              }
            } catch (mediaErr) {
              console.warn(`[FB Send Media Template Warning] Media template failed:`, mediaErr.response?.data || mediaErr.message);
            }
          }

          // B) If caption exists and fullMediaUrl is public/reachable:
          // Send as a Generic Template card with title = caption
          if (hasCaption && fullMediaUrl && !isLocalHostUrl(fullMediaUrl)) {
            try {
              payload.message = {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [
                      {
                        title: caption.trim().slice(0, 80),
                        image_url: fullMediaUrl,
                        buttons: buttons.slice(0, 3).map((btn) => ({
                          type: btn.type === "URL" ? "web_url" : "postback",
                          title: (typeof btn === "string" ? btn : (btn.title || btn.label || "Select")).slice(0, 20),
                          [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || (typeof btn === "string" ? btn : btn.title) || "select",
                        })),
                      },
                    ],
                  },
                },
              };
              const response = await axios.post(url, payload);
              console.log(`[FB Send Generic Card with Caption] Sent to ${contactExternalId}, msgId:`, response.data?.message_id);
              return response.data?.message_id || null;
            } catch (genErr) {
              console.warn(`[FB Send Generic Card Warning] Generic template failed:`, genErr.response?.data || genErr.message);
            }
          }

          // C) If Media Template couldn't be sent, try Media Template with uploaded attachment even with caption
          try {
            const attachmentId = await uploadFacebookAttachment(accessToken, localPath, fullMediaUrl, "IMAGE");
            if (attachmentId) {
              payload.message = {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "media",
                    elements: [
                      {
                        media_type: "image",
                        attachment_id: attachmentId,
                        buttons: buttons.slice(0, 3).map((btn) => ({
                          type: btn.type === "URL" ? "web_url" : "postback",
                          title: (typeof btn === "string" ? btn : (btn.title || btn.label || "Select")).slice(0, 20),
                          [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || (typeof btn === "string" ? btn : btn.title) || "select",
                        })),
                      },
                    ],
                  },
                },
              };
              const response = await axios.post(url, payload);
              console.log(`[FB Send Media Template Fallback] Sent to ${contactExternalId}, msgId:`, response.data?.message_id);
              return response.data?.message_id || null;
            }
          } catch (mErr) {
            console.warn(`[FB Send Media Template Retry Failed]:`, mErr.response?.data || mErr.message);
          }
        }

        // ── 2. INSTAGRAM / FALLBACK ──
        if (fullMediaUrl && !isLocalHostUrl(fullMediaUrl)) {
          const btnText = (caption && caption.trim()) || (body && body.trim()) || "Option:";
          try {
            payload.message = {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [
                    {
                      title: btnText.slice(0, 80),
                      image_url: fullMediaUrl,
                      buttons: buttons.slice(0, 3).map((btn) => ({
                        type: btn.type === "URL" ? "web_url" : "postback",
                        title: (typeof btn === "string" ? btn : (btn.title || btn.label || "Select")).slice(0, 20),
                        [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || (typeof btn === "string" ? btn : btn.title) || "select",
                      })),
                    },
                  ],
                },
              },
            };
            const response = await axios.post(url, payload);
            return response.data?.message_id || null;
          } catch (genErr) {
            console.warn(`[Send Generic Card Fallback Error]:`, genErr.response?.data || genErr.message);
          }
        }
      } else if (fullMediaUrl && isMedia) {
        let attachmentType = "image";
        if (upperType === "VIDEO") attachmentType = "video";
        else if (upperType === "AUDIO") attachmentType = "audio";
        else if (upperType === "DOCUMENT" || upperType === "FILE") attachmentType = "file";

        // Check if media is stored locally on server
        const localPath = resolveLocalMediaPath(mediaUrl);

        if (localPath && fs.existsSync(localPath)) {
          try {
            const formData = new FormData();
            formData.append("recipient", JSON.stringify({ id: contactExternalId }));
            formData.append("messaging_type", "RESPONSE");
            formData.append("message", JSON.stringify({
              attachment: {
                type: attachmentType,
                payload: { is_reusable: true }
              }
            }));
            const mimeType = getMimeType(localPath, upperType);
            const fileBuffer = fs.readFileSync(localPath);
            const fileBlob = new Blob([fileBuffer], { type: mimeType });
            formData.append("filedata", fileBlob, path.basename(localPath));

            const response = await axios.post(url, formData, {
              headers: { Authorization: `Bearer ${accessToken}` },
              timeout: 30000,
            });
            console.log(`[FB Send Media Multipart] File sent to ${contactExternalId}, msgId:`, response.data?.message_id);
            return response.data?.message_id || null;
          } catch (multipartErr) {
            console.error(`[FB Send Media Multipart Error]`, multipartErr.response?.data || multipartErr.message);
            if (!fullMediaUrl || isLocalHostUrl(fullMediaUrl)) {
              throw multipartErr;
            }
          }
        } else if (!localPath && isLocalHostUrl(fullMediaUrl)) {
          throw new Error(`Cannot send media to Facebook/Instagram: Local media file not found on disk, and Meta cannot fetch localhost URLs (${mediaUrl})`);
        }

        payload.message = {
          attachment: {
            type: attachmentType,
            payload: { url: fullMediaUrl, is_reusable: true },
          },
        };
      } else if (listMenu && getListMenuSections(listMenu).some((s) => (s.rows || []).length > 0)) {
        // Messenger/Instagram have no native "list message" type — the closest
        // real equivalent is a Generic Template carousel, one element per list
        // row (title from the row, a single postback button carrying the row's
        // own routing id so a tap resolves exactly like a WhatsApp/Telegram list
        // tap does). There's also no native "section" grouping here, so every
        // section's rows are flattened into one run of elements — a named
        // section's title rides along in the element's subtitle instead of a
        // real group heading. flowEngine.js already caps each call here to 10
        // items (its own configured-list cap) and sends multiple lists as
        // separate calls, so the `.slice(0, 10)` here is defensive, matching
        // the `carousel` node type's own cap just above rather than a new limit.
        const flatRows = getListMenuSections(listMenu).flatMap((s) =>
          (s.rows || []).map((row) => ({ ...row, sectionTitle: s.title || "" }))
        );
        payload.message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: flatRows.slice(0, 10).map((item) => ({
                title: (item.title || "Option").slice(0, 80),
                subtitle: item.description ? item.description.slice(0, 80) : (item.sectionTitle || undefined),
                buttons: [
                  {
                    type: "postback",
                    title: (listMenu.buttonText || "Select").slice(0, 20),
                    payload: item.id || item.title || "select",
                  },
                ],
              })),
            },
          },
        };
      } else if (quickReplies && quickReplies.length > 0) {
        // Meta's own quick-reply docs (max 13 per message):
        //   content_type "text" — needs title (<=20 chars) + payload (our own
        //   routing token, <=1000 chars).
        //   content_type "user_phone_number"/"user_email" — "no additional
        //   fields required": Meta renders its own built-in chip and
        //   auto-fills it from the visitor's profile, so title/payload are
        //   deliberately left OUT below, not just empty — including them has
        //   been reported to make Meta reject the whole call.
        // Instagram's own quick-reply docs only list "text"/"user_phone_number"
        // (no "user_email" — IG profiles don't expose email this way), so an
        // email kind saved for an Instagram flow is downgraded to "text" here
        // rather than sent as a content_type IG doesn't support.
        payload.message = {
          text: body || "Select an option:",
          quick_replies: quickReplies.slice(0, 13).map((qr, index) => {
            const kind = (platform === "INSTAGRAM" && qr.kind === "user_email") ? "text" : (qr.kind || "text");
            if (kind === "user_phone_number" || kind === "user_email") {
              return { content_type: kind };
            }
            return {
              content_type: "text",
              title: (qr.title || `Option ${index + 1}`).slice(0, 20),
              payload: qr.payload || qr.title || `qr_${index}`,
            };
          }),
        };
      } else if (buttons && buttons.length > 0) {
        const formattedBtnText = ((headerText ? `${headerText}\n\n` : '') + (body || "Please select an option:") + (footerText ? `\n\n${footerText}` : '')).trim();
        if (platform === "FACEBOOK") {
          payload.message = {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: formattedBtnText.slice(0, 640),
                buttons: buttons.slice(0, 3).map((btn) => ({
                  type: btn.type === "URL" ? "web_url" : "postback",
                  title: (btn.title || "Button").slice(0, 20),
                  [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title || "btn",
                })),
              },
            },
          };
        } else {
          // Instagram Generic template fallback for buttons
          payload.message = {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: [
                  {
                    title: formattedBtnText.slice(0, 80),
                    buttons: buttons.slice(0, 3).map((btn) => ({
                      type: btn.type === "URL" ? "web_url" : "postback",
                      title: (btn.title || "Button").slice(0, 20),
                      [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title || "btn",
                    })),
                  },
                ],
              },
            },
          };
        }
      } else {
        const fullBody = ((headerText ? `${headerText}\n\n` : '') + (body || "") + (footerText ? `\n\n${footerText}` : '')).trim();
        payload.message = { text: fullBody };
      }

      try {
        const response = await axios.post(url, payload);
        console.log(`[FB Send] Message sent to ${contactExternalId}, msgId:`, response.data?.message_id);
        return response.data?.message_id || null;
      } catch (err) {
        const fbErr = err.response?.data?.error;
        const errMsg = String(fbErr?.message || err.message || "");
        // If Meta failed specifically on fetching an image_url, retry once without image_url so user at least gets the card/text
        if ((card || (carousel && carousel.length > 0)) && (errMsg.includes("image") || errMsg.includes("URL") || fbErr?.error_subcode === 2018001) && payload.message?.attachment?.payload?.elements) {
          console.warn(`[FB Send Retry] Retrying generic template without image_url due to Meta fetch error: ${errMsg}`);
          payload.message.attachment.payload.elements.forEach((el) => {
            delete el.image_url;
          });
          try {
            const retryRes = await axios.post(url, payload);
            console.log(`[FB Send Retry] Sent without image to ${contactExternalId}, msgId:`, retryRes.data?.message_id);
            return retryRes.data?.message_id || null;
          } catch (retryErr) {
            console.error(`[FB Send Retry Failed]:`, retryErr.response?.data || retryErr.message);
          }
        }
        console.error(`[FB Send Error] Failed to send message to ${contactExternalId}:`, err.response?.data || err.message);
        throw err;
      }
    }

    if (platform === "TELEGRAM") {
      let endpoint = "sendMessage";
      let payload = { chat_id: contactExternalId };
      const formattedTgText = ((headerText ? `*${headerText}*\n\n` : '') + (body || "") + (footerText ? `\n\n_${footerText}_` : '')).trim();

      if (type === "IMAGE" && fullMediaUrl) {
        endpoint = "sendPhoto";
        payload.photo = fullMediaUrl;
        payload.caption = formattedTgText || "";
      } else if (type === "DOCUMENT" && fullMediaUrl) {
        endpoint = "sendDocument";
        payload.document = fullMediaUrl;
        payload.caption = formattedTgText || "";
      } else {
        payload.text = formattedTgText || body || "";
      }

      if (buttons && buttons.length > 0) {
        payload.reply_markup = {
          inline_keyboard: buttons.map((btn, index) => {
            const btnTitle = typeof btn === "string" ? btn : (btn.title || btn.label || `Option ${index + 1}`);
            const btnPayload = typeof btn === "string" ? btn : (btn.payload || btn.id || `btn_${index}`);
            return [
              {
                text: btnTitle,
                callback_data: String(btnPayload).slice(0, 64),
              },
            ];
          }),
        };
      } else if (quickReplies && quickReplies.length > 0) {
        // Telegram's own KeyboardButton docs: `request_contact`/
        // `request_location` are additional flags on top of the button's
        // normal `text` label (never a replacement for it — unlike Meta's
        // phone/email kinds, Telegram still shows and needs a label), and are
        // mutually exclusive with each other on the same button. Only
        // available in private chats, same restriction Telegram itself
        // applies. Tapping sends the contact/location as Telegram's own
        // message type, not a text reply matching the label.
        payload.reply_markup = {
          keyboard: quickReplies.map((qr) => {
            const kind = typeof qr === "string" ? "text" : (qr.kind || "text");
            const text = typeof qr === "string" ? qr : (qr.title || qr.label || "Option");
            const button = { text };
            if (kind === "request_contact") button.request_contact = true;
            else if (kind === "request_location") button.request_location = true;
            return [button];
          }),
          one_time_keyboard: true,
          resize_keyboard: true,
        };
      } else if (listMenu) {
        // Telegram has no native "section" grouping either — every section's
        // rows are flattened into one run of inline-keyboard rows, in order,
        // same as the Messenger/Instagram branch above. `item.id` (not
        // `.payload`, which a list row never actually carries) is the row's
        // real routing token — using the wrong field here silently fell back
        // to a bare `item_N` string that never matches decodeButtonRoute, so
        // a tap could only ever resolve through the weaker typed-text-match
        // fallback rather than this engine's primary button-routing path.
        const flatRows = getListMenuSections(listMenu).flatMap((s) => s.rows || []);
        payload.reply_markup = {
          inline_keyboard: flatRows.map((item, index) => [
            {
              text: item.title,
              callback_data: String(item.id || `item_${index}`).slice(0, 64),
            },
          ]),
        };
      }

      // If local file exists, upload via multipart FormData
      const localPath = resolveLocalMediaPath(mediaUrl);
      if (localPath && fs.existsSync(localPath) && (upperType === "IMAGE" || upperType === "DOCUMENT")) {
        try {
          const formData = new FormData();
          formData.append("chat_id", contactExternalId);
          if (body) formData.append("caption", body);
          const mimeType = getMimeType(localPath, upperType);
          const fileBuffer = fs.readFileSync(localPath);
          const fileBlob = new Blob([fileBuffer], { type: mimeType });
          const fieldName = upperType === "DOCUMENT" ? "document" : "photo";
          formData.append(fieldName, fileBlob, path.basename(localPath));
          if (payload.reply_markup) {
            formData.append("reply_markup", JSON.stringify(payload.reply_markup));
          }
          const url = `https://api.telegram.org/bot${accessToken}/${endpoint}`;
          const response = await axios.post(url, formData, { timeout: 30000 });
          return response.data?.result?.message_id?.toString() || null;
        } catch (multiErr) {
          console.error("[Telegram Multipart Send Error]:", multiErr.response?.data || multiErr.message);
          if (!fullMediaUrl || isLocalHostUrl(fullMediaUrl)) {
            throw multiErr;
          }
        }
      } else if (!localPath && isLocalHostUrl(fullMediaUrl)) {
        throw new Error(`Cannot send media to Telegram: Local media file not found on disk, and Telegram cannot fetch localhost URLs (${mediaUrl})`);
      }

      try {
        const url = `https://api.telegram.org/bot${accessToken}/${endpoint}`;
        const response = await axios.post(url, payload);
        return response.data?.result?.message_id?.toString() || null;
      } catch (tgErr) {
        console.error("[Telegram API Error]:", tgErr.response?.data || tgErr.message);
        throw tgErr;
      }
    }

    if (platform === "TIKTOK") {
      if (accessToken) {
        try {
          const url = `https://business-api.tiktok.com/open_api/v1.3/im/message/send/`;
          const payload = {
            from_user_id: integration.tiktok_open_id,
            to_user_id: contactExternalId,
            msg_type: type === "IMAGE" ? "image" : "text",
            content: { text: body },
          };
          const response = await axios.post(url, payload, {
            headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' }
          });
          return response.data?.data?.message_id || `tt_out_${Date.now()}`;
        } catch (e) {
          console.warn("[TikTok outbound API notice]:", e.response?.data || e.message);
          return `tt_out_${Date.now()}`;
        }
      }
      return `tt_out_${Date.now()}`;
    }

    if (platform === "WEBCHAT") {
      return null;
    }
  } catch (err) {
    console.error(`Error sending message to ${platform}:`, err.response?.data || err.message);
    throw err;
  }
}

/**
 * Triggers each platform's own native "typing…" indicator right before a
 * flow node's real message goes out (the "Show typing before sending" node
 * setting — FlowBuilderPage.jsx). Best-effort: any failure here is caught by
 * the caller and never blocks the real send. WEBCHAT has no native typing
 * bubble in the current widget, so it's simply not handled here.
 *
 * @param {string} platform
 * @param {object} integration
 * @param {string} contactExternalId
 * @param {{ lastInboundExternalMsgId?: string|null }} [meta] - WhatsApp's
 *   typing indicator is anchored to a specific inbound message id (Meta has
 *   no "just type at this number" call) — pass the contact's most recent
 *   inbound message's external_msg_id; when there isn't one yet (e.g. a
 *   bot-initiated Sequence message with no prior inbound message), WhatsApp
 *   is silently skipped since there's nothing to anchor it to.
 */
export async function sendTypingIndicator(platform, integration, contactExternalId, meta = {}) {
  const accessToken = integration?.access_token;
  if (!accessToken || !contactExternalId) return;

  try {
    if (platform === "WHATSAPP") {
      if (!meta.lastInboundExternalMsgId) return;
      const phoneNumberId = integration.wa_phone_number_id;
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          status: "read",
          message_id: meta.lastInboundExternalMsgId,
          typing_indicator: { type: "text" },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
      );
    } else if (platform === "FACEBOOK" || platform === "INSTAGRAM") {
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/me/messages?access_token=${accessToken}`,
        { recipient: { id: contactExternalId }, sender_action: "typing_on" }
      );
    } else if (platform === "TELEGRAM") {
      await axios.post(`https://api.telegram.org/bot${accessToken}/sendChatAction`, {
        chat_id: contactExternalId,
        action: "typing",
      });
    }
    // WEBCHAT / TIKTOK: no native typing action available — no-op.
  } catch (err) {
    console.warn(`[Typing Indicator] ${platform} notice:`, err.response?.data || err.message);
  }
}
