-- Advanced Zoom settings. Defaults preserve current behavior exactly: no password ever sent,
-- scheduled (not meet-anytime) meetings, join-before-host on.
ALTER TABLE "Meeting" ADD COLUMN "zoomCustomPasscode" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "zoomMeetAnytime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Meeting" ADD COLUMN "zoomJoinBeforeHost" BOOLEAN NOT NULL DEFAULT true;
