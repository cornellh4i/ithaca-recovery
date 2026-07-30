import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | null = null;

// Mirrors prisma/schema.prisma's @unique/@@index declarations exactly. Pre-created here via
// the native driver (not through `prisma db push`) to work around a known, unfixed Prisma+
// mongodb-memory-server bug (https://github.com/prisma/prisma/issues/23703): `db push`
// batch-creates every missing index in one schemaPush RPC call, and that batch hangs the
// schema-engine binary forever once a model crosses ~7 unique+index fields combined --
// Meeting alone has exactly 7 here. Pre-creating them means `db push` (still run afterward,
// see both global-setup.ts files) finds nothing left to batch-create and just confirms
// "already in sync", never triggering the buggy path. Keep in sync with schema.prisma by hand
// if either changes — small, stable list, not worth generating dynamically.
// `name` must match Prisma's own naming convention exactly (`<Model>_<fields>_key` for
// @unique, `<Model>_<fields>_idx` for @@index) — without it, `db push` doesn't recognize
// these as the indexes it wants and tries to drop them and (re)create its own instead,
// hitting the very batch-creation bug this is meant to avoid.
const INDEXES: Record<string, { keys: Record<string, 1>; name: string; unique?: boolean }[]> = {
  Admin: [{ keys: { email: 1 }, name: "Admin_email_key", unique: true }],
  Meeting: [
    { keys: { mid: 1 }, name: "Meeting_mid_key", unique: true },
    { keys: { startDateTime: 1, endDateTime: 1 }, name: "Meeting_startDateTime_endDateTime_idx" },
    { keys: { isRecurring: 1, deletedAt: 1 }, name: "Meeting_isRecurring_deletedAt_idx" },
    { keys: { googleCalendarEventId: 1 }, name: "Meeting_googleCalendarEventId_idx" },
    { keys: { zoomHost: 1 }, name: "Meeting_zoomHost_idx" },
    { keys: { room: 1 }, name: "Meeting_room_idx" },
    { keys: { zoomRoom: 1 }, name: "Meeting_zoomRoom_idx" },
  ],
  RecurrencePattern: [{ keys: { mid: 1 }, name: "RecurrencePattern_mid_key", unique: true }],
  User: [{ keys: { uid: 1 }, name: "User_uid_key", unique: true }],
};

async function createIndexes(uri: string): Promise<void> {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    for (const [collection, specs] of Object.entries(INDEXES)) {
      for (const { keys, name, unique } of specs) {
        await db.collection(collection).createIndex(keys, unique ? { name, unique: true } : { name });
      }
    }
  } finally {
    await client.close();
  }
}

// Prisma's MongoDB connector requires a replica set (even with no explicit
// $transaction calls) — a single-node replSet satisfies that with no real
// Atlas/network dependency.
export async function startTestMongo(dbName: string): Promise<string> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // dbName must be passed to getUri(), not create() — create()'s dbName option
  // doesn't propagate into the returned connection string.
  const uri = replSet.getUri(dbName);
  await createIndexes(uri);
  return uri;
}

export async function stopTestMongo(): Promise<void> {
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}
