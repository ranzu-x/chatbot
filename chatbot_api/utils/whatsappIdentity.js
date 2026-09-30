import pool from "../db.js";
import { emitToAgency } from "./socket.js";
import { syncContactTagsJson } from "../routes/labels.js";

/**
 * WhatsApp usernames / business-scoped user IDs (BSUID) — one subscriber per
 * person, whichever way WhatsApp identifies them.
 *
 * A WhatsApp subscriber's `contacts.external_id` stays their phone number
 * (digits only) whenever we know it — imports, broadcasts, store automation
 * and the Inbox all key on it. Only a person who has only ever reached us
 * with their phone hidden gets `external_id = <BSUID>` (`isBsuid`), and
 * platformSender sends to them with `recipient` instead of `to`.
 *
 * Every BSUID we see is kept in `contact_wa_identities` (a BSUID is per
 * business portfolio, so one person can have several). Matching order for an
 * inbound message: BSUID first, then phone. When they point at two different
 * subscribers (someone who first wrote with a hidden number, then showed up
 * with it), the two are merged into the phone subscriber (`mergeContacts`) —
 * conversations, messages, labels, fields, sequences and the rest move over.
 *
 * Meta's rules: the phone is included whenever the user has no username, the
 * business and the user talked in the last 30 days, or the user is in the
 * business's Contact Book. Otherwise only the BSUID arrives and nothing can
 * tell us who it is until the phone shows up (a later message, a
 * REQUEST_CONTACT_INFO share, a `user_id_update`) or someone merges by hand.
 */

const BSUID_RE = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/;

export function isBsuid(value) {
  return typeof value === "string" && BSUID_RE.test(value);
}

export function normalizeWhatsAppPhone(value) {
  let digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits || null;
}

// A name that is only an id (phone digits / BSUID / equal to the external id) — replaceable.
function isIdLikeName(name, externalId) {
  return !name || name === externalId || /^\+?\d+$/.test(name) || isBsuid(name);
}

async function findByIdentity(conn, agencyId, userIds) {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return null;
  const [[row]] = await conn.query(
    `SELECT c.* FROM contact_wa_identities i
     JOIN contacts c ON c.id = i.contact_id AND c.agency_id = i.agency_id
     WHERE i.agency_id = ? AND i.user_id IN (?) AND c.platform = 'WHATSAPP'
     ORDER BY i.kind = 'USER' DESC LIMIT 1`,
    [agencyId, ids]
  );
  return row || null;
}

async function findByPhone(conn, agencyId, phone) {
  if (!phone) return null;
  const [[row]] = await conn.query(
    `SELECT * FROM contacts
     WHERE agency_id = ? AND platform = 'WHATSAPP' AND (external_id = ? OR phone = ? OR phone = ?)
     ORDER BY external_id = ? DESC, id ASC LIMIT 1`,
    [agencyId, phone, phone, `+${phone}`, phone]
  );
  return row || null;
}

/** Records a BSUID (or parent BSUID) for a subscriber. Moves it if it pointed elsewhere. */
export async function attachWhatsAppIdentity(agencyId, contactId, { userId, parentUserId, username, integrationId } = {}, conn = pool) {
  const rows = [];
  if (userId) rows.push([userId, "USER"]);
  if (parentUserId) rows.push([parentUserId, "PARENT"]);
  for (const [id, kind] of rows) {
    await conn.query(
      `INSERT INTO contact_wa_identities (agency_id, contact_id, user_id, kind, integration_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE contact_id = VALUES(contact_id), integration_id = COALESCE(VALUES(integration_id), integration_id)`,
      [agencyId, contactId, id, kind, integrationId || null]
    );
  }
  if (username) {
    await conn.query("UPDATE contacts SET wa_username = ? WHERE id = ? AND agency_id = ?", [String(username).slice(0, 100), contactId, agencyId]);
  }
}

/**
 * Merges subscriber `mergedId` into `survivorId` (same workspace, same
 * platform) and deletes `mergedId`. Everything that points at a subscriber
 * moves to the survivor. Conversations on the same bot account that are both
 * still open become one (messages and sessions move into the survivor's).
 * Returns the survivor id.
 */
