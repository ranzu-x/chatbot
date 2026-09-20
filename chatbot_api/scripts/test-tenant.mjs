// Runs the opt-in cross-tenant isolation test (talks to the real database).
import { spawnSync } from "child_process";
const r = spawnSync(process.execPath, ["--test", "--test-force-exit", "test/tenantIsolation.test.js"], {
  stdio: "inherit",
  env: { ...process.env, TENANT_ISOLATION: "1" },
});
process.exit(r.status ?? 1);
