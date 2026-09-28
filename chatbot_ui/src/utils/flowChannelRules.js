/**
 * Channel limits for Flow Builder elements — what each messaging API accepts,
 * checked before a flow is saved (FlowBuilderPage.jsx validateNodeData). The
 * sender would otherwise cut text off silently or Meta would refuse the send.
 *
 * Sources: WhatsApp Cloud API (text 4096; interactive body 1024, header/footer
 * 60, reply button title 20 and unique, max 3; list header 60, button 20,
 * section/row title 24, row description 72; media caption 1024), Messenger
 * (text 2000, button template text 640, button/quick-reply title 20, 3 buttons,
 * 13 quick replies, generic template title/subtitle 80, 10 cards), Instagram
 * (text 1000, same quick replies / cards as Messenger), Telegram (text 4096,
 * caption 1024, poll question 300 / option 100). Webchat and TikTok have no
 * fixed limits here beyond "a button needs text".
 *
 * Lengths count characters (emoji = 1) of the text as typed, before
 * {{name}} / {{field.x}} are filled in.
 */

export const LIMITS = {
  WHATSAPP: { text: 4096, withButtons: 1024, caption: 1024, header: 60, footer: 60, button: 20, buttons: 3, quickReplies: 3, listHeader: 60, listButton: 20, sectionTitle: 24, rowTitle: 24, rowDescription: 72, option: 20 },
  FACEBOOK: { text: 2000, withButtons: 640, caption: 2000, button: 20, buttons: 3, quickReplies: 13, cardTitle: 80, cardSubtitle: 80, cards: 10, option: 20 },
  INSTAGRAM: { text: 1000, caption: 1000, button: 20, quickReplies: 13, cardTitle: 80, cardSubtitle: 80, cards: 10, option: 20 },
  TELEGRAM: { text: 4096, caption: 1024, pollQuestion: 300, pollOption: 100 },
  WEBCHAT: {},
  TIKTOK: {},
};

const CHANNEL_NAMES = { WHATSAPP: 'WhatsApp', FACEBOOK: 'Messenger', INSTAGRAM: 'Instagram', TELEGRAM: 'Telegram', WEBCHAT: 'Webchat', TIKTOK: 'TikTok' };

export const charCount = (s) => Array.from(String(s ?? '')).length;

const tooLong = (what, value, max, channel) => (max && charCount(value) > max
  ? `${what} is ${charCount(value)} characters — ${CHANNEL_NAMES[channel] || channel} allows ${max}`
  : null);

const btnTitle = (b) => (typeof b === 'string' ? b : (b?.title || '')).trim();
// Quick replies of a special kind (share phone / email / location) have no title of their own.
const isSpecialReply = (r) => r && typeof r === 'object' && r.kind && r.kind !== 'text';

/** Problems with a list of buttons / replies / items: empty, too long, duplicate. */
function optionsProblem(list, { what, max, unique, channel }) {
  const seen = new Map();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (isSpecialReply(b)) continue;
    const title = btnTitle(b);
    const name = `${what} ${i + 1}`;
    if (!title) return `${name} has no text`;
    const long = tooLong(`${name} ("${title.slice(0, 24)}")`, title, max, channel);
    if (long) return long;
    if (unique) {
      const key = title.toLowerCase();
      if (seen.has(key)) return `${what}s ${seen.get(key) + 1} and ${i + 1} have the same text — ${CHANNEL_NAMES[channel]} needs each to be different`;
      seen.set(key, i);
    }
  }
  return null;
}

const isLinkButton = (b) => typeof b === 'object' && b && (b.action === 'url' || b.type === 'URL');

/** WhatsApp sends a link button only as a single-button CTA message; mixed in with others it can't open anything. */
function whatsappLinkProblem(buttons) {
  if (buttons.length > 1 && buttons.some(isLinkButton)) {
    return 'WhatsApp can only send a website button on its own — with other buttons it cannot open a link. Keep it as the only button, or use a CTA URL Button element';
  }
  return null;
}

/**
 * First problem for an element on a channel, or null.
 * `extra.lists` = the list menu's normalised lists (listMenu only).
 */
