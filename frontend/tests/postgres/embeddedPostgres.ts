import { createServer } from "net";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

let pg: EmbeddedPostgres | null = null;
let databaseDir: string | null = null;
let started = false;

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

// findFreePort() closes its probe socket before start() binds the port, leaving a gap where a
// concurrent process can steal it -- embedded-postgres has no built-in retry for EADDRINUSE, so
// retry the whole find-port -> initialise -> start sequence with a fresh port on that failure.
const MAX_START_ATTEMPTS = 5;

function isPortInUseError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EADDRINUSE" || /EADDRINUSE/.test(String(err));
}

// Direct parallel to tests/mongo/replicaSet.ts's role for Mongo: runs a real Postgres server
// (a real `postgres` binary, downloaded once by the `embedded-postgres` package -- not a
// container, not a SQL reimplementation) as a plain child process, so tests get full SQL
// fidelity (tstzrange/EXCLUDE constraints included) with no Docker and no network dependency.
export async function startTestPostgres(dbName: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    const port = await findFreePort();
    const dir = mkdtempSync(path.join(tmpdir(), "icr-test-pg-"));

    const candidate = new EmbeddedPostgres({
      databaseDir: dir,
      port,
      user: TEST_USER,
      password: TEST_PASSWORD,
      persistent: false,
      onLog: () => {}, // Postgres' own startup/checkpoint chatter isn't useful test-run noise.
      onError: (err) => console.error("[embedded-postgres]", err),
    });

    let candidateStarted = false;
    try {
      await candidate.initialise();
      await candidate.start();
      candidateStarted = true;
      await candidate.createDatabase(dbName);
    } catch (err) {
      if (candidateStarted) {
        // Same hang risk as stopTestPostgres() -- only stop a candidate that actually started.
        await candidate.stop().catch((stopErr) => console.error("[embedded-postgres] cleanup stop failed", stopErr));
      }
      rmSync(dir, { recursive: true, force: true });
      if (isPortInUseError(err) && attempt < MAX_START_ATTEMPTS) {
        continue;
      }
      throw err;
    }

    pg = candidate;
    databaseDir = dir;
    started = true;

    return `postgresql://${TEST_USER}:${TEST_PASSWORD}@localhost:${port}/${dbName}`;
  }

  throw new Error(`Could not start embedded Postgres after ${MAX_START_ATTEMPTS} attempts`);
}

export async function stopTestPostgres(): Promise<void> {
  try {
    // embedded-postgres retains its closed process reference, so stop() after a failed/incomplete
    // start() can hang waiting on an "exit" event that already fired -- only stop what actually started.
    if (pg && started) {
      await pg.stop();
    }
  } finally {
    pg = null;
    started = false;
    if (databaseDir) {
      rmSync(databaseDir, { recursive: true, force: true });
      databaseDir = null;
    }
  }
}
