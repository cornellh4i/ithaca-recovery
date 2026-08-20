-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "splitFromMid" TEXT;

-- CreateIndex
CREATE INDEX "Meeting_splitFromMid_idx" ON "Meeting"("splitFromMid");
