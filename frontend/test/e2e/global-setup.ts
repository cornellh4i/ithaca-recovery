import { execSync } from "child_process";
import path from "path";
import { startTestMongo } from "../mongo/replicaSet";
import { startNextDevServer } from "./support/serverProcess";
import { TEST_NEXTAUTH_SECRET, TEST_DB_NAME, TEST_BASE_URL } from "./support/testConstants";

// Runs once before the whole Playwright run: starts an in-memory Mongo
// replica set (Prisma+Mongo requires one), pushes the current schema to it,
// then spawns `next dev` directly with that DATABASE_URL in its own env and
// waits for it to respond. No webServer block in playwright.config.ts and no
// env file handoff — both would race against this function's async work.
export default async function globalSetup(): Promise<void> {
  const uri = await startTestMongo(TEST_DB_NAME);

  const frontendRoot = path.resolve(__dirname, "../..");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: frontendRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: uri },
  });

  await startNextDevServer(
    {
      DATABASE_URL: uri,
      NEXTAUTH_SECRET: TEST_NEXTAUTH_SECRET,
      NEXTAUTH_URL: TEST_BASE_URL,
      // Deliberately unset: GOOGLE_CLIENT_ID/SECRET, GOOGLE_CALENDAR_*,
      // ZOOM_CLIENT_ID/SECRET/ACCOUNT_ID — see sync-fixtures.ts for why.
    },
    3000,
  );

  // The rest of the suite (fixtures.ts, factories) also runs in this same
  // Playwright test-runner process and needs DATABASE_URL to talk to the
  // same Mongo instance the server is using.
  process.env.DATABASE_URL = uri;
}
