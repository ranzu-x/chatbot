import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateAddress, assertPublicUrl, htmlToText, extractLinks, parseRobots, pageTitle } from "../utils/webCrawler.js";

test("private and metadata addresses are refused", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.5", "172.20.0.1", "::1", "::ffff:127.0.0.1", "fd00::1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  await assert.rejects(assertPublicUrl("http://127.0.0.1/admin"), /private/);
  await assert.rejects(assertPublicUrl("http://169.254.169.254/latest/meta-data"), /private/);
  await assert.rejects(assertPublicUrl("file:///etc/passwd"), /http/);
  await assert.rejects(assertPublicUrl("http://localhost:5000/"), /private/);
});

test("HTML keeps headings and paragraphs, drops scripts and site chrome", () => {
  const html = "<html><head><title>FAQ &amp; Help</title><script>evil()</script></head><body><nav>Menu Home</nav><h2>Shipping</h2><p>We ship <b>worldwide</b>.</p><ul><li>Fast</li><li>Cheap</li></ul><footer>© 2026</footer></body></html>";
  const text = htmlToText(html);
  assert.equal(text, "## Shipping\n\nWe ship worldwide.\n\n- Fast\n\n- Cheap");
  assert.equal(pageTitle(html), "FAQ & Help");
});

test("links and robots.txt", () => {
  assert.deepEqual(extractLinks('<a href="/a#x">A</a><a href="https://o.com/b">B</a><a href="mailto:x@y">m</a>', "https://s.com/page"), ["https://s.com/a", "https://o.com/b"]);
  assert.deepEqual(parseRobots("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /admin # private\nDisallow:\n"), ["/admin"]);
});
