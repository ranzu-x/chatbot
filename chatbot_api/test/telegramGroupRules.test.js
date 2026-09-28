import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanGroupSettings, parseGroupSettings, DEFAULT_SETTINGS, renderTemplate, stripHtml, findLinks, disallowedLinks,
  isForwarded, findBannedWord, parseDuration, describeMinutes, parseCommand, matchAutoReply, cleanPermissions,
  MUTED_PERMISSIONS, LIFTED_PERMISSIONS,
} from "../utils/telegramGroupRules.js";

test("settings: empty input gives the defaults, bad values are clamped / replaced", () => {
  assert.deepEqual(parseGroupSettings(null).welcome, DEFAULT_SETTINGS.welcome);
  const s = cleanGroupSettings({
    captcha: { enabled: 1, timeoutMinutes: 999, onFail: "nuke" },
    antiFlood: { messages: 1, seconds: "abc", action: "DELETE" },
    warnings: { limit: 0, action: "warn" },
    antiLink: { allowDomains: "https://www.Example.com/path, youtube.com  bad" },
    bannedWords: { words: "Spam\nSCAM, ,x".split("\n") },
    welcome: { buttons: [{ text: "Site", url: "https://a.com" }, { text: "Bad", url: "javascript:alert(1)" }, { text: "", url: "https://b.com" }] },
  });
  assert.equal(s.captcha.enabled, true);
  assert.equal(s.captcha.timeoutMinutes, 60);
  assert.equal(s.captcha.onFail, "KICK");
  assert.equal(s.antiFlood.messages, 3);
  assert.equal(s.antiFlood.seconds, 10);
  assert.equal(s.antiFlood.action, "MUTE"); // DELETE isn't a flood action
  assert.equal(s.warnings.limit, 1);
  assert.equal(s.warnings.action, "MUTE");
  assert.deepEqual(s.antiLink.allowDomains, ["example.com", "youtube.com"]);
  assert.deepEqual(s.bannedWords.words, ["spam", "scam", "x"]);
  assert.deepEqual(s.welcome.buttons, [{ text: "Site", url: "https://a.com" }]);
});

test("settings: a partial update keeps everything else", () => {
  const base = cleanGroupSettings({ rules: { text: "Be nice" }, autoReplies: [{ keyword: "Price", reply: "10$" }] });
  const next = cleanGroupSettings({ goodbye: { enabled: true } }, base);
  assert.equal(next.rules.text, "Be nice");
  assert.equal(next.goodbye.enabled, true);
  assert.deepEqual(next.autoReplies, [{ keyword: "price", reply: "10$", match: "contains" }]);
});

test("templates: escaped, variables filled, only safe tags allowed", () => {
  const user = { id: 42, first_name: "Ann <b>", username: "ann" };
  const html = renderTemplate("Hi {mention} in <b>{group_title}</b> <script>x</script> <a href=\"https://ok.com\">l</a> {unknown}", { user, group: { title: "A&B" } });
  assert.match(html, /<a href="tg:\/\/user\?id=42">Ann &lt;b&gt;<\/a>/);
  assert.match(html, /<b>A&amp;B<\/b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="https:\/\/ok\.com">l<\/a>/);
  assert.match(html, /\{unknown\}/);
  assert.equal(stripHtml("<b>a &amp; b</b>"), "a & b");
});

test("links: entities and plain text, allow-list includes sub-domains", () => {
  const msg = {
    text: "see www.spam.io and t.me/joinchat/abc or https://docs.example.com/x",
    entities: [{ type: "text_link", offset: 0, length: 3, url: "https://hidden.net" }],
  };
  const links = findLinks(msg);
  assert.ok(links.includes("https://hidden.net"));
  assert.ok(links.some((l) => l.startsWith("www.spam.io")));
  const bad = disallowedLinks(msg, ["example.com"]);
  assert.ok(!bad.some((l) => l.includes("docs.example.com")));
  assert.ok(bad.some((l) => l.includes("t.me")));
  assert.deepEqual(disallowedLinks({ text: "hello there" }), []);
});

test("forwards: automatic channel forwards don't count", () => {
  assert.equal(isForwarded({ forward_origin: { type: "user" } }), true);
  assert.equal(isForwarded({ forward_origin: { type: "channel" }, is_automatic_forward: true }), false);
  assert.equal(isForwarded({ text: "hi" }), false);
});

test("banned words: whole words for letters, substrings for symbols, unicode", () => {
  assert.equal(findBannedWord({ text: "This is SCAM!" }, ["scam"]), "scam");
  assert.equal(findBannedWord({ text: "scampi is food" }, ["scam"]), null);
  assert.equal(findBannedWord({ caption: "খারাপ কথা" }, ["খারাপ"]), "খারাপ");
  assert.equal(findBannedWord({ text: "buy $$$ now" }, ["$$$"]), "$$$");
});

test("durations and commands", () => {
  assert.equal(parseDuration("10m"), 10);
  assert.equal(parseDuration("2h"), 120);
  assert.equal(parseDuration("1d"), 1440);
  assert.equal(parseDuration("30"), 30);
  assert.equal(parseDuration("spam"), null);
  assert.equal(describeMinutes(120), "2 hours");
  assert.equal(describeMinutes(1), "1 minute");
  assert.deepEqual(parseCommand("/Mute@MyBot 2h flooding"), { command: "mute", botName: "mybot", args: ["2h", "flooding"], rest: "2h flooding" });
  assert.equal(parseCommand("hello /ban"), null);
});

test("auto replies and permissions", () => {
  const replies = [{ keyword: "price", reply: "10", match: "contains" }, { keyword: "hi", reply: "hello", match: "exact" }];
  assert.equal(matchAutoReply(replies, "What's the PRICE?").reply, "10");
  assert.equal(matchAutoReply(replies, "hi there"), null);
  assert.equal(matchAutoReply(replies, "Hi").reply, "hello");
  const perms = cleanPermissions({ can_send_messages: 1, bogus: true });
  assert.equal(perms.can_send_messages, true);
  assert.equal(perms.can_pin_messages, false);
  assert.equal("bogus" in perms, false);
  assert.ok(Object.values(MUTED_PERMISSIONS).every((v) => v === false));
  assert.ok(Object.values(LIFTED_PERMISSIONS).every((v) => v === true));
});
