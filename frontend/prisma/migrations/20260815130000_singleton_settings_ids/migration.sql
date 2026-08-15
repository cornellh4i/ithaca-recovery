-- LeaseSettings and MeetingExportSettings were always intended as singletons (both are read
-- via findFirst(), written via read-then-create), but nothing enforced that at the database
-- level -- id defaulted to a fresh cuid() per row, so a concurrent pair of "no row yet" reads
-- could both fall through to create, leaving two rows and an unordered findFirst() picking
-- between them arbitrarily. Both tables have been live since before this migration, so a
-- defensive consolidation runs first (keeping the most recently updated row, a no-op if only
-- zero or one row exists) before id is repointed at a fixed constant and every future write
-- goes through upsert-by-id instead.
DO $$
DECLARE
  keep_id TEXT;
BEGIN
  SELECT "id" INTO keep_id FROM "LeaseSettings" ORDER BY "updatedAt" DESC, "id" ASC LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM "LeaseSettings" WHERE "id" != keep_id;
    UPDATE "LeaseSettings" SET "id" = 'lease-settings' WHERE "id" = keep_id;
  END IF;
END $$;

DO $$
DECLARE
  keep_id TEXT;
BEGIN
  SELECT "id" INTO keep_id FROM "MeetingExportSettings" ORDER BY "updatedAt" DESC, "id" ASC LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM "MeetingExportSettings" WHERE "id" != keep_id;
    UPDATE "MeetingExportSettings" SET "id" = 'meeting-export-settings' WHERE "id" = keep_id;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "LeaseSettings" ALTER COLUMN "id" SET DEFAULT 'lease-settings';

-- AlterTable
ALTER TABLE "MeetingExportSettings" ALTER COLUMN "id" SET DEFAULT 'meeting-export-settings';
