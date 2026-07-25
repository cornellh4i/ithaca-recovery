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
  // The real fix for the CI hang is startTestMongo pre-creating indexes via the native
  // driver (see replicaSet.ts) — a known, unfixed Prisma+mongodb-memory-server bug
  // (github.com/prisma/prisma/issues/23703) makes `db push` hang forever batch-creating
  // indexes once a model crosses ~7 unique+index fields (Meeting has exactly 7). With
  // indexes pre-created, this call just confirms "already in sync". Calling the installed
  // binary directly (not `npx`) plus this `timeout` stay as defense in depth regardless.
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

  // next dev compiles each route lazily on its first request. Left alone, that
  // first compile happens mid-suite instead of here, competing with whatever
  // test is running at the time for CPU on the same (often shared/throttled)
  // CI runner -- e.g. a test's create-meeting round-trip missing its 30s
  // timeout because an unrelated route started compiling in the background.
  // Triggering every route the suite ever page.goto()s to, once, up front,
  // moves that latency into setup instead of a random test.
  await Promise.all(
    ["/", "/admin", "/signage"].map(async (route) => {
      try {
        const res = await fetch(`${TEST_BASE_URL}${route}`, { signal: AbortSignal.timeout(20_000) });
        await res.arrayBuffer(); // drain the body so the connection closes cleanly
      } catch {
        // Best-effort: a route still compiling past 20s just compiles lazily on its
        // first real page.goto() instead -- the CI-only retry (playwright.config.ts)
        // is the backstop for that, and this timeout is what keeps a stuck route from
        // hanging global setup (and the whole suite) indefinitely.
      }
    }),
  );

  // The rest of the suite (fixtures.ts, factories) also runs in this same
  // Playwright test-runner process and needs DATABASE_URL to talk to the
  // same Mongo instance the server is using.
  process.env.DATABASE_URL = uri;
}
