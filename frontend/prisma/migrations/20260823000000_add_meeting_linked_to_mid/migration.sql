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
--   * Anchor = the lexicographically smallest id. Meeting has no createdAt column, and "id" is
--     mixed-format: rows carried over by the Mongo import kept their ObjectId hex, and
--     @default(cuid()) only governs rows created since the Postgres cutover (no script that
--     would have regenerated the imported ids exists in this repo). ObjectId hex ("6...") sorts
--     before a cuid ("c..."), and every imported row is older than every cuid row, so the
--     format-first ordering happens to agree with creation order and min(id) is the earlier
--     row. It stops being the earlier row the moment a cuid row can predate an ObjectId-shaped
--     one -- i.e. if the imported ids were regenerated, or ObjectId-shaped ids reintroduced.
--     The legacy pairs this backfill targets are exactly the ones most likely to be ObjectIds.
-- Scope check before applying (frontend/package.json runs `prisma migrate deploy` unattended on
-- Vercel production): run the families CTE below on its own as a SELECT, plus a
-- HAVING COUNT(*) > 2 variant, and confirm it matches the expected three pairs -- Weekend Al-Anon
-- 9 am, One Day at a Time, Early Bird Group, each a Remote anchor plus a Hybrid sibling -- with no
-- 3+-member zid group and no empty-string zid. That check has not been run against production
-- from this branch. If the adopted set turns out wrong, reversal is one statement:
-- UPDATE "Meeting" SET "linkedToMid" = NULL;
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
  AND m."id" <> f."anchorId"
  AND m."deletedAt" IS NULL
  AND m."splitFromMid" IS NULL
  AND m."linkedToMid" IS NULL
  AND m."isRecurring" = true;
