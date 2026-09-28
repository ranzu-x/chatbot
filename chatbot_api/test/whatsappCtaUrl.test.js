import test from "node:test";
import assert from "node:assert/strict";
import { validateCtaConfig, validateFinalCta, fillCtaUrl, buildCtaUrlInteractive, CTA_LIMITS } from "../utils/whatsappCtaUrl.js";

const good = { body: "Tap below to see your order.", buttonText: "View order", url: "https://shop.example.com/orders?id={{order_id}}" };

test("a normal element is valid", () => {
  assert.deepEqual(validateCtaConfig(good), []);
});

test("Meta's limits are enforced", () => {
  assert.ok(validateCtaConfig({ ...good, buttonText: "x".repeat(CTA_LIMITS.buttonText + 1) }).some((e) => e.includes("20")));
  assert.ok(validateCtaConfig({ ...good, body: "x".repeat(1025) }).some((e) => e.includes("1024")));
  assert.ok(validateCtaConfig({ ...good, headerType: "text", headerText: "x".repeat(61) }).some((e) => e.includes("60")));
  assert.ok(validateCtaConfig({ ...good, footerText: "x".repeat(61) }).some((e) => e.includes("60")));
  assert.ok(validateCtaConfig({ ...good, body: "" }).length);
  assert.ok(validateCtaConfig({ ...good, buttonText: "" }).length);
});

test("URLs must be absolute http(s), no spaces, variables only after the domain", () => {
  assert.ok(validateCtaConfig({ ...good, url: "shop.example.com" }).length);
  assert.ok(validateCtaConfig({ ...good, url: "javascript:alert(1)" }).length);
  assert.ok(validateCtaConfig({ ...good, url: "https://shop.example.com/a b" }).length);
  assert.ok(validateCtaConfig({ ...good, url: "https://{{domain}}/x" }).length);
  assert.ok(validateCtaConfig({ ...good, url: "https://localhost/x" }).length);
  assert.deepEqual(validateCtaConfig({ ...good, url: "https://shop.example.com/{{contact.name}}/x?y={{a}}" }), []);
});

test("variables in the button text are refused", () => {
  assert.ok(validateCtaConfig({ ...good, buttonText: "Hi {{contact.name}}" }).length);
});

test("variables are URL-encoded and never touch the domain", () => {
  const url = fillCtaUrl("https://shop.example.com/o?name={{contact.name}}&id={{id}}", (tok) => (tok.includes("name") ? "Ann & Bob" : "7/8"));
  assert.equal(url, "https://shop.example.com/o?name=Ann%20%26%20Bob&id=7%2F8");
});

test("media headers need a file or an https link", () => {
  assert.ok(validateCtaConfig({ ...good, headerType: "image" }).length);
  assert.ok(validateCtaConfig({ ...good, headerType: "image", headerMediaUrl: "http://x.com/a.png" }).length);
  assert.deepEqual(validateCtaConfig({ ...good, headerType: "image", headerMediaUrl: "/uploads/a.png" }), []);
});

test("the payload matches Meta's documented shape", () => {
  const i = buildCtaUrlInteractive({
    body: "Tap below", buttonText: "See Dates", url: "https://www.example.com?clickID=abc",
    headerType: "image", headerMediaUrl: "https://cdn.example.com/banner.png", footerText: "Dates subject to change.",
  });
  assert.deepEqual(i, {
    type: "cta_url",
    header: { type: "image", image: { link: "https://cdn.example.com/banner.png" } },
    body: { text: "Tap below" },
    action: { name: "cta_url", parameters: { display_text: "See Dates", url: "https://www.example.com?clickID=abc" } },
    footer: { text: "Dates subject to change." },
  });
  const plain = buildCtaUrlInteractive({ body: "B", buttonText: "Go", url: "https://example.com" });
  assert.equal(plain.header, undefined);
  assert.equal(plain.footer, undefined);
});

test("invalid final values throw instead of producing a payload", () => {
  assert.throws(() => buildCtaUrlInteractive({ body: "B", buttonText: "Go", url: "https://example.com/{{x}}" }), /INVALID|valid/);
  assert.throws(() => buildCtaUrlInteractive({ body: "B", buttonText: "Go", url: "https://example.com", headerType: "image", headerMediaUrl: "/uploads/a.png" }));
  assert.ok(validateFinalCta({ body: "B", buttonText: "Go", url: "https://example.com/{{left}}" }).length);
});
