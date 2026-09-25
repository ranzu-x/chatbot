import test from "node:test";
import assert from "node:assert/strict";
import { buildTemplateSend, missingTemplateParams } from "../utils/templateMessage.js";

const tpl = {
  template_name: "order_update",
  language: "en_US",
  header_type: "TEXT",
  header_text: "Hi {{1}}",
  body_text: "Your order {{1}} ships on {{2}}.",
  buttons_json: JSON.stringify([
    { type: "URL", text: "Track", url: "https://shop.example/track/{{1}}" },
    { type: "QUICK_REPLY", text: "Thanks" },
  ]),
};

test("missingTemplateParams lists every empty header / body / link parameter", () => {
  assert.deepEqual(missingTemplateParams(tpl, {}), ["header {{1}}", "body {{1}}", "body {{2}}", 'button "Track"']);
  assert.deepEqual(missingTemplateParams(tpl, { header: { 1: "x" }, body: { 1: "a", 2: " " }, buttons: { 0: "abc" } }), ["body {{2}}"]);
});

test("buildTemplateSend renders variables per subscriber into Meta's components", () => {
  const params = { header: { 1: "{{contact.name}}" }, body: { 1: "A-100", 2: "Monday" }, buttons: { 0: "A-100" } };
  const render = (t) => t.replace("{{contact.name}}", "Rina");
  const out = buildTemplateSend(tpl, params, render);
  const wt = out.extraFields.whatsappTemplate;
  assert.equal(wt.name, "order_update");
  assert.equal(wt.language, "en_US");
  assert.deepEqual(wt.components.find((c) => c.type === "header").parameters, [{ type: "text", text: "Rina" }]);
  assert.deepEqual(wt.components.find((c) => c.type === "body").parameters.map((p) => p.text), ["A-100", "Monday"]);
  assert.deepEqual(wt.components.find((c) => c.type === "button").parameters, [{ type: "text", text: "A-100" }]);
  assert.equal(out.bodyText, "Your order A-100 ships on Monday.");
});

test("a template with no parameters sends name + language only", () => {
  const out = buildTemplateSend({ template_name: "hello_world", language: "en_US", body_text: "Hello World", buttons_json: "[]" });
  assert.deepEqual(out.extraFields.whatsappTemplate.components, []);
  assert.equal(out.bodyText, "Hello World");
});

test("quick-reply buttons carry the flow's routing token for their own template index", () => {
  const out = buildTemplateSend(tpl, {}, (t) => t, { routeFor: (idx) => `FBTN:7:tpl_1:${idx}` });
  const qr = out.extraFields.whatsappTemplate.components.filter((c) => c.sub_type === "quick_reply");
  // "Thanks" is button index 1 (after the URL button), so its token ends in :1.
  assert.deepEqual(qr, [{ type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "FBTN:7:tpl_1:1" }] }]);
});

test("a media header uses the element's own file, else the template's stored sample", () => {
  const img = { template_name: "promo", language: "en", header_type: "IMAGE", header_media_url: "https://cdn.example/sample.jpg", body_text: "Sale", buttons_json: "[]" };
  const own = buildTemplateSend(img, { headerMedia: "/uploads/{{x}}.jpg" }, (t) => t.replace("{{x}}", "banner"));
  assert.deepEqual(own.extraFields.whatsappTemplate.components[0], { type: "header", parameters: [{ type: "image", image: { link: "/uploads/banner.jpg" } }] });
  const sample = buildTemplateSend(img, {});
  assert.equal(sample.extraFields.whatsappTemplate.components[0].parameters[0].image.link, "https://cdn.example/sample.jpg");
  // No file at all → reported as missing.
  assert.deepEqual(missingTemplateParams({ ...img, header_media_url: "4::aW1hZ2U=" }, {}), ["header image"]);
  assert.deepEqual(missingTemplateParams({ ...img, header_media_url: null }, { headerMedia: "https://x/y.png" }), []);
});

