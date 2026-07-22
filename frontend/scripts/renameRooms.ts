/**
 * One-off migration: rename legacy room names in the Meeting collection.
 *
 * Renames:
 *   "Small but Powerful - Right"  →  "Room for Gratitude"
 *   "Small but Powerful - Left"   →  "Room for Acceptance"
 *   "Seeds of Hope"               →  "Seeds of Hope Room"
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/renameRooms.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const renames: Record<string, string> = {
  "Small but Powerful - Right": "Room for Gratitude",
  "Small but Powerful - Left": "Room for Acceptance",
  "Seeds of Hope": "Seeds of Hope Room",
};

async function main() {
  let total = 0;

  for (const [oldName, newName] of Object.entries(renames)) {
    const result = await prisma.meeting.updateMany({
      where: { room: oldName },
      data: { room: newName },
    });
    console.log(`"${oldName}" → "${newName}": ${result.count} record(s) updated`);
    total += result.count;
  }

  console.log(`\nDone. ${total} total record(s) updated.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());