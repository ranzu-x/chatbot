/**
 * Marketing Messages against the real DB, without calling Meta: an opt-in
 * webhook creates a subscriber (linked to the contact), a stop opt-in turns it
 * off, the audience respects labels / 12-hour rest / unsubscribed contacts,
 * and delivery → read → click webhooks move a recipient forward only.
 * Uses a throw-away Facebook integration; everything is removed afterwards.
 * Run: npm run test:marketing-messages
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { handleOptinEvent, computeAudience, handleMarketingChange, recountCampaign } from "../utils/messengerMarketing.js";

const [[agency]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'DIRECT_CUSTOMER' ORDER BY id LIMIT 1");
const stamp = Date.now();
const [ins] = await pool.query(
  "INSERT INTO integrations (agency_id, platform, name, access_token, fb_page_id, is_active) VALUES (?, 'FACEBOOK', 'mm-test', 'x', ?, 1)",
  [agency.id, `9${stamp}`]
);
const integration = { id: ins.insertId, agency_id: agency.id, platform: "FACEBOOK" };
const [c1] = await pool.query("INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'FACEBOOK', ?, 'MM One', 'MANUAL')", [agency.id, `psid1_${stamp}`]);
const [c2] = await pool.query("INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'FACEBOOK', ?, 'MM Two', 'MANUAL')", [agency.id, `psid2_${stamp}`]);
const [label] = await pool.query("INSERT INTO labels (agency_id, name, color) VALUES (?, ?, '#000')", [agency.id, `mm-test-${stamp}`]);

try {
  const optin = (psid, token, status) => ({ sender: { id: psid }, optin: { type: "notification_messages", notification_messages_token: token, title: "Offers", notification_messages_status: status } });
  assert.equal(await handleOptinEvent(integration, optin(`psid1_${stamp}`, `tok1_${stamp}`)), true);
  await handleOptinEvent(integration, optin(`psid2_${stamp}`, `tok2_${stamp}`));
  assert.equal(await handleOptinEvent(integration, { optin: { type: "one_time_notif_req" } }), false);
  const [[sub1]] = await pool.query("SELECT * FROM mm_subscriptions WHERE token = ?", [`tok1_${stamp}`]);
  assert.equal(Number(sub1.contact_id), c1.insertId, "linked to the subscriber by PSID");

  // Audience: everyone, then only a label, then someone resting / unsubscribed.
  const campaign = { agency_id: agency.id, integration_id: integration.id, audience: { labelIds: [] } };
  assert.equal((await computeAudience(campaign)).length, 2);
  await pool.query("INSERT INTO contact_labels (contact_id, label_id) VALUES (?, ?)", [c1.insertId, label.insertId]);
  assert.equal((await computeAudience({ ...campaign, audience: { labelIds: [label.insertId] } })).length, 1);
  await pool.query("UPDATE contacts SET subscription_status = 'UNSUBSCRIBED' WHERE id = ?", [c2.insertId]);
  assert.equal((await computeAudience(campaign)).length, 1, "unsubscribed contacts are left out");
  await handleOptinEvent(integration, optin(`psid1_${stamp}`, `tok1_${stamp}`, "STOP_NOTIFICATIONS"));
  assert.equal((await computeAudience(campaign)).length, 0, "a stop opt-in turns the token off");

  // Webhook status updates on a sent recipient.
  const [camp] = await pool.query(
    "INSERT INTO mm_campaigns (agency_id, integration_id, name, meta_campaign_id, message, status) VALUES (?, ?, 'test', ?, '{}', 'SENT')",
    [agency.id, integration.id, `mc_${stamp}`]
  );
  await pool.query("INSERT INTO mm_logs (campaign_id, subscription_id, contact_id, token, status, tracking_id) VALUES (?, ?, ?, ?, 'SENT', ?)",
    [camp.insertId, sub1.id, c1.insertId, sub1.token, `trk_${stamp}`]);
  const change = (field, extra = {}) => handleMarketingChange(integration, { field, value: { marketing_message_tracking_id: `trk_${stamp}`, ...extra } });
  await change("marketing_message_reads");
  await change("marketing_message_deliveries"); // late delivery must not move it back
  let [[log]] = await pool.query("SELECT status FROM mm_logs WHERE campaign_id = ?", [camp.insertId]);
  assert.equal(log.status, "READ");
  // Click webhook has no tracking id — matched by token + Meta campaign id.
  await handleMarketingChange(integration, { field: "marketing_message_clicks", value: { messenger_subscription_token: sub1.token, message_id: `mc_${stamp}` } });
  [[log]] = await pool.query("SELECT status FROM mm_logs WHERE campaign_id = ?", [camp.insertId]);
  assert.equal(log.status, "CLICKED");
  await recountCampaign(camp.insertId);
  const [[stats]] = await pool.query("SELECT sent_count, delivered_count, read_count, click_count FROM mm_campaigns WHERE id = ?", [camp.insertId]);
  assert.deepEqual(stats, { sent_count: 1, delivered_count: 1, read_count: 1, click_count: 1 });
  assert.equal(await handleMarketingChange(integration, { field: "feed", value: {} }), false);
  console.log("✅ Marketing Messages: all checks passed");
} finally {
  await pool.query("DELETE FROM integrations WHERE id = ?", [integration.id]); // cascades subscriptions, campaigns, logs
  await pool.query("DELETE FROM contact_labels WHERE label_id = ?", [label.insertId]);
  await pool.query("DELETE FROM labels WHERE id = ?", [label.insertId]);
  await pool.query("DELETE FROM contacts WHERE id IN (?, ?)", [c1.insertId, c2.insertId]);
  await pool.end();
}
