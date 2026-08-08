-- CreateTable
CREATE TABLE "MeetingExportSettings" (
    "id" TEXT NOT NULL,
    "fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingExportSettings_pkey" PRIMARY KEY ("id")
);
