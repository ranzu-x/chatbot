/**
 * Pure helpers for Telegram group management (utils/telegramGroups.js):
 * the settings shape and its cleaning, message templates, and the checks a
 * group message is run through. No database, no network — see
 * test/telegramGroupRules.test.js.
 */

export const PENALTIES = ["DELETE", "WARN", "MUTE", "KICK", "BAN"];
const WARN_LIMIT_ACTIONS = ["MUTE", "KICK", "BAN"];
const CAPTCHA_FAIL_ACTIONS = ["KICK", "MUTE"];
const JOIN_MODES = ["MANUAL", "AUTO_APPROVE"];

export const DEFAULT_SETTINGS = {
  welcome: {
    enabled: true,
    text: "👋 Welcome {mention} to <b>{group_title}</b>!\nPlease read the rules with /rules and enjoy your stay.",
    deletePrevious: true,
    deleteAfterMinutes: 0,
    buttons: [],
  },
  goodbye: { enabled: false, text: "👋 {first_name} left the group." },
  cleanService: { joins: false, leaves: false },
  captcha: {
    enabled: false,
    timeoutMinutes: 5,
    text: "Hi {mention}! Please tap the button below within {minutes} minutes to show you're human — until then you can't post.",
    buttonText: "✅ I'm not a robot",
    onFail: "KICK",
  },
  joinRequests: { mode: "MANUAL", dmText: "" },
  rules: { text: "" },
  antiLink: { enabled: false, allowDomains: [], action: "WARN" },
  antiForward: { enabled: false, action: "DELETE" },
  bannedWords: { enabled: false, words: [], action: "WARN" },
  antiFlood: { enabled: false, messages: 6, seconds: 10, action: "MUTE", muteMinutes: 10 },
  blockBots: { enabled: false },
  blockChannelSenders: { enabled: false },
  warnings: { limit: 3, action: "MUTE", muteMinutes: 60 },
  notices: { enabled: true, deleteAfterSeconds: 60 },
  commands: { enabled: true },
  autoReplies: [],
};

const bool = (v, d) => (v === undefined || v === null ? d : Boolean(v));
const int = (v, d, min, max) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
};
const str = (v, d, max) => (v === undefined || v === null ? d : String(v).slice(0, max));
const oneOf = (v, list, d) => (list.includes(String(v || "").toUpperCase()) ? String(v).toUpperCase() : d);

function cleanUrlButtons(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((b) => ({ text: String(b?.text || "").trim().slice(0, 64), url: String(b?.url || "").trim().slice(0, 512) }))
    .filter((b) => b.text && /^(https?:\/\/|tg:\/\/)/i.test(b.url))
    .slice(0, 6);
}

export function cleanDomain(d) {
  return String(d || "").trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]
    .replace(/[^a-z0-9.-]/g, "");
}

