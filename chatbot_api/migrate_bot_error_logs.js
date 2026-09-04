import pool from "./db.js";
import { initBotErrorLogsTable } from "./utils/botLogger.js";

async function run() {
  console.log("Running bot_error_logs migration...");
  await initBotErrorLogsTable();
  console.log("Migration complete!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
