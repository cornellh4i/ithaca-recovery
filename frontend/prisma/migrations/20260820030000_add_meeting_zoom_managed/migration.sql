-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "zoomManaged" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: the one meeting whose Zoom meeting lives on an account this app cannot control
-- (Noon Brown Baggers, hosted externally -- see 2026-08-20 legacy-Zoom migration). Adopted
-- in-account legacy meetings stay managed; this is a no-op on dev/test databases.
UPDATE "Meeting" SET "zoomManaged" = false WHERE "zid" = '4013485321';
