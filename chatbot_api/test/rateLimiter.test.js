import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { authLimiter } from "../middleware/rateLimiter.js";

/**
 * authLimiter is a real, already-configured singleton (10 requests / 10 min,
 * keyed by IP — see middleware/rateLimiter.js) exercised here exactly as
 * index.js mounts it, rather than re-declaring a throwaway limiter, so this
 * actually proves the object wired into production behaves as documented:
 * the Nth+1 request from the same client gets throttled, everything up to
 * and including the Nth doesn't. All requests below share one IP (127.0.0.1
 * via the loopback server), which is exactly the scenario a scripted
 * password-guessing run against /auth/login would look like.
 */
test("authLimiter allows the configured burst, then blocks the next request", async () => {
  const app = express();
  app.use(authLimiter);
  app.get("/probe", (req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/probe`;

  try {
    const limit = 10; // must match authLimiter's configured `limit`
    for (let i = 0; i < limit; i++) {
      const res = await fetch(url);
      assert.equal(res.status, 200, `request #${i + 1} should be allowed`);
    }
    const blocked = await fetch(url);
    assert.equal(blocked.status, 429, "the request past the burst limit should be rate-limited");
    const body = await blocked.json();
    assert.equal(body.success, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
