-- Custom fellowship name for meetings whose calType includes "Other"; AA/Al-Anon derive from
-- calType at title-build time, so no backfill is needed.
ALTER TABLE "Meeting" ADD COLUMN "fellowship" TEXT;
