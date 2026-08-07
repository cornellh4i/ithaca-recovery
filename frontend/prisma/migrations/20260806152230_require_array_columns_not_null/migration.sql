-- Meeting.calType, RecurrencePattern.daysOfWeek, and RecurrencePattern.excludedDates are
-- required (non-optional) list fields in schema.prisma -- Prisma's generated client type is
-- `string[]`/`Date[]`, never null. The initial migration created all three columns nullable
-- (a known Prisma migration-generation gap for array columns), which doesn't match that
-- contract. Defensive backfill first in case any row ever got a real NULL despite every known
-- write path using `?? []`-style fallbacks for these three columns; all statements are no-ops
-- if no row qualifies.
UPDATE "Meeting" SET "calType" = ARRAY[]::TEXT[] WHERE "calType" IS NULL;
UPDATE "RecurrencePattern" SET "daysOfWeek" = ARRAY[]::TEXT[] WHERE "daysOfWeek" IS NULL;
UPDATE "RecurrencePattern" SET "excludedDates" = ARRAY[]::TIMESTAMP(3)[] WHERE "excludedDates" IS NULL;

ALTER TABLE "Meeting" ALTER COLUMN "calType" SET NOT NULL;
ALTER TABLE "RecurrencePattern" ALTER COLUMN "daysOfWeek" SET NOT NULL;
ALTER TABLE "RecurrencePattern" ALTER COLUMN "excludedDates" SET NOT NULL;
