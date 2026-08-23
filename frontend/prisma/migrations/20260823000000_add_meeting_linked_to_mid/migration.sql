-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "linkedToMid" TEXT;

-- CreateIndex
CREATE INDEX "Meeting_linkedToMid_idx" ON "Meeting"("linkedToMid");

-- Backfill: the legacy "one meeting, two schedules" pairs (a Hybrid weekday row and a Remote
-- weekend row, etc.) predate this column -- they were only ever joined by sharing one Zoom
-- meeting (zid), which is not a usable family key going forward because an In-Person member of
-- a family must never hold a zid. Adopt exactly the unambiguous shape: two live, non-split,
-- recurring rows on one zid. A zid serving a single such row is left alone; a zid serving 3+ of
-- them is never guessed at either, but it also fails the scope guard below rather than passing
-- quietly, because it means the legacy data is not the shape this backfill was written for.
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
-- Scope guard. frontend/package.json runs `prisma migrate deploy` unattended whenever
-- VERCEL_ENV=production, so this file is the last place the adopted set can be checked before it
-- lands. Production is expected to hold exactly three such pairs -- Weekend Al-Anon 9 am, One Day
-- at a Time, Early Bird Group -- but that has not been confirmed by a read against production
-- from this branch, so the backfill asserts the count instead of trusting it. Prisma runs each
-- migration file inside one transaction, so the RAISE below aborts the deploy and rolls the whole
-- file back rather than silently mis-linking rows. A database that holds no legacy pairs at all
-- -- every fresh test, preview and shadow database, none of which saw the Mongo import -- adopts
-- 0 rows and passes through untouched. If an adopted set ever has to be undone after the fact,
-- reversal is one statement: UPDATE "Meeting" SET "linkedToMid" = NULL;
DO $$
DECLARE
  adopted integer;
  ambiguous integer;
BEGIN
  CREATE TEMPORARY TABLE "_linkedToMid_families" ON COMMIT DROP AS
  SELECT "zid", MIN("id") AS "anchorId", COUNT(*) AS "members"
  FROM "Meeting"
  WHERE "zid" IS NOT NULL
    AND "zid" <> ''
    AND "deletedAt" IS NULL
    AND "splitFromMid" IS NULL
    AND "linkedToMid" IS NULL
    AND "isRecurring" = true
  GROUP BY "zid"
  HAVING COUNT(*) >= 2;

  SELECT COUNT(*) INTO ambiguous FROM "_linkedToMid_families" WHERE "members" > 2;

  UPDATE "Meeting" AS m
  SET "linkedToMid" = anchor."mid"
  FROM "_linkedToMid_families" f
  JOIN "Meeting" anchor ON anchor."id" = f."anchorId"
  WHERE f."members" = 2
    AND m."zid" = f."zid"
    AND m."id" <> f."anchorId"
    AND m."deletedAt" IS NULL
    AND m."splitFromMid" IS NULL
    AND m."linkedToMid" IS NULL
    AND m."isRecurring" = true;
  GET DIAGNOSTICS adopted = ROW_COUNT;

  IF adopted = 0 AND ambiguous = 0 THEN
    RAISE NOTICE 'linkedToMid backfill: no shared-zid families on this database, nothing adopted.';
  ELSIF adopted <> 3 OR ambiguous <> 0 THEN
    RAISE EXCEPTION 'linkedToMid backfill scope check failed: adopted % row(s), expected 3; found % zid group(s) with 3+ members, expected 0.', adopted, ambiguous
      USING HINT = 'Run the SELECT form of this file''s families query against the database, confirm which meetings actually share a zid, then correct the expected count here before deploying again.';
  END IF;
END
$$;
