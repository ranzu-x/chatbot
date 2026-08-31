import axios from "axios";
import fs from "fs";
import path from "path";

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

/**
 * Send message to external platform APIs (WhatsApp, Facebook Messenger, Instagram, Telegram)
 */
export async function sendPlatformMessage(platform, integration, contactExternalId, messageData) {
  const { type = "TEXT", body = "", mediaUrl, buttons, quickReplies, listMenu, card, carousel } = messageData;
  const accessToken = integration.access_token;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
  const fullMediaUrl = mediaUrl && !mediaUrl.startsWith("http") ? `${backendUrl}${mediaUrl}` : mediaUrl;

  try {
    if (platform === "WHATSAPP") {
      const phoneNumberId = integration.wa_phone_number_id;
      const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
      let payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: contactExternalId,
      };

      if (type === "IMAGE" && fullMediaUrl) {
        payload.type = "image";
        payload.image = { link: fullMediaUrl, caption: body || undefined };
      } else if (type === "DOCUMENT" && fullMediaUrl) {
        payload.type = "document";
        payload.document = { link: fullMediaUrl, caption: body || undefined };
      } else if (buttons && buttons.length > 0) {
        // WhatsApp interactive buttons (Max 3)
        payload.type = "interactive";
        payload.interactive = {
          type: "button",
          body: { text: body || "Please select an option:" },
          action: {
            buttons: buttons.slice(0, 3).map((btn, index) => ({
              type: "reply",
              reply: {
                id: btn.id || `btn_${index}`,
                title: btn.title.slice(0, 20),
              },
            })),
          },
        };
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

      const upperType = (type || "").toUpperCase();

      if (fullMediaUrl && ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "FILE"].includes(upperType)) {
        let attachmentType = "image";
        if (upperType === "VIDEO") attachmentType = "video";
        else if (upperType === "AUDIO") attachmentType = "audio";
        else if (upperType === "DOCUMENT" || upperType === "FILE") attachmentType = "file";

        // Check if media is stored locally in uploads folder
        const localRelPath = mediaUrl ? mediaUrl.replace(/^[/\\]+/, "") : "";
        const localPath = localRelPath ? path.join(process.cwd(), localRelPath) : null;

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
            let mimeType = "image/png";
            if (attachmentType === "video") mimeType = "video/mp4";
            else if (attachmentType === "audio") mimeType = "audio/mpeg";
            else if (attachmentType === "file") mimeType = "application/pdf";
            const fileBuffer = fs.readFileSync(localPath);
            const fileBlob = new Blob([fileBuffer], { type: mimeType });
            formData.append("filedata", fileBlob, path.basename(localPath));

            const response = await axios.post(url, formData);
            console.log(`[FB Send Media Multipart] File sent to ${contactExternalId}, msgId:`, response.data?.message_id);
            return response.data?.message_id || null;
          } catch (multipartErr) {
            console.error(`[FB Send Media Multipart Error]`, multipartErr.response?.data || multipartErr.message);
          }
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
        if (platform === "FACEBOOK") {
          payload.message = {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: (body || "Please select an option:").slice(0, 640),
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
                    title: (body || "Please select an option:").slice(0, 80),
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
        payload.message = { text: body || "" };
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

      if (type === "IMAGE" && fullMediaUrl) {
        endpoint = "sendPhoto";
        payload.photo = fullMediaUrl;
        payload.caption = body || "";
      } else if (type === "DOCUMENT" && fullMediaUrl) {
        endpoint = "sendDocument";
        payload.document = fullMediaUrl;
        payload.caption = body || "";
      } else {
        payload.text = body || "";
      }

      if (buttons && buttons.length > 0) {
        payload.reply_markup = {
          inline_keyboard: [
            buttons.map((btn, index) => ({
              text: btn.title,
              callback_data: btn.payload || `btn_${index}`,
            })),
          ],
        };
      } else if (quickReplies && quickReplies.length > 0) {
        payload.reply_markup = {
          keyboard: [
            quickReplies.map((qr) => ({
              text: qr.title,
            })),
          ],
          one_time_keyboard: true,
          resize_keyboard: true,
        };
      } else if (listMenu) {
        payload.reply_markup = {
          inline_keyboard: listMenu.items.map((item, index) => [
            {
              text: item.title,
              callback_data: item.payload || `item_${index}`,
            },
          ]),
        };
      }

      const url = `https://api.telegram.org/bot${accessToken}/${endpoint}`;
      const response = await axios.post(url, payload);
      return response.data?.result?.message_id?.toString() || null;
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
