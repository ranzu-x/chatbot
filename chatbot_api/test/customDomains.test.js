import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHostname, isApexDomain, registrableDomain, buildDnsRecords, statusFromCloudflare } from "../utils/customDomains.js";

test("domain input is cleaned to a bare hostname", () => {
  process.env.APP_ROOT_DOMAIN = "platform.test";
  process.env.FRONTEND_URL = "https://app.platform.test";
  assert.equal(normalizeHostname(" https://App.Brand.com/login?x=1 "), "app.brand.com");
  assert.equal(normalizeHostname("brand.co.uk."), "brand.co.uk");
  assert.equal(normalizeHostname(""), null);
  for (const bad of ["not a domain", "1.2.3.4", "*.brand.com", "brand", "-x.brand.com", "x.platform.test", "platform.test"]) {
    assert.throws(() => normalizeHostname(bad), (e) => e.status === 400, bad);
  }
});

test("root (apex) domains are recognised, incl. two-part suffixes", () => {
  assert.equal(isApexDomain("brand.com"), true);
  assert.equal(isApexDomain("app.brand.com"), false);
  assert.equal(isApexDomain("brand.co.uk"), true);
  assert.equal(registrableDomain("chat.brand.com.bd"), "brand.com.bd");
});

test("DNS records: CNAME to the target, plus Cloudflare's ownership / SSL TXT records", () => {
  process.env.CUSTOM_DOMAIN_CNAME_TARGET = "customers.platform.test";
  const cf = {
    ownership_verification: { type: "txt", name: "_cf-custom-hostname.app.brand.com", value: "uuid-1" },
    ssl: { validation_records: [{ txt_name: "_acme-challenge.app.brand.com", txt_value: "tok" }] },
  };
  const r = buildDnsRecords("app.brand.com", cf);
  assert.deepEqual(r.map((x) => [x.type, x.name, x.value, x.required]), [
    ["CNAME", "app", "customers.platform.test", true],
    ["TXT", "_cf-custom-hostname.app", "uuid-1", false],
    ["TXT", "_acme-challenge.app", "tok", false],
  ]);
  assert.equal(buildDnsRecords("brand.com")[0].name, "@");
});

test("Cloudflare status: live only when the hostname AND its certificate are active", () => {
  assert.equal(statusFromCloudflare({ status: "active", ssl: { status: "active" } }).status, "ACTIVE");
  assert.equal(statusFromCloudflare({ status: "active", ssl: { status: "pending_validation" } }).status, "PENDING");
  const pending = statusFromCloudflare({ status: "pending", ssl: { status: "pending_validation" }, verification_errors: ["custom hostname does not CNAME to this zone."] });
  assert.equal(pending.status, "PENDING");
  assert.match(pending.error, /CNAME/);
  assert.equal(statusFromCloudflare({ status: "blocked", ssl: {} }).status, "FAILED");
  assert.equal(statusFromCloudflare(null).status, "FAILED");
});
