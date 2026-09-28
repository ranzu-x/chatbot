import axios from "axios";
import pool from "../db.js";
import { META_API_VERSION } from "./metaApi.js";

/**
 * Messenger / Instagram bot profile (Meta's Messenger Profile API,
 * /me/messenger_profile with the Page token; Instagram adds
 * platform=instagram — this app connects Instagram through its Facebook Page).
 *
 *   Get Started button (Messenger)  → payload MPA:GS
 *   Greeting text (Messenger)       → shown before the first message
 *   Ice breakers (both, max 4)      → payload MPA:IB:<i>
 *   Persistent menu (both)          → postback MPA:PM:<i>, or a web link
 *
 * Every button runs an action stored in `messenger_profiles`:
 * { type: "flow", flowId } (a flow of the SAME bot account — bot-scope rule),
 * { type: "text", text }, or for menu items { type: "url", url }.
 * routes/webhook.js hands MPA:* taps to `handleProfilePostback`.
 */

export const PAYLOAD_PREFIX = "MPA:";
export const LIMITS = {
  greeting: 160, iceBreakers: 4, question: 80, menuItems: 20, menuTitle: 30, text: 1000,
  // WhatsApp conversational automation / Telegram bot settings
  waCommands: 30, tgCommands: 100, command: 32, commandDescription: 256, tgDescription: 512, tgShortDescription: 120,
};

// WhatsApp rejects emoji in ice breakers and commands.
const EMOJI_RE = /\p{Extended_Pictographic}/u;

const err400 = (message) => { const e = new Error(message); e.status = 400; return e; };

