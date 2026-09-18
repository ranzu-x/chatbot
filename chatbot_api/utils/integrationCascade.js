import { deleteContactCascade } from "../routes/contacts.js";

/** Deletes everything that belongs to one integration (a single connected
 * WhatsApp/Facebook/Instagram/Telegram/TikTok/Webchat account) before the
 * integrations row itself is removed. Tables with ON DELETE SET NULL
 * (flows, bots, whatsapp_templates) would otherwise survive as orphans
 * instead of being removed; tables with no FK at all (comment automation
 * rules, sequences, broadcast campaigns, social posts, webchat widgets,
 * assorted logs) would otherwise dangle forever. Already-CASCADE tables
 * (conversations' messages, ai_reply_settings, ai_reply_active_agents,
 * team_member_integration_access, telegram_bots, whatsapp_flow_refs) are
 * deliberately left to the DB. `labels` is untouched by design — it has no
 * integration_id column and is agency-scoped only (universal, per product
 * decision). Must run inside an already-open transaction on `conn`. */
export async function deleteIntegrationCascade(conn, integrationId, agencyId) {
  await conn.query("DELETE FROM flows WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM bots WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM whatsapp_templates WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);

  await conn.query("DELETE FROM comment_automation_rules WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM sequences WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM broadcast_campaigns WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM social_posts WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM webchat_widgets WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM ai_message_logs WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM bot_error_logs WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM whatsapp_call_permissions WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM whatsapp_calls WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM whatsapp_flow_encryption_keys WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  await conn.query("DELETE FROM whatsapp_flow_sessions WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);

  // Contacts have no integration_id of their own — the same phone number
  // can legitimately have conversations against a different, still-active
  // integration. Only delete a contact once it has zero conversations left
  // anywhere, not just because it touched this integration.
  const [candidates] = await conn.query(
    "SELECT DISTINCT contact_id FROM conversations WHERE integration_id = ? AND agency_id = ?",
    [integrationId, agencyId]
  );
  await conn.query("DELETE FROM conversations WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  if (candidates.length) {
    const ids = candidates.map((r) => r.contact_id);
    const [orphaned] = await conn.query(
      `SELECT c.id FROM contacts c WHERE c.agency_id = ? AND c.id IN (?)
       AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id)`,
      [agencyId, ids]
    );
    for (const row of orphaned) {
      await deleteContactCascade(conn, row.id, agencyId);
    }
  }
}
