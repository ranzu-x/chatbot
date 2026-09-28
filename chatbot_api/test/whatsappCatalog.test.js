import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductMessage, describeOrder, toCatalogItem } from "../utils/whatsappCatalog.js";

test("product messages", () => {
  assert.deepEqual(buildProductMessage({ kind: "product", catalogId: "C1", retailerIds: ["R1"], body: "Look" }), {
    type: "product", body: { text: "Look" }, action: { catalog_id: "C1", product_retailer_id: "R1" },
  });
  const list = buildProductMessage({ kind: "list", catalogId: "C1", retailerIds: ["a", "b"] });
  assert.equal(list.type, "product_list");
  assert.deepEqual(list.action.sections[0].product_items, [{ product_retailer_id: "a" }, { product_retailer_id: "b" }]);
  assert.throws(() => buildProductMessage({ kind: "list", catalogId: "C1", retailerIds: Array(31).fill("x") }), /At most 30/);
  assert.throws(() => buildProductMessage({ kind: "product", catalogId: null, retailerIds: ["x"] }), /No catalog/);
  assert.equal(buildProductMessage({ kind: "catalog", retailerIds: ["T"] }).action.parameters.thumbnail_product_retailer_id, "T");
});

test("order summary and catalog item", () => {
  const text = describeOrder({ product_items: [{ product_retailer_id: "shoe", quantity: 2, item_price: 10, currency: "USD" }], text: "fast please" });
  assert.match(text, /2 items, 20 USD/);
  assert.match(text, /Note: fast please/);
  const item = toCatalogItem({ external_product_id: "99", title: "Tee", price: "12.5", currency: "usd", product_url: "https://s/p", image_url: "https://s/i.jpg" }, 4);
  assert.equal(item.data.id, "4_99");
  assert.equal(item.data.price, "12.50 USD");
});
