-- Backfill: a 'thisAndFollowing' trim (delete route, update route's handleScopedEdit) now nulls
-- numberOfOccurrences in the same write as endDate, so a later whole-series edit resubmitting a
-- stale count can't recompute an end date past the trim (toRRule also now prefers endDate/UNTIL
-- over COUNT as a defensive backstop). Rows trimmed before that fix landed can still hold both
-- fields together -- this is a one-time backfill for those, not something ongoing writes produce.
UPDATE "RecurrencePattern"
SET "numberOfOccurrences" = NULL
WHERE "endDate" IS NOT NULL AND "numberOfOccurrences" IS NOT NULL;
