import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | null = null;

// Prisma's MongoDB connector requires a replica set (even with no explicit
// $transaction calls) — a single-node replSet satisfies that with no real
// Atlas/network dependency.
export async function startTestMongo(dbName: string): Promise<string> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // dbName must be passed to getUri(), not create() — create()'s dbName option
  // doesn't propagate into the returned connection string.
  const uri = replSet.getUri(dbName);
  // directConnection=true skips full replica-set topology discovery/monitoring and talks
  // to this one node directly — safe and semantically identical for a single-member
  // replSet. Confirmed necessary in CI specifically: Prisma's Linux schema-engine binary
  // hung indefinitely mid-topology-discovery against this replSet URI without it (debug
  // trace showed the schemaPush RPC call sent, then no response, ever — not reproducible
  // on macOS, which uses a different engine binary/driver implementation).
  return `${uri}&directConnection=true`;
}

export async function stopTestMongo(): Promise<void> {
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}
