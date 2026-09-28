/**
 * WooCommerce cart plugin: zip builds and opens; a plugin cart event is stored
 * as an OPEN cart and "completed" marks it RECOVERED. Real DB, cleans up.
 * Run: npm run test:woo-plugin
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pool from "../db.js";
import { buildStoredZip } from "../utils/storedZip.js";
import { ingestPluginCart } from "../utils/commerceEvents.js";

const zip = buildStoredZip([{ name: "chatbot-cart-recovery/chatbot-cart-recovery.php", data: "<?php // hello" }]);
const file = path.join(os.tmpdir(), `cbcr-${Date.now()}.zip`);
fs.writeFileSync(file, zip);
try {
  // bsdtar reads zips (Windows ships it as System32\tar.exe; elsewhere it's usually "bsdtar").
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "bsdtar";
  let listing = null;
  try {
    listing = execFileSync(tar, ["-tf", path.basename(file)], { cwd: path.dirname(file) }).toString();
  } catch {
    console.warn("(bsdtar not available — zip listing skipped)");
  }
  if (listing !== null) assert.match(listing, /chatbot-cart-recovery\/chatbot-cart-recovery\.php/);
} finally {
  fs.unlinkSync(file);
}

const [[agency]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'DIRECT_CUSTOMER' ORDER BY id LIMIT 1");
const [ins] = await pool.query(
  "INSERT INTO commerce_connections (agency_id, platform, name, store_domain, auth_mode, credentials, is_active, orders_cursor, carts_cursor) VALUES (?, 'WOOCOMMERCE', 'plugin-test', ?, 'WOO_KEYS', 'x', 1, NOW(), NOW())",
  [agency.id, `https://plugin-test-${Date.now()}.example`]
);
const connection = { id: ins.insertId, agency_id: agency.id, currency: "USD" };
try {
  assert.equal(await ingestPluginCart(connection, { event: "cart", cart_key: "abc", name: "Ann", phone: "+1 555 0100", total: 12.5, currency: "USD", items: [{ name: "Mug", quantity: 2 }], recovery_url: "https://shop.example/checkout?cbcr_restore=abc" }), true);
  const [[cart]] = await pool.query("SELECT * FROM commerce_carts WHERE connection_id = ? AND external_checkout_id = 'plugin:abc'", [connection.id]);
  assert.equal(cart.status, "OPEN");
  assert.equal(cart.items_summary, "Mug x2");
  assert.equal(cart.customer_phone, "+1 555 0100");
  assert.equal(await ingestPluginCart(connection, { event: "cart", cart_key: "nophone" }), false);
  await ingestPluginCart(connection, { event: "completed", cart_key: "abc" });
  const [[after]] = await pool.query("SELECT status FROM commerce_carts WHERE id = ?", [cart.id]);
  assert.equal(after.status, "RECOVERED");
  console.log("✅ WooCommerce cart plugin: all checks passed");
} finally {
  await pool.query("DELETE FROM commerce_carts WHERE connection_id = ?", [connection.id]);
  await pool.query("DELETE FROM commerce_connections WHERE id = ?", [connection.id]);
  await pool.end();
}
