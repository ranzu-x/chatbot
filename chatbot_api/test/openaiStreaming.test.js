import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createOpenAICompatibleAdapter } from "../utils/aiProviders/openAICompatibleAdapter.js";

test("streams plain-text replies and reports the growing text", async () => {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      assert.equal(body.stream, true);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n');
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((r) => server.listen(0, r));
  const adapter = createOpenAICompatibleAdapter({ baseUrl: `http://127.0.0.1:${server.address().port}`, providerId: "fake", capabilities: ["text"] });
  const seen = [];
  const out = await adapter.generate({ apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }], onDelta: (t) => seen.push(t) });
  server.close();
  assert.equal(out.text, "Hello");
  assert.deepEqual(seen, ["Hel", "Hello"]);
  assert.equal(out.usage.outputTokens, 2);
});
