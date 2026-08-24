import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";

/**
 * Executes a broadcast campaign asynchronously
 */
export async function executeCampaign(campaignId) {
  try {
    // 1. Update status to PROCESSING
    await pool.query("UPDATE campaigns SET status = 'PROCESSING' WHERE id = ?", [campaignId]);

    const [campaigns] = await pool.query("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
    if (!campaigns.length) return;
    const campaign = campaigns[0];

    // 2. Fetch pending logs
    const [logs] = await pool.query(
      `SELECT cl.id as log_id, c.id as contact_id, c.external_id, c.name, c.phone, c.email, c.platform
       FROM campaign_logs cl
       JOIN contacts c ON c.id = cl.contact_id
       WHERE cl.campaign_id = ? AND cl.status = 'PENDING'`,
      [campaignId]
    );

    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;

    for (const item of logs) {
      try {
        // Find integration for agency and platform
        const [integrations] = await pool.query(
          "SELECT * FROM integrations WHERE agency_id = ? AND platform = ? AND is_active = 1 LIMIT 1",
          [campaign.agency_id, item.platform]
        );

        if (!integrations.length) {
          throw new Error(`No active integration found for ${item.platform}`);
        }

        // Format message body
        let textBody = campaign.message_body || "";
        textBody = textBody
          .replace(/\{\{name\}\}/gi, item.name || "Customer")
          .replace(/\{\{phone\}\}/gi, item.phone || "")
          .replace(/\{\{1\}\}/gi, item.name || "Customer")
          .replace(/\{\{2\}\}/gi, item.phone || "");

        await sendPlatformMessage(item.platform, integrations[0], item.external_id, {
          type: "TEXT",
          body: textBody,
        });

        // Update log to SENT
        await pool.query(
          "UPDATE campaign_logs SET status = 'SENT', sent_at = NOW() WHERE id = ?",
          [item.log_id]
        );
        sentCount++;
      } catch (sendErr) {
        console.error(`Campaign log ${item.log_id} failed:`, sendErr.message);
        await pool.query(
          "UPDATE campaign_logs SET status = 'FAILED', error_message = ? WHERE id = ?",
          [sendErr.message, item.log_id]
        );
        failedCount++;
      }

      // Update counters on campaign
      await pool.query(
        "UPDATE campaigns SET sent_count = ?, failed_count = ?, delivered_count = ? WHERE id = ?",
        [sentCount, failedCount, sentCount, campaignId]
      );

      // Brief delay for rate limiting (100ms per message)
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 3. Mark campaign COMPLETED
    await pool.query("UPDATE campaigns SET status = 'COMPLETED' WHERE id = ?", [campaignId]);
    console.log(`✅ Campaign #${campaignId} "${campaign.name}" completed! Sent: ${sentCount}, Failed: ${failedCount}`);
  } catch (err) {
    console.error(`❌ Campaign #${campaignId} execution error:`, err);
    await pool.query("UPDATE campaigns SET status = 'FAILED' WHERE id = ?", [campaignId]);
  }
}
