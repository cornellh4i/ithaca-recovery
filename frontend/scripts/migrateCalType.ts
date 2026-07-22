/**
 * One-off migration: convert calType from String → String[] in existing Meeting records.
 *
 * Prisma cannot read documents where calType is a plain string when the schema
 * declares String[], so we use runCommandRaw to do the update via the MongoDB driver.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/migrateCalType.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Use an aggregation pipeline update to wrap any string calType into a single-element array.
  // $type: 2 = BSON string type.
  const result = await prisma.$runCommandRaw({
    update: "Meeting",
    updates: [
      {
        q: { calType: { $type: 2 } },            // match docs where calType is a string
        u: [{ $set: { calType: ["$calType"] } }], // wrap it in an array (pipeline update)
        multi: true,
      },
    ],
  });

  console.log("Migration result:", JSON.stringify(result, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());