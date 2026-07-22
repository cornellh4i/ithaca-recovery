// Shared between the Playwright test runner (auth.ts, which mints session
// cookies directly) and global-setup.ts (which writes these into the env file
// the spawned `next dev`/`next start` webServer process reads) so both sides
// always agree without needing to synchronize env vars across processes.
export const TEST_NEXTAUTH_SECRET = "e2e-test-secret-not-a-real-secret";
export const TEST_DB_NAME = "icr_e2e";
export const TEST_BASE_URL = "http://localhost:3000";
