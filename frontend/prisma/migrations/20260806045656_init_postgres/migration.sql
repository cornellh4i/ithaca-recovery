-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "googleId" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" INTEGER,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "calType" TEXT[],
    "description" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "startDateTime" TIMESTAMPTZ NOT NULL,
    "endDateTime" TIMESTAMPTZ NOT NULL,
    "email" TEXT NOT NULL,
    "zoomRoom" TEXT,
    "zoomLink" TEXT,
    "zid" TEXT,
    "zoomPasscode" TEXT,
    "zoomInvitation" TEXT,
    "room" TEXT NOT NULL,
    "modeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarEventId" TEXT,
    "googleCalendarEventIds" JSONB,
    "googleSyncStatus" TEXT,
    "googleSyncError" TEXT,
    "zoomCalendarEventId" TEXT,
    "zoomSyncStatus" TEXT,
    "zoomHost" TEXT,
    "zoomSyncError" TEXT,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrencePattern" (
    "id" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "numberOfOccurrences" INTEGER,
    "daysOfWeek" TEXT[],
    "firstDayOfWeek" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "weekOfMonth" INTEGER,
    "dayOfMonth" INTEGER,
    "excludedDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],

    CONSTRAINT "RecurrencePattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspensionPeriod" (
    "id" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),
    "resumeEventIds" JSONB,
    "promoted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SuspensionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uid" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseSettings" (
    "id" TEXT NOT NULL,
    "leaseStartDate" DATE NOT NULL,
    "leaseEndDate" DATE NOT NULL,
    "rooms" JSONB NOT NULL,
    "agentFirstName" TEXT NOT NULL,
    "agentLastName" TEXT NOT NULL,
    "agentTitle" TEXT NOT NULL,
    "agentEmail" TEXT NOT NULL,
    "agentPhone" TEXT NOT NULL,
    "agentStreetAddress" TEXT NOT NULL,
    "agentCity" TEXT NOT NULL,
    "agentState" TEXT NOT NULL,
    "agentZip" TEXT NOT NULL,
    "emailTemplate" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_mid_key" ON "Meeting"("mid");

-- CreateIndex
CREATE INDEX "Meeting_startDateTime_endDateTime_idx" ON "Meeting"("startDateTime", "endDateTime");

-- CreateIndex
CREATE INDEX "Meeting_isRecurring_deletedAt_idx" ON "Meeting"("isRecurring", "deletedAt");

-- CreateIndex
CREATE INDEX "Meeting_googleCalendarEventId_idx" ON "Meeting"("googleCalendarEventId");

-- CreateIndex
CREATE INDEX "Meeting_zoomHost_idx" ON "Meeting"("zoomHost");

-- CreateIndex
CREATE INDEX "Meeting_room_idx" ON "Meeting"("room");

-- CreateIndex
CREATE INDEX "Meeting_zoomRoom_idx" ON "Meeting"("zoomRoom");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrencePattern_mid_key" ON "RecurrencePattern"("mid");

-- CreateIndex
CREATE INDEX "SuspensionPeriod_mid_idx" ON "SuspensionPeriod"("mid");

-- CreateIndex
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");

-- AddForeignKey
ALTER TABLE "RecurrencePattern" ADD CONSTRAINT "RecurrencePattern_mid_fkey" FOREIGN KEY ("mid") REFERENCES "Meeting"("mid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspensionPeriod" ADD CONSTRAINT "SuspensionPeriod_mid_fkey" FOREIGN KEY ("mid") REFERENCES "Meeting"("mid") ON DELETE RESTRICT ON UPDATE CASCADE;
