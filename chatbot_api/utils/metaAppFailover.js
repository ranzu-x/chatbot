import pool from "../db.js";
import { promoteSlot } from "../routes/metaapppool.js";

const FB_SUBSCRIBED_FIELDS = "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed,messaging_customer_information,message_template_status_update";
const IG_SUBSCRIBED_FIELDS = "messages,messaging_postbacks,messaging_optins,message_reactions,message_reads,standby,comments,feed";

/** Re-points every existing integration for one agency+platform_group at a
 * new pool row's app, via the same /subscribed_apps calls already proven in
 * routes/channels.js's connect flows. Only works when the new app lives
 * under the SAME Business Manager as the one that originally granted access
 * to these customers' assets — see the "business_manager_label" guidance in
 * the Settings UI. Never invents a new per-integration app_secret override;
 * only refreshes rows that already carry one (routes/webhook.js's
 * verifyMetaSignature also checks the pool's own resolved app_secret, so
 * rows without an override already pick up the new app automatically).
 *
 * IMPORTANT: /subscribed_apps subscribes the WABA/Page to whichever app the
 * access token used in the call itself belongs to — NOT to some app named
 * elsewhere in the request. So this must call it with poolRow's OWN
 * system_user_token (a token that actually belongs to the NEW app), never
 * with the integration's existing access_token (which belongs to whatever
 * app it was originally connected under, and would just re-confirm/leave
 * the subscription on the OLD app — this was a real bug here previously:
 * it used the integration's own token, so "failover" never actually moved
 * the Meta-side subscription, while still locally overwriting the stored
 * app_secret to the new app's — creating exactly the mismatch this comment
 * now prevents). Without a valid system_user_token on poolRow, the Meta-side
 * re-subscription cannot happen at all — skip it and let the caller know via
 * `failed`, rather than silently doing something that looks like it worked. */
export async function resubscribeIntegrationsToPool(agencyId, platformGroup, poolRow) {
  const result = { attempted: 0, succeeded: 0, failed: [] };
  const newAppToken = poolRow.system_user_token?.trim();

  if (platformGroup === "WHATSAPP") {
    const [rows] = await pool.query(
      "SELECT id, wa_business_acc_id, app_secret FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1",
      [agencyId]
    );
    for (const row of rows) {
      if (!row.wa_business_acc_id) continue;
      result.attempted++;
      if (!newAppToken) {
        result.failed.push({ integrationId: row.id, error: "No system_user_token on the new app — can't re-subscribe on Meta's side. Add one in Settings first." });
        continue;
      }
      try {
        const subRes = await fetch(`https://graph.facebook.com/v21.0/${row.wa_business_acc_id}/subscribed_apps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: newAppToken }),
        });
        const subData = await subRes.json();
        if (subData?.error) throw new Error(subData.error.message);
        if (row.app_secret) {
          await pool.query("UPDATE integrations SET app_secret = ? WHERE id = ?", [poolRow.app_secret, row.id]);
        }
        result.succeeded++;
      } catch (err) {
        result.failed.push({ integrationId: row.id, error: err.message });
      }
    }
  } else {
    const [rows] = await pool.query(
      "SELECT id, platform, fb_page_id, app_secret FROM integrations WHERE agency_id = ? AND platform IN ('FACEBOOK','INSTAGRAM') AND is_active = 1",
      [agencyId]
    );
    for (const row of rows) {
      if (!row.fb_page_id) continue;
      result.attempted++;
      if (!newAppToken) {
        result.failed.push({ integrationId: row.id, error: "No system_user_token on the new app — can't re-subscribe on Meta's side. Add one in Settings first." });
        continue;
      }
      try {
        const fields = row.platform === "INSTAGRAM" ? IG_SUBSCRIBED_FIELDS : FB_SUBSCRIBED_FIELDS;
        const subRes = await fetch(
          `https://graph.facebook.com/v21.0/${row.fb_page_id}/subscribed_apps?subscribed_fields=${fields}&access_token=${newAppToken}`,
          { method: "POST" }
        );
        const subData = await subRes.json();
        if (subData?.error) throw new Error(subData.error.message);
        if (row.app_secret) {
          await pool.query("UPDATE integrations SET app_secret = ? WHERE id = ?", [poolRow.app_secret, row.id]);
        }
        result.succeeded++;
      } catch (err) {
        result.failed.push({ integrationId: row.id, error: err.message });
      }
    }
  }

  return result;
}

/** Finds a healthy standby for agency+platformGroup and promotes it,
 * re-subscribing every existing integration to it. Scoped to "app disabled,
 * Business still healthy" — if no standby is configured, this logs and
 * aborts rather than leaving the dead ACTIVE row with nothing serving it. */
export async function failoverAgencyPlatformGroup(agencyId, platformGroup, { reason } = {}) {
  const [[activeRow]] = await pool.query(
    "SELECT * FROM meta_app_pool WHERE agency_id = ? AND platform_group = ? AND slot_role = 'ACTIVE'",
    [agencyId, platformGroup]
  );
  if (!activeRow) {
    console.warn(`[MetaAppFailover] No ACTIVE row for agency ${agencyId} / ${platformGroup} — nothing to fail over from`);
    return { failed: true, reason: "no_active_row" };
  }

  const [[standby]] = await pool.query(
    `SELECT * FROM meta_app_pool
     WHERE agency_id = ? AND platform_group = ? AND slot_role = 'STANDBY'
       AND is_configured = 1 AND is_active = 1 AND health_status != 'DISABLED'
     ORDER BY id ASC LIMIT 1`,
    [agencyId, platformGroup]
  );
  if (!standby) {
    console.warn(`[MetaAppFailover] Agency ${agencyId} / ${platformGroup} app is DISABLED (${reason || "unknown reason"}) but no healthy standby is configured — leaving as-is, needs manual attention.`);
    return { failed: true, reason: "no_standby_available" };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await promoteSlot(conn, agencyId, standby.id);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error(`[MetaAppFailover] Failed to promote standby ${standby.id} for agency ${agencyId} / ${platformGroup}:`, err.message);
    return { failed: true, reason: "promote_failed", error: err.message };
  } finally {
    conn.release();
  }

  const resubscribeResult = await resubscribeIntegrationsToPool(agencyId, platformGroup, standby);
  console.log(
    `[MetaAppFailover] agency ${agencyId} / ${platformGroup}: promoted standby pool id=${standby.id} ` +
    `(reason: ${reason || "unknown"}). Re-subscribed ${resubscribeResult.succeeded}/${resubscribeResult.attempted} integrations.` +
    (resubscribeResult.failed.length ? ` Failures: ${JSON.stringify(resubscribeResult.failed)}` : "")
  );

  return { failed: false, promotedSlotId: standby.id, resubscribeResult };
}
