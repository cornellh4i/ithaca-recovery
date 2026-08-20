-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "zoomManaged" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: the one meeting whose Zoom meeting lives on an account this app cannot control
-- (Noon Brown Baggers, hosted externally -- see 2026-08-20 legacy-Zoom migration). Adopted
-- in-account legacy meetings stay managed; this is a no-op on dev/test databases.
UPDATE "Meeting" SET "zoomManaged" = false WHERE "zid" = '4013485321';

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "zoomTopic" TEXT;

-- Backfill: pin the adopted legacy meetings' (and the two 2026-08-20-created meetings') exact
-- Zoom topics so a managed edit can never rename them implicitly -- null zoomTopic derives
-- title + mode suffix instead. Verbatim from the Zoom API on 2026-08-20; no-ops on dev/test.
UPDATE "Meeting" SET "zoomTopic" = 'Daily Ithaca - Hybrid' WHERE "zid" = '81303529023';
UPDATE "Meeting" SET "zoomTopic" = 'Keep It Simple - Hybrid' WHERE "zid" = '81841184487';
UPDATE "Meeting" SET "zoomTopic" = 'Friday Night Women''s Group - AA- Hybrid 2nd Fri' WHERE "zid" = '81983669363';
UPDATE "Meeting" SET "zoomTopic" = 'We Absolutely Insist on Enjoying Life - Zoom Only' WHERE "zid" = '82347415492';
UPDATE "Meeting" SET "zoomTopic" = 'Progress not Perfection - AFG - Hybrid' WHERE "zid" = '82782481112';
UPDATE "Meeting" SET "zoomTopic" = 'Women''s AA Group - Hybrid' WHERE "zid" = '83162888305';
UPDATE "Meeting" SET "zoomTopic" = 'Monday Night Big Book - Hybrid' WHERE "zid" = '83285117507';
UPDATE "Meeting" SET "zoomTopic" = 'Marijuana Anonymous - Hybrid' WHERE "zid" = '83465945284';
UPDATE "Meeting" SET "zoomTopic" = 'How It Works AA - Hybrid' WHERE "zid" = '83536666917';
UPDATE "Meeting" SET "zoomTopic" = 'PI-CPC AA Intergroup - Hybrid' WHERE "zid" = '83628425047';
UPDATE "Meeting" SET "zoomTopic" = 'Al Anon Intergroup' WHERE "zid" = '83660784808';
UPDATE "Meeting" SET "zoomTopic" = 'Recovering Couples Anonymous - Hybrid (Fall)' WHERE "zid" = '83945489280';
UPDATE "Meeting" SET "zoomTopic" = 'Sunday 12 & 12 - Hybrid' WHERE "zid" = '84092177497';
UPDATE "Meeting" SET "zoomTopic" = 'AFG - Friday' WHERE "zid" = '84334042952';
UPDATE "Meeting" SET "zoomTopic" = 'GA - Zoom Only Sunday 530 PM' WHERE "zid" = '84944376249';
UPDATE "Meeting" SET "zoomTopic" = 'Big Book Reading Group' WHERE "zid" = '85324331941';
UPDATE "Meeting" SET "zoomTopic" = 'Weekend AFG - Hybrid' WHERE "zid" = '85466978793';
UPDATE "Meeting" SET "zoomTopic" = 'One Day at a Time - Hybrid M-S - Zoom Only Sunday' WHERE "zid" = '85490891468';
UPDATE "Meeting" SET "zoomTopic" = 'AA District Meeting' WHERE "zid" = '85760961749';
UPDATE "Meeting" SET "zoomTopic" = 'Sex and Love Addicts Anonymous' WHERE "zid" = '86035030643';
UPDATE "Meeting" SET "zoomTopic" = 'Thursday Night Ala-Non Group - Zoom Only' WHERE "zid" = '86588912277';
UPDATE "Meeting" SET "zoomTopic" = 'Danby Tosspots' WHERE "zid" = '87447757338';
UPDATE "Meeting" SET "zoomTopic" = 'Early Bird 7 AM Daily Meeting' WHERE "zid" = '89296128710';
UPDATE "Meeting" SET "zoomTopic" = 'NA Spiritual Foundations ' WHERE "zid" = '89625374048';
UPDATE "Meeting" SET "zoomTopic" = 'No Human Power - Zoom Only' WHERE "zid" = '89741511713';
