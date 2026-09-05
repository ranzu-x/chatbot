import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

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
  } = messageData;
  const accessToken = integration.access_token;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
  const fullMediaUrl = mediaUrl && !mediaUrl.startsWith("http") ? `${backendUrl}${mediaUrl}` : mediaUrl;

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

      const hasButtons = Array.isArray(buttons) && buttons.length > 0;
      const isInteractive = upperType === "INTERACTIVE" || Boolean(headerType || footerText);

      if (hasButtons) {
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
              headerMediaId = await uploadLocalWhatsAppMedia(phoneNumberId, accessToken, localHeaderPath, mime);
            } catch (upErr) {
              console.warn(`[WhatsApp Header Upload Warning]`, upErr.response?.data || upErr.message);
            }
          }
          const fullHeaderMediaUrl = headerMedia && !headerMedia.startsWith("http") ? `${backendUrl}${headerMedia}` : headerMedia;

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
            mediaId = await uploadLocalWhatsAppMedia(phoneNumberId, accessToken, localPath, mimeType);
            console.log(`📤 [WhatsApp Upload] Got media ID: ${mediaId}`);
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
        // WhatsApp interactive list
        payload.type = "interactive";
        payload.interactive = {
          type: "list",
          body: { text: body || "Please select an option:" },
          action: {
            button: listMenu.buttonText || "Select",
            sections: [
              {
                title: listMenu.title || "Options",
                rows: listMenu.items.slice(0, 10).map((item, index) => ({
                  id: item.id || `item_${index}`,
                  title: item.title.slice(0, 24),
                  description: item.description ? item.description.slice(0, 72) : "",
                })),
              },
            ],
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

      if (upperType === "IMAGE" && buttons && buttons.length > 0) {
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
      } else if (carousel && carousel.length > 0) {
        payload.message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: carousel.slice(0, 10).map((item) => ({
                title: item.title || "Option",
                subtitle: item.subtitle || undefined,
                image_url: item.imageUrl || undefined,
                buttons: item.buttons && item.buttons.length > 0 ? item.buttons.slice(0, 3).map((btn) => ({
                  type: btn.type === "URL" ? "web_url" : "postback",
                  title: (btn.title || "Select").slice(0, 20),
                  [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title || "select",
                })) : undefined,
              })),
            },
          },
        };
      } else if (card) {
        payload.message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: [
                {
                  title: card.title || "Option",
                  subtitle: card.subtitle || undefined,
                  image_url: card.imageUrl || undefined,
                  buttons: card.buttons && card.buttons.length > 0 ? card.buttons.slice(0, 3).map((btn) => ({
                    type: btn.type === "URL" ? "web_url" : "postback",
                    title: (btn.title || "Select").slice(0, 20),
                    [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title || "select",
                  })) : undefined,
                },
              ],
            },
          },
        };
      } else if (quickReplies && quickReplies.length > 0) {
        payload.message = {
          text: body || "Select an option:",
          quick_replies: quickReplies.slice(0, 13).map((qr, index) => ({
            content_type: "text",
            title: (qr.title || `Option ${index + 1}`).slice(0, 20),
            payload: qr.payload || qr.title || `qr_${index}`,
          })),
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
        payload.reply_markup = {
          keyboard: quickReplies.map((qr) => [
            {
              text: typeof qr === "string" ? qr : (qr.title || qr.label || "Option"),
            },
          ]),
          one_time_keyboard: true,
          resize_keyboard: true,
        };
      } else if (listMenu) {
        payload.reply_markup = {
          inline_keyboard: listMenu.items.map((item, index) => [
            {
              text: item.title,
              callback_data: String(item.payload || `item_${index}`).slice(0, 64),
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
