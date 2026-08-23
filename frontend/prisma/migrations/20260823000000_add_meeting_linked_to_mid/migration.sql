-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "linkedToMid" TEXT;

-- CreateIndex
CREATE INDEX "Meeting_linkedToMid_idx" ON "Meeting"("linkedToMid");

-- Backfill: the legacy "one meeting, two schedules" pairs (a Hybrid weekday row and a Remote
-- weekend row, etc.) predate this column -- they were only ever joined by sharing one Zoom
-- meeting (zid), which is not a usable family key going forward because an In-Person member of
-- a family must never hold a zid. Adopt exactly the unambiguous shape: two live, non-split,
-- recurring rows on one zid. A zid serving 1 or 3+ such rows is left alone for a human to look
-- at rather than guessed at.
--   * "active" = not soft-deleted; a Suspended row is still a family member (suspension is
--     per-row, and Zoom's union schedule keeps a suspended sibling's days either way).
--   * splitFromMid IS NULL excludes scoped-edit lineage children -- they're a chronological
--     division of one schedule, not a second mode, and must never grow the family.
--   * isRecurring = true is a tightening beyond a pure zid-sharing test: a one-off row that
--     happens to reuse a zid has no weekday schedule to contribute and would otherwise become
--     a phantom family member with no recurrence pattern.
--   * zid <> '' because IS NOT NULL alone admits the empty string, which every other shared-zid
--     guard in the app rejects by JS truthiness (app/api/delete/meeting/route.ts) and which
--     nothing in the write path or meetingSchema forbids persisting. Two blank-zid rows are two
--     Zoom-less meetings, not a family, and linking them would union unrelated schedules.
--   * Anchor = the lexicographically smallest id. Meeting has no createdAt column, and every id
--     is a cuid (@default(cuid())), which is timestamp-prefixed, so min(id) is the
--     earlier-created row. This holds only while the id column stays single-format: a cuid
--     ("c...") sorts after a Mongo ObjectId hex ("6..."), so if ObjectId-shaped ids are ever
--     introduced, min(id) would pick by format before it picks by time.
-- Verified read-only against production before this migration shipped: exactly three pairs
-- match (Weekend Al-Anon 9 am / One Day at a Time / Early Bird Group, each a Remote anchor plus
-- a Hybrid sibling), no zid group has 3+ members, and no row holds an empty-string zid.
WITH families AS (
  SELECT "zid", MIN("id") AS "anchorId"
  FROM "Meeting"
  WHERE "zid" IS NOT NULL
    AND "zid" <> ''
    AND "deletedAt" IS NULL
    AND "splitFromMid" IS NULL
    AND "linkedToMid" IS NULL
    AND "isRecurring" = true
  GROUP BY "zid"
  HAVING COUNT(*) = 2
)
UPDATE "Meeting" AS m
SET "linkedToMid" = anchor."mid"
FROM families f
JOIN "Meeting" anchor ON anchor."id" = f."anchorId"
WHERE m."zid" = f."zid"
  AND m."zid" <> ''
  AND m."id" <> f."anchorId"
  AND m."deletedAt" IS NULL
  AND m."splitFromMid" IS NULL
  AND m."linkedToMid" IS NULL
  AND m."isRecurring" = true;
