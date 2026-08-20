import { execFileSync } from "child_process";
import path from "path";
import { startTestPostgres } from "../postgres/embeddedPostgres";

// Jest propagates process.env mutations made here to the worker processes
// that actually run the test files (documented Jest behavior) — so setting
// DATABASE_URL here is sufficient, no env file needed (unlike Playwright's
// global-setup, which has to hand it off to a separately-spawned webServer).
export default async function globalSetup(): Promise<void> {
  const uri = await startTestPostgres("icr_jest_integration");
  process.env.DATABASE_URL = uri;
  const frontendRoot = path.resolve(__dirname, "../..");
  // `migrate deploy` applies the real, versioned migrations (prisma/migrations/) instead of
  // `db push` -- this exercises the same migration path production uses, on a real database.
  execFileSync(path.join(frontendRoot, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: frontendRoot,
    stdio: "inherit",
    // The embedded test server is a direct connection already, so the pooled and direct URLs
    // (schema.prisma's url/directUrl) are the same thing here.
    env: { ...process.env, DATABASE_URL: uri, DATABASE_URL_UNPOOLED: uri, CHECKPOINT_DISABLE: "1" },
    timeout: 60_000,
  });
}