export async function mergeContacts({ agencyId, survivorId, mergedId, reason = "AUTO", mergedBy = null }) {
  if (!survivorId || !mergedId || Number(survivorId) === Number(mergedId)) return survivorId;
  const conn = await pool.getConnection();
  let merged;
  try {
    await conn.beginTransaction();
    const [pair] = await conn.query(
      "SELECT * FROM contacts WHERE agency_id = ? AND id IN (?, ?) FOR UPDATE",
      [agencyId, survivorId, mergedId]
    );
    const survivor = pair.find((c) => c.id === Number(survivorId));
    merged = pair.find((c) => c.id === Number(mergedId));
    if (!survivor || !merged) {
      const err = new Error("Subscriber not found");
      err.status = 404;
      throw err;
    }
    if (survivor.platform !== merged.platform) {
      const err = new Error("Only subscribers of the same channel can be merged");
      err.status = 400;
      throw err;
    }

    // ── Conversations ──
    const [survivorConvs] = await conn.query(
      "SELECT id, integration_id, status FROM conversations WHERE contact_id = ? AND agency_id = ?",
      [survivorId, agencyId]
    );
    const [mergedConvs] = await conn.query(
      "SELECT id, integration_id, status FROM conversations WHERE contact_id = ? AND agency_id = ?",
      [mergedId, agencyId]
    );
    const CONV_TABLES = [
      "messages", "flow_sessions", "ai_message_logs", "appointment_booking_sessions",
      "commerce_campaign_sends", "follow_ups", "user_input_flow_responses", "whatsapp_calls", "whatsapp_flow_sessions",
    ];
    for (const conv of mergedConvs) {
      const keep = conv.status !== "RESOLVED"
        && survivorConvs.find((s) => s.integration_id === conv.integration_id && s.status !== "RESOLVED");
      if (!keep) {
        await conn.query("UPDATE conversations SET contact_id = ? WHERE id = ?", [survivorId, conv.id]);
        continue;
      }
      // Two open threads with the same person on the same bot → one thread.
      // Only one running flow session may survive; the moved one is closed.
      await conn.query("UPDATE flow_sessions SET status = 'EXPIRED' WHERE conversation_id = ? AND status = 'ACTIVE'", [conv.id]);
      for (const table of CONV_TABLES) {
        await conn.query(`UPDATE ${table} SET conversation_id = ? WHERE conversation_id = ?`, [keep.id, conv.id]);
      }
      await conn.query(
        `UPDATE conversations k JOIN conversations d ON d.id = ?
         SET k.last_message_at = GREATEST(COALESCE(k.last_message_at, d.last_message_at), COALESCE(d.last_message_at, k.last_message_at)),
             k.last_inbound_at = GREATEST(COALESCE(k.last_inbound_at, d.last_inbound_at), COALESCE(d.last_inbound_at, k.last_inbound_at)),
             k.unread_count = k.unread_count + d.unread_count,
             k.is_important = k.is_important OR d.is_important
         WHERE k.id = ?`,
        [conv.id, keep.id]
      );
      await conn.query("DELETE FROM conversations WHERE id = ?", [conv.id]);
    }

    // ── Rows with a one-per-subscriber unique key ──
    // Custom fields: the survivor's value wins unless it is empty.
    await conn.query(
      `UPDATE contact_custom_field_values s
       JOIN contact_custom_field_values d ON d.field_id = s.field_id AND d.contact_id = ?
       SET s.value = d.value
       WHERE s.contact_id = ? AND (s.value IS NULL OR s.value = '') AND d.value IS NOT NULL AND d.value <> ''`,
      [mergedId, survivorId]
    );
    for (const table of ["contact_custom_field_values", "contact_labels", "contact_list_members", "contact_wa_identities", "crm_contact_links"]) {
      await conn.query(`UPDATE IGNORE ${table} SET contact_id = ? WHERE contact_id = ?`, [survivorId, mergedId]);
      await conn.query(`DELETE FROM ${table} WHERE contact_id = ?`, [mergedId]);
    }
    // Call permission: keep the most recent answer.
    const [perms] = await conn.query(
      "SELECT id, contact_id FROM whatsapp_call_permissions WHERE contact_id IN (?, ?) ORDER BY COALESCE(responded_at, requested_at, created_at) DESC",
      [survivorId, mergedId]
    );
    if (perms.length) {
      await conn.query("DELETE FROM whatsapp_call_permissions WHERE contact_id IN (?, ?) AND id <> ?", [survivorId, mergedId, perms[0].id]);
      await conn.query("UPDATE whatsapp_call_permissions SET contact_id = ? WHERE id = ?", [survivorId, perms[0].id]);
    }
    // No match reply frequency: keep the later send per bot × action, so the
    // merged person doesn't get the reply again early.
    await conn.query(
      `UPDATE quick_action_deliveries s
       JOIN quick_action_deliveries d ON d.integration_id = s.integration_id AND d.action_key = s.action_key AND d.contact_id = ?
       SET s.last_sent_at = GREATEST(s.last_sent_at, d.last_sent_at)
       WHERE s.contact_id = ?`,
      [mergedId, survivorId]
    );
    await conn.query("UPDATE IGNORE quick_action_deliveries SET contact_id = ? WHERE contact_id = ?", [survivorId, mergedId]);
    await conn.query("DELETE FROM quick_action_deliveries WHERE contact_id = ?", [mergedId]);
    // Sequences: never enrolled twice in one sequence.
    await conn.query(
      `DELETE d FROM sequence_subscribers d
       JOIN sequence_subscribers s ON s.sequence_id = d.sequence_id AND s.contact_id = ?
       WHERE d.contact_id = ?`,
      [survivorId, mergedId]
    );

    // ── Everything else simply moves ──
    for (const table of [
      "sequence_subscribers", "appointment_booking_sessions", "appointments", "bot_error_logs", "broadcast_logs",
      "campaign_logs", "commerce_campaign_sends", "commerce_orders", "contact_notes", "follow_ups",
      "http_api_campaign_logs", "user_input_flow_responses", "whatsapp_calls", "whatsapp_flow_sessions",
      "ad_referrals", "telegram_polls", "mm_subscriptions", "mm_logs",
    ]) {
      await conn.query(`UPDATE ${table} SET contact_id = ? WHERE contact_id = ?`, [survivorId, mergedId]);
    }
    // In-chat orders call their subscriber column subscriber_id.
    await conn.query("UPDATE chat_orders SET subscriber_id = ? WHERE subscriber_id = ?", [survivorId, mergedId]);

    // ── The subscriber's own fields ──
    let profile = {};
    try {
      const parse = (v) => (typeof v === "string" ? JSON.parse(v || "{}") : v || {});
      profile = { ...parse(merged.platform_profile), ...parse(survivor.platform_profile) };
    } catch { profile = {}; }
    const name = isIdLikeName(survivor.name, survivor.external_id) && !isIdLikeName(merged.name, merged.external_id) ? merged.name : survivor.name;
    await conn.query(
      `UPDATE contacts SET
         name = ?, phone = COALESCE(phone, ?), email = COALESCE(email, ?), avatar = COALESCE(avatar, ?),
         wa_username = COALESCE(?, wa_username), platform_profile = ?,
         subscription_status = IF(? = 'UNSUBSCRIBED', 'UNSUBSCRIBED', subscription_status),
         is_blocked = is_blocked OR ?, blocked_at = COALESCE(blocked_at, ?), blocked_reason = COALESCE(blocked_reason, ?),
         created_at = LEAST(created_at, ?)
       WHERE id = ?`,
      [
        name, merged.phone, merged.email, merged.avatar,
        merged.wa_username || null, JSON.stringify(profile),
        merged.subscription_status,
        merged.is_blocked ? 1 : 0, merged.blocked_at, merged.blocked_reason,
        merged.created_at, survivorId,
      ]
    );
    await conn.query("DELETE FROM contacts WHERE id = ? AND agency_id = ?", [mergedId, agencyId]);
    await conn.query(
      `INSERT INTO contact_merges (agency_id, survivor_id, merged_id, merged_external_id, merged_name, reason, merged_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, survivorId, mergedId, merged.external_id, merged.name, reason, mergedBy]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  await syncContactTagsJson(survivorId);
  console.log(`[WA Identity] Merged subscriber ${mergedId} (${merged.external_id}) into ${survivorId} — ${reason}`);
  emitToAgency(agencyId, "contact_merged", { survivorId: Number(survivorId), mergedId: Number(mergedId) });
  return survivorId;
}

/**
 * Gives a subscriber known only by BSUID their phone number: merges them into
 * the phone subscriber if one exists, otherwise the phone becomes their id.
 * Returns the subscriber row that now holds the phone.
 */
export async function linkPhoneToContact(agencyId, contact, phone, reason = "PHONE_LINKED") {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits || !contact) return contact;
  const phoneContact = await findByPhone(pool, agencyId, digits);
  if (phoneContact && phoneContact.id !== contact.id) {
    await mergeContacts({ agencyId, survivorId: phoneContact.id, mergedId: contact.id, reason });
    const [[row]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [phoneContact.id]);
    return row;
  }
  if (isBsuid(contact.external_id)) {
    await pool.query("UPDATE contacts SET external_id = ?, phone = COALESCE(phone, ?) WHERE id = ?", [digits, digits, contact.id]);
    emitToAgency(agencyId, "contact_updated", { contactId: contact.id });
  } else if (!contact.phone) {
    await pool.query("UPDATE contacts SET phone = ? WHERE id = ?", [digits, contact.id]);
  }
  const [[row]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [contact.id]);
  return row;
}

/**
 * Decides which subscriber an inbound WhatsApp event belongs to and returns
 * the `external_id` the rest of the pipeline should use. Merges duplicates
 * and records the BSUID / username on the way. A brand-new person has no row
 * yet: the returned id is their phone (or BSUID) and the caller creates them,
 * then calls `attachWhatsAppIdentity`.
 */
export async function resolveWhatsAppSender({ agencyId, integrationId, phone, userId, parentUserId, username }) {
  const digits = normalizeWhatsAppPhone(phone);
  const identity = { userId, parentUserId, username, integrationId };
  try {
    let byIdentity = await findByIdentity(pool, agencyId, [userId, parentUserId]);
    const byPhone = await findByPhone(pool, agencyId, digits);

    if (byIdentity && byPhone && byIdentity.id !== byPhone.id) {
      await mergeContacts({ agencyId, survivorId: byPhone.id, mergedId: byIdentity.id, reason: "SAME_WHATSAPP_USER" });
      byIdentity = null;
    }
    const contact = byPhone || byIdentity;
    if (!contact) return { externalId: digits || userId || parentUserId, contactId: null, identity };

    await attachWhatsAppIdentity(agencyId, contact.id, identity);
    if (digits && isBsuid(contact.external_id)) {
      const linked = await linkPhoneToContact(agencyId, contact, digits, "PHONE_REVEALED");
      return { externalId: linked.external_id, contactId: linked.id, identity };
    }
    return { externalId: contact.external_id, contactId: contact.id, identity };
  } catch (err) {
    console.error("[WA Identity] resolve failed:", err.message);
    return { externalId: digits || userId || parentUserId, contactId: null, identity };
  }
}

/** `user_id_update` webhook: the user's BSUID changed (they changed phone number). */
export async function handleUserIdUpdate(agencyId, integrationId, update) {
  const previous = update?.user_id?.previous;
  const current = update?.user_id?.current;
  if (!current) return;
  const contact = (previous && await findByIdentity(pool, agencyId, [previous])) || await findByPhone(pool, agencyId, normalizeWhatsAppPhone(update.wa_id));
  if (!contact) return;
  await attachWhatsAppIdentity(agencyId, contact.id, { userId: current, integrationId });
  if (isBsuid(contact.external_id) && contact.external_id === previous) {
    await pool.query("UPDATE contacts SET external_id = ? WHERE id = ?", [current, contact.id]).catch(() => {});
  }
  if (update.wa_id) await linkPhoneToContact(agencyId, contact, update.wa_id, "USER_ID_UPDATE");
}

/** Recipient fields for a WhatsApp send: `to` for a phone, `recipient` for a BSUID. */
export function waRecipient(externalId) {
  return isBsuid(externalId) ? { recipient: externalId } : { to: externalId };
}
