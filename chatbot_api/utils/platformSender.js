import axios from "axios";

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
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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

      if ((type === "IMAGE" || type === "DOCUMENT") && fullMediaUrl) {
        const attachmentType = type === "IMAGE" ? "image" : "file";
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
                title: item.title,
                subtitle: item.subtitle,
                image_url: item.imageUrl,
                buttons: item.buttons?.slice(0, 3).map((btn) => ({
                  type: btn.type === "URL" ? "web_url" : "postback",
                  title: btn.title,
                  [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title,
                })),
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
                  title: card.title,
                  subtitle: card.subtitle,
                  image_url: card.imageUrl,
                  buttons: card.buttons?.slice(0, 3).map((btn) => ({
                    type: btn.type === "URL" ? "web_url" : "postback",
                    title: btn.title,
                    [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title,
                  })),
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
            title: qr.title.slice(0, 20),
            payload: qr.payload || `qr_${index}`,
          })),
        };
      } else if (buttons && buttons.length > 0 && platform === "FACEBOOK") {
        payload.message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: body || "Please select an option:",
              buttons: buttons.slice(0, 3).map((btn) => ({
                type: btn.type === "URL" ? "web_url" : "postback",
                title: btn.title,
                [btn.type === "URL" ? "url" : "payload"]: btn.url || btn.payload || btn.title,
              })),
            },
          },
        };
      } else {
        payload.message = { text: body };
      }

      const response = await axios.post(url, payload);
      return response.data?.message_id || null;
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

    if (platform === "WEBCHAT") {
      return null;
    }
  } catch (err) {
    console.error(`Error sending message to ${platform}:`, err.response?.data || err.message);
    throw err;
  }
}
