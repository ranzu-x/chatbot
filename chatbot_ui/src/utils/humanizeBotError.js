/** Turns a raw bot error into something a non-technical account owner can act
 * on. Bot errors are logged verbatim from the channel's API (mostly WhatsApp
 * Cloud API, which prefixes a numeric code — e.g. "[Code 131026] Message
 * undeliverable"), which is precise but meaningless to most people reading
 * the Error Log. Developer view still shows the raw text and payload; this is
 * only for the plain-language view.
 *
 * Returns { title, detail, action } — action is null when there's nothing the
 * owner can actually do. */

const BY_CODE = {
  // ── Delivery ──
  131026: {
    title: "This message couldn't be delivered",
    detail: "The number isn't on WhatsApp, can't receive messages right now, or has never accepted a message from you.",
    action: "Check the number is correct and active on WhatsApp.",
  },
  131047: {
    title: "Outside the 24-hour reply window",
    detail: "WhatsApp only allows free-form messages within 24 hours of the customer's last message. After that, only an approved template can be sent.",
    action: "Send an approved message template instead.",
  },
  131051: { title: "Unsupported message type", detail: "This channel doesn't accept the kind of message the bot tried to send.", action: null },
  131053: { title: "Media couldn't be uploaded", detail: "The image, video or file attached to this message was rejected — usually too large or an unsupported format.", action: "Try a smaller file, or a common format like JPG, PNG or MP4." },
  131008: { title: "A required field was missing", detail: "The message was built without something the channel requires.", action: "Open the flow and check every field on this step is filled in." },
  131009: { title: "A field had an invalid value", detail: "One of the values in this message wasn't accepted by the channel.", action: "Open the flow and review this step's fields." },

  // ── Rate & policy ──
  130429: { title: "Sending too fast", detail: "You hit the channel's rate limit, so this message was dropped.", action: "Spread broadcasts out, or reduce how many messages send at once." },
  131056: { title: "Too many messages to this person", detail: "You've sent this specific contact too many messages in a short window.", action: "Wait before messaging this contact again." },
  368: { title: "Temporarily blocked for policy reasons", detail: "The channel has temporarily restricted this account for a policy violation.", action: "Check the account's quality rating in Meta Business Manager." },
  131031: { title: "This account is restricted", detail: "The channel has locked or restricted the connected account, so nothing can be sent.", action: "Open Meta Business Manager and check for a restriction to appeal." },

  // ── Templates ──
  132000: { title: "Template mismatch", detail: "The template's placeholders didn't match the values provided.", action: "Open the template and check the number of variables matches." },
  132001: { title: "Template not found", detail: "The template this message uses doesn't exist on the channel, or the name/language doesn't match.", action: "Re-sync your templates, then pick the template again." },
  132005: { title: "Template text too long", detail: "One of the filled-in variables made the message longer than the channel allows.", action: "Shorten the values going into the template." },
  132007: { title: "Template format rejected", detail: "The channel rejected how this template was filled in.", action: "Open the template and review its variables." },
  132012: { title: "Template variables don't match", detail: "The number of values sent didn't match what the template expects.", action: "Open the template and line the variables up." },
  132015: { title: "Template is paused", detail: "The channel paused this template, usually because recipients marked it as spam.", action: "Use a different template until this one is reinstated." },
  132016: { title: "Template was disabled", detail: "The channel permanently disabled this template for quality reasons.", action: "Create a replacement template." },

  // ── Auth / connection ──
  190: { title: "The connection expired", detail: "The access token for this account is no longer valid, so nothing can be sent or received.", action: "Reconnect this account under Connect Account." },
  200: { title: "Missing permission", detail: "The connected app doesn't have permission to do this.", action: "Reconnect the account and accept all requested permissions." },
  10: { title: "Missing permission", detail: "The connected app doesn't have permission to do this.", action: "Reconnect the account and accept all requested permissions." },
  100: { title: "The channel rejected this request", detail: "Something in the message wasn't valid for this channel.", action: null },
  133010: { title: "Number not registered", detail: "This phone number hasn't finished registration with the channel.", action: "Finish registering the number under Connect Account." },
  133004: { title: "Channel temporarily unavailable", detail: "The channel's own servers were down when this message was sent.", action: "Usually resolves on its own — try again shortly." },
};

const BY_PATTERN = [
  { re: /no account chosen to send from/i, title: "No sending account selected", detail: "This sequence or broadcast has no connected account chosen, so there was nothing to send from.", action: "Open it and pick which account should send." },
  { re: /token|oauth|expired|session/i, title: "The connection expired", detail: "The access token for this account is no longer valid.", action: "Reconnect this account under Connect Account." },
  { re: /timeout|etimedout|econnreset|socket hang up/i, title: "The channel didn't respond", detail: "The request to the channel timed out.", action: "Usually temporary — no action needed unless it keeps happening." },
  { re: /rate.?limit|too many requests/i, title: "Sending too fast", detail: "You hit the channel's rate limit.", action: "Spread broadcasts out over a longer period." },
  { re: /permission|not authorized|forbidden/i, title: "Missing permission", detail: "The connected app wasn't allowed to perform this action.", action: "Reconnect the account and accept all permissions." },
  { re: /template/i, title: "Template problem", detail: "Something about the message template was rejected by the channel.", action: "Open the template and check it's approved and its variables match." },
  { re: /media|image|video|document|file/i, title: "Attachment problem", detail: "The file attached to this message couldn't be sent.", action: "Try a smaller file or a more common format." },
];

/** Pulls the numeric channel error code out of either the "[Code NNNN]"
 * prefix the logger writes, or the parsed error_details payload. */
function extractCode(errItem) {
  const m = /\[Code\s+(\d+)\]/i.exec(errItem.error_message || "");
  if (m) return Number(m[1]);
  try {
    const d = errItem.error_details ? JSON.parse(errItem.error_details) : null;
    if (d && typeof d.code === "number") return d.code;
  } catch {
    /* not JSON — fall through to pattern matching */
  }
  return null;
}

/** Strips the "[Code NNNN] " prefix and any duplicated trailing restatement
 * ("Message undeliverable — Message Undeliverable.") the logger appends. */
export function cleanRawMessage(message = "") {
  return message.replace(/^\[Code\s+\d+\]\s*/i, "").trim();
}

export function humanizeBotError(errItem) {
  const code = extractCode(errItem);
  if (code && BY_CODE[code]) return { ...BY_CODE[code], code };

  const raw = errItem.error_message || "";
  for (const p of BY_PATTERN) {
    if (p.re.test(raw)) return { title: p.title, detail: p.detail, action: p.action, code };
  }

  return {
    title: "Something went wrong sending this message",
    detail: cleanRawMessage(raw) || "No further detail was recorded.",
    action: null,
    code,
  };
}
