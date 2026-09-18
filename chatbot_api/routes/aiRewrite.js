/**
 * Live Inbox composer → "AI Rewrite" — rewrites the agent's current draft in
 * a chosen style. Reuses the existing AI provider abstraction
 * (utils/aiProviders/registry.js's resolveCapability + adapter.generate())
 * exactly like utils/aiReplyEngine.js does — no new provider plumbing.
 * Gated by the same "does this agency have a configured AI provider" check
 * every other AI feature already uses (resolveCapability returning null).
 * The rewritten text is only ever returned to the caller to insert into the
 * composer — this endpoint never sends anything itself.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { resolveCapability } from "../utils/aiProviders/registry.js";
import { assertLimit } from "../utils/entitlements.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const STYLE_INSTRUCTIONS = {
  professional: "more professional and polished, suitable for a business customer support context",
  friendly: "warmer and more friendly in tone, while staying professional",
  concise: "more concise — say the same thing in fewer words",
  fix_grammar: "grammatically correct and well-punctuated, without changing its meaning or tone",
  expand: "more detailed and complete, adding helpful context without changing its core meaning",
  simplify: "simpler and easier to understand, using plain everyday language",
};

router.post("/ai/rewrite-message", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { text, style } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: "text is required" });
    const instruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.professional;

    await assertLimit(agencyId, "max_ai_tokens_per_month", 0, req.user?.id);

    const resolved = await resolveCapability(agencyId, "text_generation");
    if (!resolved) {
      return res.status(403).json({ success: false, message: "No AI provider is configured for this workspace yet. Connect one under Settings → AI Providers.", code: "AI_NOT_CONFIGURED" });
    }

    const messages = [
      { role: "system", content: "You rewrite draft chat messages for a customer support agent. Output ONLY the rewritten message text — no preamble, no quotes, no explanation." },
      { role: "user", content: `Rewrite the following message to be ${instruction}:\n\n${text.trim()}` },
    ];

    const result = await resolved.adapter.generate({ apiKey: resolved.apiKey, model: resolved.model, messages, maxTokens: 400 });
    const rewritten = (result?.text || "").trim();
    if (!rewritten) return res.status(502).json({ success: false, message: "AI provider returned an empty response" });

    return res.json({ success: true, text: rewritten, providerId: resolved.providerId });
  } catch (err) {
    console.error("POST /ai/rewrite-message error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

export default router;
