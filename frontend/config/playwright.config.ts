import { defineConfig, devices } from "@playwright/test";
import { TEST_BASE_URL } from "../tests/e2e/support/testConstants";

// One shared in-memory Mongo replica set for the whole run (see global-setup.ts) —
// workers: 1 keeps tests from racing each other against it. Revisit (per-worker
// DBs) if the suite grows large enough that serial execution becomes the
// bottleneck; not a concern at this suite's current size.
export default defineConfig({
  testDir: "../tests/e2e",
  globalSetup: require.resolve("../tests/e2e/global-setup.ts"),
  globalTeardown: require.resolve("../tests/e2e/global-teardown.ts"),
  fullyParallel: false,
  workers: 1,
  // CI runners are shared/throttled, and next dev (see global-setup.ts) can still
  // have a stray lazy-compile latency spike despite pre-warming -- one retry
  // absorbs that without masking a real logic bug (a genuinely broken test fails
  // twice). Local runs stay retry-free so a real failure isn't hidden behind a
  // silent pass on attempt 2.
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: TEST_BASE_URL,
    trace: "retain-on-failure",
    // Matches GitHub Actions runners (UTC) so date-boundary bugs reproduce locally instead
    // of only ever showing up in CI -- e.g. code using Date.getDay()/getDate() instead of an
    // explicit ET conversion silently picks the wrong day near ET midnight, which only
    // disagrees with the real ET calendar day when the runtime's local timezone isn't ET.
    timezoneId: "UTC",
  },
  // No webServer block: global-setup.ts owns the whole server lifecycle
  // directly (spawns `next dev` itself, after Mongo + `prisma db push` are
  // ready) — Playwright's built-in webServer races against that async setup
  // since it isn't guaranteed to start after globalSetup finishes.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