function parseJson(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

export function rowToProfile(row) {
  return {
    getStartedEnabled: Boolean(row?.get_started_enabled),
    getStartedAction: parseJson(row?.get_started_action, null),
    greeting: row?.greeting || "",
    iceBreakers: parseJson(row?.ice_breakers, []),
    persistentMenu: parseJson(row?.persistent_menu, []),
    composerInputDisabled: Boolean(row?.composer_input_disabled),
    commands: parseJson(row?.commands, []),
    description: row?.description || "",
    shortDescription: row?.short_description || "",
    lastSyncedAt: row?.last_synced_at || null,
    lastError: row?.last_error || null,
  };
}

/** Validates an action; flows must belong to this workspace AND this bot account. */
export async function cleanAction(action, { agencyId, integrationId, allowUrl = false, where }) {
  const type = action?.type;
  if (type === "flow") {
    const flowId = Number(action.flowId);
    const [[flow]] = await pool.query("SELECT id, integration_id FROM flows WHERE id = ? AND agency_id = ?", [flowId, agencyId]);
    if (!flow) throw err400(`${where}: pick a flow`);
    if (Number(flow.integration_id) !== Number(integrationId)) throw err400(`${where}: the flow must belong to this bot account`);
    return { type: "flow", flowId };
  }
  if (type === "text") {
    const text = String(action.text || "").trim();
    if (!text) throw err400(`${where}: write the reply`);
    return { type: "text", text: text.slice(0, LIMITS.text) };
  }
  if (type === "url" && allowUrl) {
    const url = String(action.url || "").trim();
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw err400(`${where}: the link must start with https://`);
    return { type: "url", url };
  }
  throw err400(`${where}: choose what happens when it's tapped`);
}

/** Request body → validated profile (throws 400 with a readable message). */
export async function cleanProfile(body, { agencyId, integrationId, platform }) {
  if (platform === "WHATSAPP" || platform === "TELEGRAM") return cleanChatAppProfile(body, { agencyId, integrationId, platform });
  const ctx = { agencyId, integrationId };
  const isInstagram = platform === "INSTAGRAM";
  const profile = {
    getStartedEnabled: !isInstagram && Boolean(body.getStartedEnabled),
    getStartedAction: null,
    greeting: isInstagram ? "" : String(body.greeting || "").trim(),
    iceBreakers: [],
    persistentMenu: [],
    composerInputDisabled: Boolean(body.composerInputDisabled),
  };
  if (profile.greeting.length > LIMITS.greeting) throw err400(`The greeting can be at most ${LIMITS.greeting} characters`);
  if (profile.getStartedEnabled) profile.getStartedAction = await cleanAction(body.getStartedAction, { ...ctx, where: "Get Started" });

  const ice = Array.isArray(body.iceBreakers) ? body.iceBreakers : [];
  if (ice.length > LIMITS.iceBreakers) throw err400(`At most ${LIMITS.iceBreakers} ice breakers`);
  for (const [i, ib] of ice.entries()) {
    const question = String(ib?.question || "").trim();
    if (!question) throw err400(`Ice breaker ${i + 1}: write the question`);
    if (question.length > LIMITS.question) throw err400(`Ice breaker ${i + 1}: at most ${LIMITS.question} characters`);
    profile.iceBreakers.push({ question, action: await cleanAction(ib.action, { ...ctx, where: `Ice breaker ${i + 1}` }) });
  }

  const menu = Array.isArray(body.persistentMenu) ? body.persistentMenu : [];
  if (menu.length > LIMITS.menuItems) throw err400(`At most ${LIMITS.menuItems} menu items`);
  for (const [i, item] of menu.entries()) {
    const title = String(item?.title || "").trim();
    if (!title) throw err400(`Menu item ${i + 1}: write the title`);
    if (title.length > LIMITS.menuTitle) throw err400(`Menu item ${i + 1}: at most ${LIMITS.menuTitle} characters`);
    profile.persistentMenu.push({ title, action: await cleanAction(item.action, { ...ctx, allowUrl: true, where: `Menu item ${i + 1}` }) });
  }
  if (profile.composerInputDisabled && !profile.persistentMenu.length) profile.composerInputDisabled = false;
  return profile;
}

/**
 * WhatsApp: ice breakers (≤4, 80 chars) + "/" commands (≤30), no emoji.
 * Telegram: /start action (Get Started), description, short description, commands (≤100).
 */
async function cleanChatAppProfile(body, { agencyId, integrationId, platform }) {
  const ctx = { agencyId, integrationId };
  const isWa = platform === "WHATSAPP";
  const profile = {
    getStartedEnabled: !isWa && Boolean(body.getStartedEnabled),
    getStartedAction: null,
    greeting: "",
    iceBreakers: [],
    persistentMenu: [],
    composerInputDisabled: false,
    commands: [],
    description: isWa ? "" : String(body.description || "").trim(),
    shortDescription: isWa ? "" : String(body.shortDescription || "").trim(),
  };
  if (profile.getStartedEnabled) profile.getStartedAction = await cleanAction(body.getStartedAction, { ...ctx, where: "/start" });
  if (profile.description.length > LIMITS.tgDescription) throw err400(`The description can be at most ${LIMITS.tgDescription} characters`);
  if (profile.shortDescription.length > LIMITS.tgShortDescription) throw err400(`The short description can be at most ${LIMITS.tgShortDescription} characters`);

  if (isWa) {
    const ice = Array.isArray(body.iceBreakers) ? body.iceBreakers : [];
    if (ice.length > LIMITS.iceBreakers) throw err400(`At most ${LIMITS.iceBreakers} ice breakers`);
    for (const [i, ib] of ice.entries()) {
      const question = String(ib?.question || "").trim();
      if (!question) throw err400(`Ice breaker ${i + 1}: write the question`);
      if (question.length > LIMITS.question) throw err400(`Ice breaker ${i + 1}: at most ${LIMITS.question} characters`);
      if (EMOJI_RE.test(question)) throw err400(`Ice breaker ${i + 1}: WhatsApp doesn't allow emoji here`);
      profile.iceBreakers.push({ question, action: await cleanAction(ib.action, { ...ctx, where: `Ice breaker ${i + 1}` }) });
    }
  }

  const maxCommands = isWa ? LIMITS.waCommands : LIMITS.tgCommands;
  const cmds = Array.isArray(body.commands) ? body.commands : [];
  if (cmds.length > maxCommands) throw err400(`At most ${maxCommands} commands`);
  const seen = new Set();
  for (const [i, c] of cmds.entries()) {
    const command = String(c?.command || "").trim().replace(/^\/+/, "").toLowerCase();
    const description = String(c?.description || "").trim();
    if (!/^[a-z0-9_]{1,32}$/.test(command)) throw err400(`Command ${i + 1}: 1–32 lowercase letters, numbers or _ (no spaces)`);
    if (seen.has(command)) throw err400(`Command /${command} is listed twice`);
    seen.add(command);
    if (!description) throw err400(`Command /${command}: write a short description`);
    if (description.length > LIMITS.commandDescription) throw err400(`Command /${command}: the description can be at most ${LIMITS.commandDescription} characters`);
    if (isWa && EMOJI_RE.test(description)) throw err400(`Command /${command}: WhatsApp doesn't allow emoji here`);
    profile.commands.push({ command, description, action: await cleanAction(c.action, { ...ctx, where: `Command /${command}` }) });
  }
  return profile;
}

/** What to POST to Meta and which fields to DELETE (anything switched off). */
export function buildMetaRequest(profile, platform) {
  const isInstagram = platform === "INSTAGRAM";
  const set = {};
  const del = [];

  // Messenger only shows a persistent menu once the Page has a Get Started button.
  const needsGetStarted = !isInstagram && (profile.getStartedEnabled || profile.persistentMenu.length > 0);
  if (!isInstagram) {
    if (needsGetStarted) set.get_started = { payload: `${PAYLOAD_PREFIX}GS` };
    else del.push("get_started");
    if (profile.greeting) set.greeting = [{ locale: "default", text: profile.greeting }];
    else del.push("greeting");
  }
  if (profile.iceBreakers.length) {
    set.ice_breakers = [{
      locale: "default",
      call_to_actions: profile.iceBreakers.map((ib, i) => ({ question: ib.question, payload: `${PAYLOAD_PREFIX}IB:${i}` })),
    }];
  } else {
    del.push("ice_breakers");
  }
  if (profile.persistentMenu.length) {
    set.persistent_menu = [{
      locale: "default",
      composer_input_disabled: Boolean(profile.composerInputDisabled),
      call_to_actions: profile.persistentMenu.map((item, i) => (item.action.type === "url"
        ? { type: "web_url", title: item.title, url: item.action.url, webview_height_ratio: "full" }
        : { type: "postback", title: item.title, payload: `${PAYLOAD_PREFIX}PM:${i}` })),
    }];
  } else {
    del.push("persistent_menu");
  }
  return { set, del };
}

function graphErrorMessage(e) {
  return e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;
}

/** Pushes the profile to Meta. Returns { ok, error }. */
export async function syncProfileToMeta(integration, profile) {
  const platform = String(integration.platform || "").toUpperCase();
  if (platform === "WHATSAPP") return syncWhatsApp(integration, profile);
  if (platform === "TELEGRAM") return syncTelegram(integration, profile);
  const token = integration.access_token;
  if (!token) return { ok: false, error: "This account has no Page access token — reconnect it" };
  const url = `https://graph.facebook.com/${META_API_VERSION}/me/messenger_profile`;
  const params = { access_token: token, ...(platform === "INSTAGRAM" ? { platform: "instagram" } : {}) };
  const { set, del } = buildMetaRequest(profile, platform);
  try {
    if (del.length) {
      await axios.delete(url, { params, data: { fields: del } }).catch((e) => {
        // Deleting a field that was never set is harmless.
        console.warn("[Messenger Profile] delete warning:", graphErrorMessage(e));
      });
    }
    if (Object.keys(set).length) {
      try {
        await axios.post(url, { ...set, ...(platform === "INSTAGRAM" ? { platform: "instagram" } : {}) }, { params });
      } catch (e) {
        // Older Pages still take the pre-locale ice breaker shape — retry once with it.
        if (!set.ice_breakers || platform === "INSTAGRAM") throw e;
        const legacy = { ...set, ice_breakers: set.ice_breakers[0].call_to_actions.map((c) => ({ question: c.question, payload: c.payload })) };
        await axios.post(url, legacy, { params });
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: graphErrorMessage(e) };
  }
}

/** WhatsApp conversational automation: POST /<PHONE_NUMBER_ID>/conversational_automation. */
async function syncWhatsApp(integration, profile) {
  if (!integration.access_token || !integration.wa_phone_number_id) return { ok: false, error: "This WhatsApp number isn't fully connected — reconnect it" };
  try {
    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${integration.wa_phone_number_id}/conversational_automation`,
      {
        prompts: profile.iceBreakers.map((ib) => ib.question),
        commands: profile.commands.map((c) => ({ command_name: c.command, command_description: c.description })),
      },
      { headers: { Authorization: `Bearer ${integration.access_token}` } }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: graphErrorMessage(e) };
  }
}

/** Telegram: setMyCommands / deleteMyCommands, setMyDescription, setMyShortDescription. */
async function syncTelegram(integration, profile) {
  const token = integration.access_token;
  if (!token) return { ok: false, error: "This Telegram bot has no token — reconnect it" };
  const call = (method, body) => axios.post(`https://api.telegram.org/bot${token}/${method}`, body).then((r) => {
    if (!r.data?.ok) throw new Error(r.data?.description || `${method} failed`);
  });
  try {
    if (profile.commands.length) {
      await call("setMyCommands", { commands: profile.commands.map((c) => ({ command: c.command, description: c.description })) });
    } else {
      await call("deleteMyCommands", {});
    }
    await call("setMyDescription", { description: profile.description || "" });
    await call("setMyShortDescription", { short_description: profile.shortDescription || "" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.response?.data?.description || e.message };
  }
}

/**
 * WhatsApp / Telegram: ice breakers and commands arrive as plain text.
 * Exact ice breaker question (any case) → its action; "/command …" → the
 * command's action; Telegram "/start" → the Get Started action.
 * Returns true when it matched and was answered.
 */
export async function handleTextTrigger({ agencyId, platform, integration, conversation, contact, text }) {
  if (platform !== "WHATSAPP" && platform !== "TELEGRAM") return false;
  const body = String(text || "").trim();
  if (!body) return false;
  const [[row]] = await pool.query("SELECT * FROM messenger_profiles WHERE integration_id = ? AND agency_id = ?", [integration.id, agencyId]);
  if (!row) return false;
  const action = matchTextTrigger(rowToProfile(row), platform, body);
  if (!action) return false;
  return runAction({ agencyId, platform, integration, conversation, contact, action });
}

/** Pure: the action an incoming WhatsApp / Telegram text triggers, or null. */
export function matchTextTrigger(profile, platform, text) {
  const body = String(text || "").trim();
  if (!body) return null;
  if (body.startsWith("/")) {
    const name = body.slice(1).split(/[\s@]/)[0].toLowerCase(); // Telegram groups send /cmd@botname
    if (platform === "TELEGRAM" && name === "start") return profile.getStartedEnabled ? profile.getStartedAction : null;
    return profile.commands.find((c) => c.command === name)?.action || null;
  }
  if (platform === "WHATSAPP") return profile.iceBreakers.find((ib) => ib.question.toLowerCase() === body.toLowerCase())?.action || null;
  return null;
}

export async function runAction({ agencyId, platform, integration, conversation, contact, action }) {
  if (action.type === "flow") {
    const [[flow]] = await pool.query(
      "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
      [action.flowId, agencyId, integration.id]
    );
    if (!flow) {
      console.warn(`[Bot Profile] flow #${action.flowId} is missing or inactive`);
      return false; // let normal flow matching have a go
    }
    await startFlowForConversation({ agencyId, flow, conversation, contact, integration, platform });
    return true;
  }
  if (action.type === "text") {
    const { sendMsg, replaceVariables } = await import("./flowEngine.js");
    await sendMsg(agencyId, conversation, replaceVariables(action.text, {}, contact), "TEXT", integration);
    return true;
  }
  return false;
}

/** Starts a flow from its start node for a conversation (same steps as POST /conversations/:id/trigger-flow). */
export async function startFlowForConversation({ agencyId, flow, conversation, contact, integration, platform }) {
  const nodes = parseJson(flow.nodes_json, []);
  const startNode = nodes.find((n) => n.type === "start") || nodes[0];
  if (!startNode) return false;
  await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND status = 'ACTIVE'", [conversation.id]);
  await pool.query(
    "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
    [agencyId, conversation.id, flow.id, startNode.id, JSON.stringify({})]
  );
  const { processFlow } = await import("./flowEngine.js");
  await processFlow(agencyId, platform, conversation, contact, "", integration);
  return true;
}

/**
 * A tap on a Get Started / ice breaker / menu button (payload MPA:*).
 * Returns true when it was one of ours and has been answered.
 */
export async function handleProfilePostback({ agencyId, platform, integration, conversation, contact, route }) {
  if (!route || !String(route).startsWith(PAYLOAD_PREFIX)) return false;
  const [kind, idx] = String(route).slice(PAYLOAD_PREFIX.length).split(":");
  const [[row]] = await pool.query("SELECT * FROM messenger_profiles WHERE integration_id = ? AND agency_id = ?", [integration.id, agencyId]);
  if (!row) return false;
  const profile = rowToProfile(row);
  let action = null;
  if (kind === "GS") action = profile.getStartedAction;
  else if (kind === "IB") action = profile.iceBreakers[Number(idx)]?.action;
  else if (kind === "PM") action = profile.persistentMenu[Number(idx)]?.action;
  if (!action) return kind === "GS" ? false : true; // a removed item: nothing to do, but don't let it trigger keyword flows

  if (action.type === "flow") {
    const [[flow]] = await pool.query(
      "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
      [action.flowId, agencyId, integration.id]
    );
    if (!flow) {
      console.warn(`[Messenger Profile] flow #${action.flowId} for ${route} is missing or inactive`);
      return true;
    }
    await startFlowForConversation({ agencyId, flow, conversation, contact, integration, platform });
    return true;
  }
  if (action.type === "text") {
    const { sendMsg, replaceVariables } = await import("./flowEngine.js");
    await sendMsg(agencyId, conversation, replaceVariables(action.text, {}, contact), "TEXT", integration);
    return true;
  }
  return true;
}

export function isProfilePayload(value) {
  return typeof value === "string" && value.startsWith(PAYLOAD_PREFIX);
}
