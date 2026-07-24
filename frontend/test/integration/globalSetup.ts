import { execFileSync } from "child_process";
import path from "path";
import { startTestMongo } from "../mongo/replicaSet";

// Jest propagates process.env mutations made here to the worker processes
// that actually run the test files (documented Jest behavior) — so setting
// DATABASE_URL here is sufficient, no env file needed (unlike Playwright's
// global-setup, which has to hand it off to a separately-spawned webServer).
export default async function globalSetup(): Promise<void> {
  const uri = await startTestMongo("icr_jest_integration");
  process.env.DATABASE_URL = uri;
  const frontendRoot = path.resolve(__dirname, "../..");
  // The real fix for the CI hang is startTestMongo pre-creating indexes via the native
  // driver (see replicaSet.ts) — see the identical comment in test/e2e/global-setup.ts.
  // `execFileSync` (not `npx`) plus this `timeout` stay as defense in depth.
  execFileSync(path.join(frontendRoot, "node_modules/.bin/prisma"), ["db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: frontendRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: uri, CHECKPOINT_DISABLE: "1" },
    timeout: 60_000,
  });
}
