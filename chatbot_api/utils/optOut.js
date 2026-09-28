import pool from "../db.js";
import { emitToAgency } from "./socket.js";

/**
 * Opt-out / opt-in keywords (per bot account, `subscription_keywords`).
 * A message that is exactly an opt-out word ("STOP", any case, surrounding
 * punctuation ignored) unsubscribes the subscriber: no more broadcasts
 * (broadcastRunner audience) and every running sequence is stopped
 * (sequenceRunner also skips UNSUBSCRIBED). An opt-in word ("START")
 * subscribes them again. Runs even when a person is handling the chat and
 * even when the plan has expired (the status still changes; the reply just
 * can't be sent) — opting out must always work.
 */

export const DEFAULTS = {
  enabled: true,
  optOutKeywords: ["STOP", "UNSUBSCRIBE"],
  optOutReply: "You're unsubscribed and won't get more automated messages from us. Reply START to subscribe again.",
  optInKeywords: ["START", "SUBSCRIBE"],
  optInReply: "You're subscribed again. Reply STOP any time to unsubscribe.",
};

export const splitKeywords = (value) => String(value || "")
  .split(/[,\n]/)
  .map((k) => k.trim().toUpperCase())
  .filter(Boolean)
  .slice(0, 20);

export function rowToSettings(row) {
  if (!row) return { ...DEFAULTS };
  return {
    enabled: Boolean(row.enabled),
    optOutKeywords: splitKeywords(row.opt_out_keywords),
    optOutReply: row.opt_out_reply ?? DEFAULTS.optOutReply,
    optInKeywords: splitKeywords(row.opt_in_keywords),
    optInReply: row.opt_in_reply ?? DEFAULTS.optInReply,
  };
}

/** Pure: "OUT" | "IN" | null for an incoming text. */
export function classifyKeyword(settings, text) {
  if (!settings?.enabled) return null;
  const word = String(text || "").trim().replace(/^[\s"'.!¡¿?]+|[\s"'.!?]+$/g, "").toUpperCase();
  if (!word || word.length > 40) return null;
  if (settings.optOutKeywords.includes(word)) return "OUT";
  if (settings.optInKeywords.includes(word)) return "IN";
  return null;
}

/** Returns true when the message was an opt-out / opt-in keyword and has been handled. */
export async function handleOptKeywords({ agencyId, integration, conversation, contact, text }) {
  const [[row]] = await pool.query("SELECT * FROM subscription_keywords WHERE integration_id = ? AND agency_id = ?", [integration.id, agencyId]);
  const settings = rowToSettings(row);
  const kind = classifyKeyword(settings, text);
  if (!kind) return false;

  if (kind === "OUT") {
    await pool.query("UPDATE contacts SET subscription_status = 'UNSUBSCRIBED' WHERE id = ? AND agency_id = ?", [contact.id, agencyId]);
    const [stopped] = await pool.query(
      `UPDATE sequence_subscribers ss JOIN sequences s ON s.id = ss.sequence_id
          SET ss.status = 'STOPPED'
        WHERE ss.contact_id = ? AND s.agency_id = ? AND ss.status IN ('ACTIVE','PAUSED')`,
      [contact.id, agencyId]
    );
    console.log(`[Opt-out] Subscriber ${contact.id} unsubscribed by keyword (${stopped.affectedRows} sequence(s) stopped)`);
  } else {
    await pool.query("UPDATE contacts SET subscription_status = 'SUBSCRIBED' WHERE id = ? AND agency_id = ?", [contact.id, agencyId]);
    console.log(`[Opt-out] Subscriber ${contact.id} subscribed again by keyword`);
  }
  emitToAgency(agencyId, "contact_updated", { contactId: contact.id, subscriptionStatus: kind === "OUT" ? "UNSUBSCRIBED" : "SUBSCRIBED" });

  // The Unsubscribe / Resubscribe Quick Action's reply flow (with its opposite
  // button) is the confirmation when it's switched on; otherwise the text below.
  const { sendQuickActionReply } = await import("./quickActions.js");
  const sentFlow = await sendQuickActionReply({
    agencyId, platform: integration.platform, integration, conversation, contact,
    actionKey: kind === "OUT" ? "UNSUBSCRIBE" : "RESUBSCRIBE",
  }).catch((err) => { console.warn("[Opt-out] quick action reply:", err.message); return false; });
  if (sentFlow) return true;

  const reply = kind === "OUT" ? settings.optOutReply : settings.optInReply;
  if (reply && String(reply).trim()) {
    try {
      const { sendMsg } = await import("./flowEngine.js");
      await sendMsg(agencyId, conversation, reply, "TEXT", integration);
    } catch (err) {
      console.warn("[Opt-out] confirmation not sent:", err.message);
    }
  }
  return true;
}
