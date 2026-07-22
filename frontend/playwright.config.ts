import { defineConfig, devices } from "@playwright/test";
import { TEST_BASE_URL } from "./test/e2e/support/testConstants";

// One shared in-memory Mongo replica set for the whole run (see global-setup.ts) —
// workers: 1 keeps tests from racing each other against it. Revisit (per-worker
// DBs) if the suite grows large enough that serial execution becomes the
// bottleneck; not a concern at this suite's current size.
export default defineConfig({
  testDir: "./test/e2e",
  globalSetup: require.resolve("./test/e2e/global-setup.ts"),
  globalTeardown: require.resolve("./test/e2e/global-teardown.ts"),
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: TEST_BASE_URL,
    trace: "retain-on-failure",
  },
  // No webServer block: global-setup.ts owns the whole server lifecycle
  // directly (spawns `next dev` itself, after Mongo + `prisma db push` are
  // ready) — Playwright's built-in webServer races against that async setup
  // since it isn't guaranteed to start after globalSetup finishes.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
