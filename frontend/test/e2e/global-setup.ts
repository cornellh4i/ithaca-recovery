import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { startTestMongo } from "../mongo/replicaSet";
import { startNextDevServer } from "./support/serverProcess";
import { TEST_NEXTAUTH_SECRET, TEST_DB_NAME, TEST_BASE_URL } from "./support/testConstants";

// serverProcess.ts spawns `next dev` with `{...process.env, ...overrides}` — merely
// omitting a var from `overrides` does NOT keep it unset, because Next.js's own
// `.env.local` loading inside that child process fills in anything not already
// present in its env, including real Google/Zoom credentials if the developer has
// them configured for local dev. Blanking every GOOGLE_*/ZOOM_* key by name (read
// from .env.local itself, not hardcoded, so a newly added credential var doesn't
// silently slip through) is what actually keeps sync-fixtures.ts's "zero real
// network calls" promise — this was previously just a comment, not enforced, and a
// real Zoom meeting got created via a live account during test development.
function credentialVarOverrides(frontendRoot: string): Record<string, string> {
  const overrides: Record<string, string> = {};
  let contents = "";
  try {
    contents = readFileSync(path.join(frontendRoot, ".env.local"), "utf8");
  } catch {
    return overrides; // no .env.local — nothing to blank
  }
  for (const line of contents.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match && /^(GOOGLE|ZOOM)_/.test(match[1])) {
      overrides[match[1]] = "";
    }
  }
  return overrides;
}

// Runs once before the whole Playwright run: starts an in-memory Mongo
// replica set (Prisma+Mongo requires one), pushes the current schema to it,
// then spawns `next dev` directly with that DATABASE_URL in its own env and
// waits for it to respond. No webServer block in playwright.config.ts and no
// env file handoff — both would race against this function's async work.
export default async function globalSetup(): Promise<void> {
  const uri = await startTestMongo(TEST_DB_NAME);

  const frontendRoot = path.resolve(__dirname, "../..");
  // Call the installed `prisma` binary directly rather than through `npx` — in CI, the
  // orphan process left behind after this hung was literally named "npm exec prisma db
  // push...", i.e. npm's own resolution/update-check wrapper, not anything inside Prisma
  // itself (CHECKPOINT_DISABLE, a Prisma-only setting, didn't help). The `timeout` below
  // is a hard backstop regardless of the exact cause: this should finish in well under a
  // second, so 60s is generous, and a genuine hang now fails fast with a clear error
  // instead of silently blocking the whole suite.
  execFileSync(path.join(frontendRoot, "node_modules/.bin/prisma"), ["db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: frontendRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: uri, CHECKPOINT_DISABLE: "1" },
    timeout: 60_000,
  });

  await startNextDevServer(
    {
      ...credentialVarOverrides(frontendRoot),
      DATABASE_URL: uri,
      NEXTAUTH_SECRET: TEST_NEXTAUTH_SECRET,
      NEXTAUTH_URL: TEST_BASE_URL,
    },
    3000,
  );

  // The rest of the suite (fixtures.ts, factories) also runs in this same
  // Playwright test-runner process and needs DATABASE_URL to talk to the
  // same Mongo instance the server is using.
  process.env.DATABASE_URL = uri;
}