export function channelLimitProblem(type, data = {}, platform, extra = {}) {
  const channel = String(platform || '').toUpperCase();
  const L = LIMITS[channel];
  if (!L) return null;
  const buttons = Array.isArray(data.buttons) ? data.buttons : [];
  const buttonRule = (what = 'Button') => optionsProblem(buttons, { what, max: L.button, unique: channel === 'WHATSAPP', channel });
  const countRule = (list, max, what) => (max && list.length > max ? `${CHANNEL_NAMES[channel]} allows at most ${max} ${what} — remove ${list.length - max}` : null);

  switch (type) {
    case 'text':
    case 'buttons': {
      const hasButtons = buttons.length > 0;
      const max = hasButtons && L.withButtons ? L.withButtons : L.text;
      return tooLong(hasButtons ? 'The message (with buttons)' : 'The message', data.message, max, channel)
        || countRule(buttons, L.buttons, 'buttons')
        || buttonRule()
        || (channel === 'WHATSAPP' ? whatsappLinkProblem(buttons) : null);
    }
    case 'image':
    case 'video': {
      const caption = data.caption || data.message || '';
      const max = buttons.length && L.withButtons ? L.withButtons : L.caption;
      return tooLong('The caption', caption, max, channel)
        || countRule(buttons, L.buttons, 'buttons')
        || buttonRule()
        || (channel === 'WHATSAPP' ? whatsappLinkProblem(buttons) : null);
    }
    case 'interactive':
      return tooLong('The body', data.message, L.withButtons || L.text, channel)
        || (data.headerType === 'text' ? tooLong('The header', data.headerText, L.header, channel) : null)
        || tooLong('The footer', data.footerText, L.footer, channel)
        || countRule(buttons, L.buttons, 'buttons')
        || buttonRule('Reply button')
        || (channel === 'WHATSAPP' ? whatsappLinkProblem(buttons) : null);
    case 'quickReplies': {
      const replies = Array.isArray(data.replies) ? data.replies : [];
      const max = channel === 'WHATSAPP' ? L.withButtons : L.text;
      return tooLong('The message', data.message, max, channel)
        || countRule(replies, L.quickReplies, 'quick replies')
        || optionsProblem(replies, { what: 'Quick reply', max: L.button, unique: channel === 'WHATSAPP', channel });
    }
    case 'listMenu': {
      if (channel !== 'WHATSAPP') return null;
      for (const [li, list] of (extra.lists || []).entries()) {
        const where = `List ${li + 1}`;
        const p = tooLong(`${where} title`, list.title, L.listHeader, channel)
          || tooLong(`${where} button text`, list.buttonText, L.listButton, channel)
          || (!String(list.buttonText || '').trim() ? `${where} needs button text (the button that opens the menu)` : null);
        if (p) return p;
        for (const [si, section] of (list.sections || []).entries()) {
          const sp = tooLong(`${where}, section ${si + 1} name`, section.title, L.sectionTitle, channel)
            || optionsProblem(section.items || [], { what: `${where} item`, max: L.rowTitle, unique: false, channel });
          if (sp) return sp;
          for (const item of section.items || []) {
            const dp = tooLong(`The description of "${btnTitle(item)}"`, item?.description, L.rowDescription, channel);
            if (dp) return dp;
          }
        }
      }
      return null;
    }
    case 'card':
      return tooLong('The card title', data.title, L.cardTitle, channel)
        || tooLong('The card subtitle', data.subtitle, L.cardSubtitle, channel)
        || countRule(buttons, L.buttons, 'buttons')
        || buttonRule();
    case 'carousel': {
      const cards = Array.isArray(data.cards) ? data.cards : [];
      const c = countRule(cards, L.cards, 'cards');
      if (c) return c;
      for (const [i, card] of cards.entries()) {
        const p = tooLong(`Card ${i + 1} title`, card.title, L.cardTitle, channel) || tooLong(`Card ${i + 1} subtitle`, card.subtitle, L.cardSubtitle, channel);
        if (p) return p;
      }
      return null;
    }
    case 'collectInput':
    case 'question': {
      const p = tooLong('The prompt message', data.message, L.text, channel);
      if (p) return p;
      if (type === 'question' && data.answerType === 'choice') {
        return optionsProblem((data.options || []).filter((o) => String(o || '').trim()), { what: 'Option', max: L.option, unique: channel === 'WHATSAPP', channel });
      }
      return tooLong('The closing message', data.finalMessage, L.text, channel);
    }
    case 'handoff':
    case 'end':
    case 'finalAnswer':
      return tooLong('The message', data.message, L.text, channel);
    case 'orderStatus':
      return tooLong('The order message', data.message, L.text, channel)
        || tooLong('The not-found message', data.notFoundMessage, L.text, channel);
    case 'telegramPoll':
      return tooLong('The poll question', data.question, L.pollQuestion, channel)
        || optionsProblem((data.options || []).filter((o) => String(o || '').trim()), { what: 'Option', max: L.pollOption, unique: true, channel });
    default:
      return null;
  }
}

/**
 * Options that do nothing when tapped: set to "Continue Flow (Next Step)" but
 * with no wire on the canvas. Returns [{ nodeId, itemId, message }].
 * Handles: <btn-i> buttons, <qr-i> quick replies, <item-n> list items; inside
 * a Send Message block they are prefixed with "<blockItemId>:".
 */
export function findDeadEndOptions(nodes, edges, { normalizeListMenuData }) {
  const wired = new Set((edges || []).map((e) => `${e.source}|${e.sourceHandle || ''}`));
  const out = [];
  const continues = (b) => typeof b === 'string' || !b?.action || b.action === 'flow';
  const check = (node, type, data, prefix, itemId) => {
    const label = data?.label || type;
    const miss = (handle, what) => {
      if (!wired.has(`${node.id}|${prefix}${handle}`)) {
        out.push({ nodeId: node.id, itemId, message: `${node.data?.label || label}: ${what} is set to continue the flow but isn't connected to a next step — connect it, or choose what it should do` });
      }
    };
    if (['text', 'buttons', 'interactive', 'image', 'video'].includes(type)) {
      (data?.buttons || []).forEach((b, i) => { if (continues(b)) miss(`btn-${i}`, `Button "${btnTitle(b) || i + 1}"`); });
    } else if (type === 'quickReplies') {
      (data?.replies || []).forEach((r, i) => { if (!isSpecialReply(r) && continues(r)) miss(`qr-${i}`, `Quick reply "${btnTitle(r) || i + 1}"`); });
    } else if (type === 'listMenu') {
      let gi = 0;
      for (const list of normalizeListMenuData(data || {})) {
        for (const item of list.items) {
          if (continues(item)) miss(`item-${gi}`, `List item "${btnTitle(item) || gi + 1}"`);
          gi += 1;
        }
      }
    }
  };
  for (const node of nodes || []) {
    if (node.type === 'messageBlock') {
      for (const item of node.data?.items || []) check(node, item.type, item.data, `${item.id}:`, item.id);
    } else {
      check(node, node.type, node.data, '', null);
    }
  }
  return out;
}