test("a carousel template renders cards with media headers and body placeholders into Meta's carousel component", () => {
  const carouselTpl = {
    template_name: "catalog_carousel",
    language: "en_US",
    template_type: "CAROUSEL",
    header_type: "NONE",
    body_text: "Browse our menu",
    buttons_json: "[]",
    carousel_cards_json: JSON.stringify([
      {
        components: [
          { type: "HEADER", format: "IMAGE" },
          { type: "BODY", text: "Item 1: {{1}}" },
          { type: "BUTTONS", buttons: [{ type: "URL", text: "Order", url: "https://shop.com/{{1}}" }] },
        ],
      },
      {
        components: [
          { type: "HEADER", format: "IMAGE" },
          { type: "BODY", text: "Item 2" },
        ],
      },
    ]),
  };

  assert.deepEqual(missingTemplateParams(carouselTpl, {}), [
    "card 1 header image",
    "card 1 body {{1}}",
    'card 1 button "Order"',
    "card 2 header image",
  ]);

  const send = buildTemplateSend(carouselTpl, {
    cards: [
      { headerMedia: "/uploads/dish1.jpg", body: { 1: "Pasta" }, buttons: { 0: "pasta" } },
      { headerMedia: "/uploads/dish2.jpg" },
    ],
  });

  const wt = send.extraFields.whatsappTemplate;
  assert.equal(wt.name, "catalog_carousel");
  const carouselComp = wt.components.find((c) => c.type === "carousel");
  assert.ok(carouselComp);
  assert.equal(carouselComp.cards.length, 2);
  assert.deepEqual(carouselComp.cards[0].components[0], {
    type: "header",
    parameters: [{ type: "image", image: { link: "/uploads/dish1.jpg" } }],
  });
  assert.deepEqual(carouselComp.cards[0].components[1], {
    type: "body",
    parameters: [{ type: "text", text: "Pasta" }],
  });
  assert.deepEqual(carouselComp.cards[0].components[2], {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: "pasta" }],
  });
  assert.deepEqual(carouselComp.cards[1].components[0], {
    type: "header",
    parameters: [{ type: "image", image: { link: "/uploads/dish2.jpg" } }],
  });
});

test("location header renders latitude, longitude, name, and address into Meta components", () => {
  const locTpl = {
    template_name: "store_location",
    language: "en_US",
    header_type: "LOCATION",
    body_text: "Visit our store at {{1}}",
    buttons_json: "[]",
  };

  assert.deepEqual(missingTemplateParams(locTpl, {}), [
    "header location coordinates",
    "body {{1}}",
  ]);

  const send = buildTemplateSend(locTpl, {
    location: {
      latitude: "37.483307",
      longitude: "-122.148331",
      name: "Downtown Store",
      address: "123 Main St",
    },
    body: { 1: "Main St Branch" },
  });

  const wt = send.extraFields.whatsappTemplate;
  assert.equal(wt.name, "store_location");
  assert.deepEqual(wt.components[0], {
    type: "header",
    parameters: [{
      type: "location",
      location: {
        latitude: "37.483307",
        longitude: "-122.148331",
        name: "Downtown Store",
        address: "123 Main St",
      },
    }],
  });
  assert.deepEqual(wt.components[1], {
    type: "body",
    parameters: [{ type: "text", text: "Main St Branch" }],
  });
});

test("document header preserves custom filename when provided", () => {
  const docTpl = {
    template_name: "monthly_statement",
    language: "en_US",
    header_type: "DOCUMENT",
    body_text: "Your monthly invoice is attached.",
    buttons_json: "[]",
  };

  const send = buildTemplateSend(docTpl, {
    headerMedia: "/uploads/doc123.pdf",
    documentFilename: "Statement_September.pdf",
  });

  const wt = send.extraFields.whatsappTemplate;
  assert.deepEqual(wt.components[0], {
    type: "header",
    parameters: [{
      type: "document",
      document: {
        link: "/uploads/doc123.pdf",
        filename: "Statement_September.pdf",
      },
    }],
  });
});

test("copy code button renders coupon_code parameter", () => {
  const promoTpl = {
    template_name: "summer_sale",
    language: "en_US",
    header_type: "NONE",
    body_text: "Use code below for 20% off!",
    buttons_json: JSON.stringify([
      { type: "COPY_CODE", text: "Copy Code" },
    ]),
  };

  assert.deepEqual(missingTemplateParams(promoTpl, {}), [
    'coupon code for "Copy Code"',
  ]);

  const send = buildTemplateSend(promoTpl, {
    buttons: { 0: "SUMMER20" },
  });

  const wt = send.extraFields.whatsappTemplate;
  assert.deepEqual(wt.components[0], {
    type: "button",
    sub_type: "copy_code",
    index: "0",
    parameters: [{ type: "coupon_code", coupon_code: "SUMMER20" }],
  });
});


