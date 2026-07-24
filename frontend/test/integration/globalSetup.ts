import { execSync } from "child_process";
import path from "path";
import { startTestMongo } from "../mongo/replicaSet";

// Jest propagates process.env mutations made here to the worker processes
// that actually run the test files (documented Jest behavior) — so setting
// DATABASE_URL here is sufficient, no env file needed (unlike Playwright's
// global-setup, which has to hand it off to a separately-spawned webServer).
export default async function globalSetup(): Promise<void> {
  const uri = await startTestMongo("icr_jest_integration");
  process.env.DATABASE_URL = uri;
  // See the identical comment in test/e2e/global-setup.ts — CHECKPOINT_DISABLE stops the
  // Prisma CLI's post-run update-check ping from hanging this execSync indefinitely.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: uri, CHECKPOINT_DISABLE: "1" },
  });
}