/** Any partial / messy input → a complete, valid settings object. */
export function cleanGroupSettings(input = {}, base = DEFAULT_SETTINGS) {
  const i = input && typeof input === "object" ? input : {};
  const d = { ...DEFAULT_SETTINGS, ...(base || {}) };
  const pick = (key) => ({ ...DEFAULT_SETTINGS[key], ...(d[key] || {}), ...(i[key] && typeof i[key] === "object" ? i[key] : {}) });

  const welcome = pick("welcome");
  const goodbye = pick("goodbye");
  const cleanService = pick("cleanService");
  const captcha = pick("captcha");
  const joinRequests = pick("joinRequests");
  const rules = pick("rules");
  const antiLink = pick("antiLink");
  const antiForward = pick("antiForward");
  const bannedWords = pick("bannedWords");
  const antiFlood = pick("antiFlood");
  const warnings = pick("warnings");
  const notices = pick("notices");

  const splitList = (v, sep) => (Array.isArray(v) ? v : [v]).flatMap((x) => String(x ?? "").split(sep));
  const words = splitList(bannedWords.words, /[,\n]/)
    .map((w) => String(w).trim().toLowerCase()).filter((w) => w && w.length <= 64);
  const domains = splitList(antiLink.allowDomains, /[,\s]+/)
    .map(cleanDomain).filter((x) => x && x.includes("."));
  const autoReplies = (Array.isArray(i.autoReplies) ? i.autoReplies : (d.autoReplies || []))
    .map((r) => ({
      keyword: String(r?.keyword || "").trim().toLowerCase().slice(0, 64),
      reply: String(r?.reply || "").trim().slice(0, 2000),
      match: r?.match === "exact" ? "exact" : "contains",
    }))
    .filter((r) => r.keyword && r.reply)
    .slice(0, 50);

  return {
    welcome: {
      enabled: bool(welcome.enabled, true),
      text: str(welcome.text, DEFAULT_SETTINGS.welcome.text, 2000),
      deletePrevious: bool(welcome.deletePrevious, true),
      deleteAfterMinutes: int(welcome.deleteAfterMinutes, 0, 0, 1440),
      buttons: cleanUrlButtons(welcome.buttons),
    },
    goodbye: { enabled: bool(goodbye.enabled, false), text: str(goodbye.text, DEFAULT_SETTINGS.goodbye.text, 1000) },
    cleanService: { joins: bool(cleanService.joins, false), leaves: bool(cleanService.leaves, false) },
    captcha: {
      enabled: bool(captcha.enabled, false),
      timeoutMinutes: int(captcha.timeoutMinutes, 5, 1, 60),
      text: str(captcha.text, DEFAULT_SETTINGS.captcha.text, 1000),
      buttonText: str(captcha.buttonText, DEFAULT_SETTINGS.captcha.buttonText, 40).trim() || DEFAULT_SETTINGS.captcha.buttonText,
      onFail: oneOf(captcha.onFail, CAPTCHA_FAIL_ACTIONS, "KICK"),
    },
    joinRequests: { mode: oneOf(joinRequests.mode, JOIN_MODES, "MANUAL"), dmText: str(joinRequests.dmText, "", 1000) },
    rules: { text: str(rules.text, "", 3000) },
    antiLink: { enabled: bool(antiLink.enabled, false), allowDomains: [...new Set(domains)].slice(0, 50), action: oneOf(antiLink.action, PENALTIES, "WARN") },
    antiForward: { enabled: bool(antiForward.enabled, false), action: oneOf(antiForward.action, PENALTIES, "DELETE") },
    bannedWords: { enabled: bool(bannedWords.enabled, false), words: [...new Set(words)].slice(0, 200), action: oneOf(bannedWords.action, PENALTIES, "WARN") },
    antiFlood: {
      enabled: bool(antiFlood.enabled, false),
      messages: int(antiFlood.messages, 6, 3, 50),
      seconds: int(antiFlood.seconds, 10, 3, 120),
      action: oneOf(antiFlood.action, PENALTIES.filter((p) => p !== "DELETE"), "MUTE"),
      muteMinutes: int(antiFlood.muteMinutes, 10, 1, 10080),
    },
    blockBots: { enabled: bool(pick("blockBots").enabled, false) },
    blockChannelSenders: { enabled: bool(pick("blockChannelSenders").enabled, false) },
    warnings: {
      limit: int(warnings.limit, 3, 1, 20),
      action: oneOf(warnings.action, WARN_LIMIT_ACTIONS, "MUTE"),
      muteMinutes: int(warnings.muteMinutes, 60, 1, 525600),
    },
    notices: { enabled: bool(notices.enabled, true), deleteAfterSeconds: int(notices.deleteAfterSeconds, 60, 0, 3600) },
    commands: { enabled: bool(pick("commands").enabled, true) },
    autoReplies,
  };
}

/** Stored JSON (string / object / null) → settings. */
export function parseGroupSettings(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  return cleanGroupSettings(obj || {}, DEFAULT_SETTINGS);
}

/* ── Templates ────────────────────────────────────────────────────────── */

export const escapeHtml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.username || String(user?.id || "someone");
}

export function mentionHtml(user) {
  return `<a href="tg://user?id=${Number(user?.id) || 0}">${escapeHtml(fullName(user))}</a>`;
}

/**
 * A user-written template → Telegram HTML. Everything is escaped, then only
 * <b> <i> <u> <s> <code> <pre> <blockquote> and <a href="http(s)://…"> are let
 * back in; {variables} are filled in (names escaped, {mention} is a link).
 */
export function renderTemplate(template, { user = null, group = null, extra = {} } = {}) {
  let html = escapeHtml(template || "");
  html = html
    .replace(/&lt;(\/?)(b|i|u|s|code|pre|blockquote)&gt;/gi, "<$1$2>")
    .replace(/&lt;a href=&quot;(https?:\/\/[^\s&"]+)&quot;&gt;/gi, '<a href="$1">')
    .replace(/&lt;\/a&gt;/gi, "</a>");
  const vars = {
    first_name: escapeHtml(user?.first_name || fullName(user)),
    last_name: escapeHtml(user?.last_name || ""),
    full_name: escapeHtml(fullName(user)),
    username: user?.username ? `@${escapeHtml(user.username)}` : escapeHtml(fullName(user)),
    mention: user ? mentionHtml(user) : "",
    group_title: escapeHtml(group?.title || "the group"),
    member_count: group?.member_count != null ? String(group.member_count) : "",
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, escapeHtml(v)])),
  };
  return html.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

/** Telegram HTML → plain text (the fallback when Telegram can't parse our HTML). */
export function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/* ── Message checks ───────────────────────────────────────────────────── */

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>]+|(?:t\.me|telegram\.me|telegram\.dog)\/[^\s<>]+)/gi;

