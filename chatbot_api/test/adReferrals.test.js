import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWhatsAppReferral, extractMetaReferral } from "../utils/adReferrals.js";

test("WhatsApp click-to-chat referral", () => {
  const r = extractWhatsAppReferral({ referral: { source_url: "https://fb.me/x", source_id: "120", source_type: "ad", headline: "Sale", body: "50% off", ctwa_clid: "ARA1" } });
  assert.deepEqual(r, { sourceType: "ad", sourceId: "120", sourceUrl: "https://fb.me/x", headline: "Sale", body: "50% off", ctwaClid: "ARA1" });
  assert.equal(extractWhatsAppReferral({ text: { body: "hi" } }), null);
});

test("Messenger / Instagram referral counts only when it comes from an ad", () => {
  const r = extractMetaReferral({ message: { referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "999", ads_context_data: { ad_title: "Promo", post_id: "1_2" } } } });
  assert.equal(r.sourceId, "999");
  assert.equal(r.headline, "Promo");
  assert.equal(extractMetaReferral({ postback: { referral: { source: "SHORTLINK", ref: "x" } } }), null);
});
