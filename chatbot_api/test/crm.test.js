import { test } from "node:test";
import assert from "node:assert/strict";
import { personOf, cleanSettings, PROVIDERS } from "../utils/crm.js";

test("personOf: splits the name, adds + to a WhatsApp number, lower-cases email", () => {
  const p = personOf({ name: "Ada Lovelace King", email: "Ada@Example.COM", phone: "8801700000001", platform: "WHATSAPP" });
  assert.equal(p.firstName, "Ada");
  assert.equal(p.lastName, "Lovelace King");
  assert.equal(p.email, "ada@example.com");
  assert.equal(p.phone, "+8801700000001");
});

test("personOf: a one-word name becomes the last name (Salesforce / Zoho require one)", () => {
  const p = personOf({ name: "Kamrul", email: "k@example.com" });
  assert.equal(p.firstName, "");
  assert.equal(p.lastName, "Kamrul");
});

test("personOf: placeholder names are ignored; falls back to email, then phone", () => {
  assert.equal(personOf({ name: "Webchat Visitor", email: "sam@example.com" }).lastName, "sam");
  assert.equal(personOf({ name: "+880 1700 000001", phone: "8801700000001" }).lastName, "+8801700000001");
  assert.equal(personOf({ name: "" }).lastName, "Subscriber");
});

test("personOf: a WhatsApp subscriber without a phone column uses the number id, never a BSUID", () => {
  assert.equal(personOf({ platform: "WHATSAPP", external_id: "8801711111111" }).phone, "+8801711111111");
  assert.equal(personOf({ platform: "WHATSAPP", external_id: "US.1349000000" }).phone, "");
});

test("personOf: an invalid email is dropped", () => {
  assert.equal(personOf({ email: "not-an-email" }).email, "");
});

test("cleanSettings: defaults, object limited to the provider's list, mapping sanitised", () => {
  const s = cleanSettings("salesforce", {
    object: "Account",
    fieldMap: [
      { source: "contact.email", target: "Email" },
      { source: "field.order_id", target: "Order__c" },
      { source: "text:Chatbot", target: "LeadSource" },
      { source: "javascript:alert(1)", target: "Bad" },
      { source: "contact.name", target: "" },
    ],
  });
  assert.equal(s.autoSync, true);
  assert.equal(s.logChats, false);
  assert.equal(s.object, "Lead");
  assert.deepEqual(s.fieldMap.map((m) => m.target), ["Email", "Order__c", "LeadSource"]);
  assert.equal(cleanSettings("zoho", { object: "Contacts" }).object, "Contacts");
  assert.equal(cleanSettings("hubspot", { autoSync: false }).autoSync, false);
});

test("standard fields per CRM", () => {
  const p = personOf({ name: "Ada Lovelace", email: "ada@example.com", phone: "+15550001" });
  assert.deepEqual(PROVIDERS.hubspot.standard(p), { firstname: "Ada", lastname: "Lovelace", email: "ada@example.com", phone: "+15550001" });
  assert.equal(PROVIDERS.salesforce.standard(p, { object: "Lead" }).Company, "Ada Lovelace");
  assert.equal(PROVIDERS.salesforce.standard(p, { object: "Lead", company: "Acme" }).Company, "Acme");
  assert.equal("Company" in PROVIDERS.salesforce.standard(p, { object: "Contact" }), false);
  assert.equal(PROVIDERS.zoho.standard(p).Last_Name, "Lovelace");
});

test("Salesforce only accepts its own hosts (the address receives the app secret)", async () => {
  await assert.rejects(PROVIDERS.salesforce.clean({ instanceUrl: "https://evil.example.com", clientId: "a", clientSecret: "b" }));
  await assert.rejects(PROVIDERS.salesforce.clean({ instanceUrl: "http://acme.my.salesforce.com", clientId: "a", clientSecret: "b" }));
  const ok = await PROVIDERS.salesforce.clean({ instanceUrl: "acme.my.salesforce.com/", clientId: "a", clientSecret: "b" });
  assert.equal(ok.instanceUrl, "https://acme.my.salesforce.com");
});

test("Zoho needs a known data center; HubSpot needs a private app token", async () => {
  await assert.rejects(PROVIDERS.zoho.clean({ dataCenter: "evil.com", clientId: "a", clientSecret: "b", refreshToken: "c" }));
  assert.equal(PROVIDERS.zoho.apis({ dataCenter: "eu" }), "https://www.zohoapis.eu");
  assert.equal(PROVIDERS.zoho.accounts({ dataCenter: "ca" }), "https://accounts.zohocloud.ca");
  await assert.rejects(PROVIDERS.hubspot.clean({ accessToken: "abc" }));
});