/** Every link in a message (entities + plain text), as lowercase hostnames or raw strings. */
export function findLinks(msg) {
  const text = msg?.text ?? msg?.caption ?? "";
  const entities = msg?.entities || msg?.caption_entities || [];
  const found = [];
  for (const e of entities) {
    if (e.type === "text_link" && e.url) found.push(e.url);
    if (e.type === "url") found.push(text.substr(e.offset, e.length));
  }
  for (const m of String(text).matchAll(URL_RE)) found.push(m[1]);
  return [...new Set(found)];
}

export function hostOf(link) {
  const s = String(link || "").trim().replace(/^[a-z]+:\/\//i, "");
  return s.split(/[/?#:]/)[0].toLowerCase().replace(/^www\./, "");
}

/** Links not on the allow-list (a sub-domain of an allowed domain is allowed). */
export function disallowedLinks(msg, allowDomains = []) {
  return findLinks(msg).filter((link) => {
    const host = hostOf(link);
    if (!host) return false;
    return !allowDomains.some((d) => host === d || host.endsWith(`.${d}`));
  });
}

export function isForwarded(msg) {
  if (!msg || msg.is_automatic_forward) return false;
  return Boolean(msg.forward_origin || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first banned word in a message, or null. Whole words for letters/digits, substring otherwise. */
export function findBannedWord(msg, words = []) {
  const text = String(msg?.text ?? msg?.caption ?? "").toLowerCase();
  if (!text) return null;
  for (const w of words) {
    const word = String(w || "").toLowerCase();
    if (!word) continue;
    const re = /^[\p{L}\p{N}_ ]+$/u.test(word)
      ? new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(word)}($|[^\\p{L}\\p{N}_])`, "iu")
      : new RegExp(escapeRe(word), "i");
    if (re.test(text)) return word;
  }
  return null;
}

/** "10m" / "2h" / "1d" / "30" (minutes) → minutes, or null. */
export function parseDuration(token) {
  const m = /^(\d{1,5})\s*([mhdw]?)$/i.exec(String(token || "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || "m").toLowerCase();
  const minutes = unit === "h" ? n * 60 : unit === "d" ? n * 1440 : unit === "w" ? n * 10080 : n;
  return minutes > 0 ? Math.min(minutes, 525600) : null;
}

export function describeMinutes(minutes) {
  const m = Number(minutes) || 0;
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** "/ban@MyBot 2h spam" → { command: "ban", botName: "mybot", args: ["2h", "spam"] }, or null. */
export function parseCommand(text) {
  const m = /^\/([a-z0-9_]{1,32})(?:@([a-z0-9_]{3,64}))?(?:\s+([\s\S]*))?$/i.exec(String(text || "").trim());
  if (!m) return null;
  return {
    command: m[1].toLowerCase(),
    botName: m[2] ? m[2].toLowerCase() : null,
    args: (m[3] || "").trim().split(/\s+/).filter(Boolean),
    rest: (m[3] || "").trim(),
  };
}

/** Auto-reply for a message text, or null. */
export function matchAutoReply(autoReplies = [], text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  return autoReplies.find((r) => (r.match === "exact" ? t === r.keyword : t.includes(r.keyword))) || null;
}

/** Permissions that lock a member out of posting (captcha / mute). */
export const MUTED_PERMISSIONS = {
  can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false,
  can_send_videos: false, can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false,
  can_send_other_messages: false, can_add_web_page_previews: false, can_react_to_messages: false,
  can_change_info: false, can_invite_users: false, can_pin_messages: false, can_manage_topics: false,
};

/** "Pass True for all permissions to lift restrictions from a user" (restrictChatMember). */
export const LIFTED_PERMISSIONS = Object.fromEntries(Object.keys(MUTED_PERMISSIONS).map((k) => [k, true]));

/** The group-wide default permissions the dashboard can edit (setChatPermissions). */
export const GROUP_PERMISSION_KEYS = [
  "can_send_messages", "can_send_photos", "can_send_videos", "can_send_audios", "can_send_documents",
  "can_send_voice_notes", "can_send_video_notes", "can_send_polls", "can_send_other_messages",
  "can_add_web_page_previews", "can_react_to_messages", "can_invite_users", "can_pin_messages",
  "can_change_info", "can_manage_topics",
];

export function cleanPermissions(input = {}) {
  return Object.fromEntries(GROUP_PERMISSION_KEYS.map((k) => [k, Boolean(input?.[k])]));
}
