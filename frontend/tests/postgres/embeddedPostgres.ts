import { createServer } from "net";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

let pg: EmbeddedPostgres | null = null;
let databaseDir: string | null = null;

// Port 5432 risks colliding with a real local Postgres a developer may already have running --
// ask the OS for an unused one instead of hardcoding an alternate.
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("Could not determine a free port"))));
    });
  });
}

const TEST_USER = "postgres";
const TEST_PASSWORD = "password";

// Direct parallel to tests/mongo/replicaSet.ts's role for Mongo: runs a real Postgres server
// (a real `postgres` binary, downloaded once by the `embedded-postgres` package -- not a
// container, not a SQL reimplementation) as a plain child process, so tests get full SQL
// fidelity (tstzrange/EXCLUDE constraints included) with no Docker and no network dependency.
export async function startTestPostgres(dbName: string): Promise<string> {
  const port = await findFreePort();
  databaseDir = mkdtempSync(path.join(tmpdir(), "icr-test-pg-"));

  pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user: TEST_USER,
    password: TEST_PASSWORD,
    persistent: false,
    onLog: () => {}, // Postgres' own startup/checkpoint chatter isn't useful test-run noise.
    onError: (err) => console.error("[embedded-postgres]", err),
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(dbName);

  return `postgresql://${TEST_USER}:${TEST_PASSWORD}@localhost:${port}/${dbName}`;
}

export async function stopTestPostgres(): Promise<void> {
  if (pg) {
    await pg.stop();
    pg = null;
  }
  if (databaseDir) {
    rmSync(databaseDir, { recursive: true, force: true });
    databaseDir = null;
  }
}
