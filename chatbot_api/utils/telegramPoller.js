import pool from "../db.js";
import { processTelegramUpdate } from "../routes/webhook.js";

const offsets = new Map();
let isRunning = false;
let pollTimer = null;

/**
 * Start the resilient background Telegram Poller
 * Seamlessly receives incoming Telegram messages, handles triggers, runs bot flows,
 * and feeds the Shared Inbox in real-time.
 */
export function startTelegramPoller() {
  if (isRunning) return;
  isRunning = true;

  console.log("🚀 [Telegram Poller] Background polling service started");
  runPollCycle();
}

export function stopTelegramPoller() {
  isRunning = false;
  if (pollTimer) clearTimeout(pollTimer);
  console.log("🛑 [Telegram Poller] Background polling service stopped");
}

async function runPollCycle() {
  if (!isRunning) return;

  try {
    // 1. Fetch active Telegram bots
    const [bots] = await pool.query(
      `SELECT tb.*, i.name as integration_name, i.is_active as integration_active
       FROM telegram_bots tb
       JOIN integrations i ON i.id = tb.integration_id
       WHERE tb.is_active = 1 AND i.is_active = 1`
    );

    const isPublicHttps = process.env.BACKEND_URL && process.env.BACKEND_URL.startsWith("https://");

    for (const bot of bots) {
      // If public HTTPS webhook is explicitly enabled and verified, let webhook handle it
      if (isPublicHttps && bot.webhook_set === 1) {
        continue;
      }

      const token = bot.bot_token;
      if (!token) continue;

      // Ensure no dangling/failed webhook blocks getUpdates
      if (!offsets.has(bot.id)) {
        offsets.set(bot.id, 0);
        try {
          // If webhook was set to localhost or failed, clear it so polling works
          const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
          const info = await infoRes.json();
          if (info.ok && info.result?.url) {
            console.log(`[Telegram Poller] Clearing invalid webhook (${info.result.url}) for @${bot.bot_username}`);
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
            await pool.query("UPDATE telegram_bots SET webhook_set = 0 WHERE id = ?", [bot.id]);
          }
        } catch (delErr) {
          console.warn("[Telegram Poller] deleteWebhook check:", delErr.message);
        }
      }

      const currentOffset = offsets.get(bot.id) || 0;

      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${currentOffset}&timeout=3&limit=20`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();

        if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
          console.log(`📥 [Telegram Poller] Received ${data.result.length} update(s) for @${bot.bot_username}`);

          for (const update of data.result) {
            try {
              await processTelegramUpdate(bot.agency_id, bot.integration_id, update);
            } catch (procErr) {
              console.error("[Telegram Poller Update Error]:", procErr);
            }
            // Advance offset
            const nextOffset = update.update_id + 1;
            if (nextOffset > (offsets.get(bot.id) || 0)) {
              offsets.set(bot.id, nextOffset);
            }
          }
        } else if (!data.ok && data.error_code === 409) {
          if (data.description?.toLowerCase().includes("webhook")) {
            console.warn(`[Telegram Poller] 409 Webhook Conflict for @${bot.bot_username}. Clearing webhook...`);
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
          } else {
            // Concurrent poll in flight, back off smoothly
            console.warn(`[Telegram Poller] Concurrent request notice for @${bot.bot_username}: ${data.description}`);
          }
        }
      } catch (fetchErr) {
        // Silent timeout or transient network hiccup
        if (fetchErr.name !== "TimeoutError" && !fetchErr.message?.includes("aborted")) {
          console.warn(`[Telegram Poller Fetch]:`, fetchErr.message);
        }
      }
    }
  } catch (cycleErr) {
    console.error("[Telegram Poller Cycle Error]:", cycleErr.message);
  } finally {
    if (isRunning) {
      pollTimer = setTimeout(runPollCycle, 1500);
    }
  }
}
