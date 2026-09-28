import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptSecret } from "../utils/cryptoVault.js";
import { verifyStoreWebhook, webhookBlocker } from "../utils/commerceWebhooks.js";

const sign = (body, secret) => crypto.createHmac("sha256", secret).update(body).digest("base64");

test("WooCommerce webhooks are accepted only with the store's own signature", () => {
  const body = Buffer.from('{"id":1}');
  const conn = { platform: "WOOCOMMERCE", webhook_secret: encryptSecret("s3cret") };
  assert.equal(verifyStoreWebhook(conn, { "x-wc-webhook-signature": sign(body, "s3cret") }, body), true);
  assert.equal(verifyStoreWebhook(conn, { "x-wc-webhook-signature": sign(body, "other") }, body), false);
  assert.equal(verifyStoreWebhook(conn, {}, body), false);
});

test("Shopify webhooks need a Dev Dashboard (client secret) connection", () => {
  const body = Buffer.from('{"id":1}');
  const creds = encryptSecret(JSON.stringify({ clientId: "id", clientSecret: "cs" }));
  const cc = { platform: "SHOPIFY", auth_mode: "CLIENT_CREDENTIALS", credentials: creds };
  assert.equal(verifyStoreWebhook(cc, { "x-shopify-hmac-sha256": sign(body, "cs") }, body), true);
  assert.equal(verifyStoreWebhook({ ...cc, auth_mode: "ACCESS_TOKEN" }, { "x-shopify-hmac-sha256": sign(body, "cs") }, body), false);
});

test("no public HTTPS backend → no webhooks, with a reason", () => {
  const prev = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "http://localhost:5000";
  assert.match(webhookBlocker({ platform: "WOOCOMMERCE" }), /public HTTPS/);
  process.env.BACKEND_URL = "https://api.example.com";
  assert.match(webhookBlocker({ platform: "SHOPIFY", auth_mode: "ACCESS_TOKEN" }), /Dev Dashboard/);
  assert.equal(webhookBlocker({ platform: "WOOCOMMERCE" }), null);
  process.env.BACKEND_URL = prev;
});
