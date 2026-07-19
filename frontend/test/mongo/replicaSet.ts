import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | null = null;

// Prisma's MongoDB connector requires a replica set (even with no explicit
// $transaction calls) — a single-node replSet satisfies that with no real
// Atlas/network dependency.
export async function startTestMongo(dbName: string): Promise<string> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // dbName must be passed to getUri(), not create() — create()'s dbName option
  // doesn't propagate into the returned connection string.
  return replSet.getUri(dbName);
}

export async function stopTestMongo(): Promise<void> {
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}
