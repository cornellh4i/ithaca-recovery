import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, ConflictRow, OccupiedClaim } from "../../../../util/resourceOverlap";
import { parseImportRow } from "../../../../util/importParsing";
import { IMeeting } from "../../../../util/models";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

type ImportStatus = "created" | "conflict" | "skipped" | "errored";

interface ImportResultRow {
  meeting: string;
  status: ImportStatus;
  note?: string;
}

// A row that was created and still needs the slow GCal/Zoom sync half, run after the response
// is sent — mirrors write/meeting/route.ts's syncNewMeeting, but batched, and reusing the Zoom
// host this row already claimed in the sequential loop below instead of re-resolving it (that
// resolution happening sequentially, before any DB writes race, is what avoids two rows in the
// same batch grabbing the same host).
type PendingSync = {
  mid: string;
  meetingData: IMeeting;
  resolvedHost: string | null;
};

const toClaim = (meeting: IMeeting, value: string): OccupiedClaim => ({
  mid: meeting.mid,
  title: meeting.title,
  value,
  startDateTime: meeting.startDateTime,
  endDateTime: meeting.endDateTime,
  isRecurring: meeting.isRecurring,
  recurrencePattern: meeting.recurrencePattern,
});

async function syncImportedRow(pending: PendingSync, accessToken: string | undefined): Promise<void> {
  const { mid, meetingData, resolvedHost } = pending;

  if (accessToken && meetingData.status !== "Suspended") {
    const calendarIds = calendarIdsForMeeting(meetingData.calType ?? []);
    const eventIds: Record<string, string> = {};
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const id = await createCalendarEvent(accessToken, meetingData, calId);
      if (id) eventIds[cat] = id;
    }
    const synced = Object.keys(eventIds).length === Object.keys(calendarIds).length && Object.keys(calendarIds).length > 0;
    await prisma.meeting.update({
      where: { mid },
      data: { googleCalendarEventIds: eventIds, syncStatus: synced ? "synced" : "error" },
    });
  }

  if (meetingData.zoomRoom && meetingData.status !== "Suspended") {
    let zid: string | null = null;
    let zoomLink: string | null = null;
    let zoomCalendarEventId: string | null = null;
    let zoomHost = resolvedHost;
    let zoomSynced = true;
    let zoomSyncError: string | null = null;

    if (!resolvedHost) {
      zoomSynced = false;
      zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
    } else {
      const created = await createZoomMeeting(meetingData, resolvedHost);
      if (created) {
        zid = created.zid;
        zoomLink = created.zoomLink;
      } else {
        zoomSynced = false;
        zoomHost = null;
        zoomSyncError = "Failed to create the Zoom meeting.";
      }
    }

    if (accessToken && zoomLink) {
      const calId = zoomRoomCalendarId[meetingData.zoomRoom];
      if (calId) {
        const eventId = await createCalendarEvent(accessToken, { ...meetingData, zoomLink }, calId, zoomLink);
        if (eventId) zoomCalendarEventId = eventId;
        else {
          zoomSynced = false;
          zoomSyncError = zoomSyncError ?? "Zoom meeting created but its calendar event failed to sync.";
        }
      }
    }

    await prisma.meeting.update({
      where: { mid },
      data: {
        zid, zoomLink, zoomHost, zoomCalendarEventId,
        zoomSyncStatus: zoomSynced ? "synced" : "error",
        zoomSyncError: zoomSynced ? null : zoomSyncError,
      },
    });
  }
}

// Host collisions were already avoided sequentially in the POST handler below — safe to run
// the slow network half in parallel per row now.
async function syncImportedRows(pending: PendingSync[], accessToken: string | undefined): Promise<void> {
  await Promise.all(pending.map((p) => syncImportedRow(p, accessToken)));
}

const duplicateKey = (title: string, start: Date, end: Date) => `${title}|${start.toISOString()}|${end.toISOString()}`;

const importMeetings = async (request: Request): Promise<Response> => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Spreadsheet has no sheets" }, { status: 400 });
    }
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const results: ImportResultRow[] = [];
    const conflicts: ConflictRow[] = [];
    const pendingSync: PendingSync[] = [];

    const seenInBatch = new Set<string>();
    const roomClaims: OccupiedClaim[] = [];
    const zoomRoomClaims: OccupiedClaim[] = [];
    const zoomHostClaims: OccupiedClaim[] = [];

    // Sequential, not Promise.all: two rows needing a Zoom host in the same batch must not
    // race for the same one — findResourceConflicts/resolveZoomHost see each prior row's claim
    // via extraOccupied immediately, before it's committed to the DB.
    for (let i = 0; i < rawRows.length; i++) {
      const parsedRow = parseImportRow(rawRows[i], i);

      if (!parsedRow.ok) {
        results.push({ meeting: "—", status: "errored", note: parsedRow.error });
        continue;
      }

      const { meeting } = parsedRow.row;

      const dupKey = duplicateKey(meeting.title, meeting.startDateTime, meeting.endDateTime);
      const isDuplicate = seenInBatch.has(dupKey) || (await prisma.meeting.findFirst({
        where: {
          ...notDeleted,
          title: meeting.title,
          startDateTime: meeting.startDateTime,
          endDateTime: meeting.endDateTime,
        },
        select: { mid: true },
      })) !== null;
      if (isDuplicate) {
        results.push({ meeting: meeting.title, status: "skipped", note: "already exists (matched by title + schedule)" });
        continue;
      }

      const rowConflicts: { mid: string; title: string }[] = [];

      const roomConflicts = await findResourceConflicts("room", meeting.room, meeting, { extraOccupied: roomClaims });
      if (roomConflicts.length > 0) {
        rowConflicts.push(...roomConflicts);
        conflicts.push({
          field: "room", value: meeting.room,
          meetings: [{ mid: meeting.mid, title: meeting.title }, ...roomConflicts],
        });
      }

      if (meeting.zoomRoom) {
        const zoomRoomConflicts = await findResourceConflicts("zoomRoom", meeting.zoomRoom, meeting, { extraOccupied: zoomRoomClaims });
        if (zoomRoomConflicts.length > 0) {
          rowConflicts.push(...zoomRoomConflicts);
          conflicts.push({
            field: "zoomRoom", value: meeting.zoomRoom,
            meetings: [{ mid: meeting.mid, title: meeting.title }, ...zoomRoomConflicts],
          });
        }
      }

      const needsZoom = !!meeting.zoomRoom && meeting.status !== "Suspended";
      const resolvedHost = needsZoom ? await resolveZoomHost(meeting, { extraOccupied: zoomHostClaims }) : null;

      const { recurrencePattern, ...meetingFields } = meeting;
      const newMeeting = await prisma.meeting.create({ data: meetingFields });

      if (recurrencePattern) {
        await prisma.recurrencePattern.create({
          data: {
            mid: newMeeting.mid,
            type: recurrencePattern.type,
            startDate: recurrencePattern.startDate,
            endDate: recurrencePattern.endDate ?? undefined,
            daysOfWeek: recurrencePattern.daysOfWeek ?? [],
            firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
            interval: recurrencePattern.interval || 1,
            weekOfMonth: recurrencePattern.weekOfMonth ?? null,
            dayOfMonth: recurrencePattern.dayOfMonth ?? null,
          },
        });
      }

      seenInBatch.add(dupKey);
      roomClaims.push(toClaim(meeting, meeting.room));
      if (meeting.zoomRoom) zoomRoomClaims.push(toClaim(meeting, meeting.zoomRoom));
      if (resolvedHost) zoomHostClaims.push(toClaim(meeting, resolvedHost));

      pendingSync.push({ mid: newMeeting.mid, meetingData: meeting, resolvedHost });

      results.push({
        meeting: meeting.title,
        status: rowConflicts.length > 0 ? "conflict" : "created",
        note: rowConflicts.length > 0
          ? `conflicts with ${rowConflicts.map((c) => c.title).join(", ")}`
          : undefined,
      });
    }

    if (pendingSync.length > 0) {
      after(syncImportedRows(pendingSync, auth.accessToken));
    }

    return NextResponse.json({ results, conflicts });
  } catch (error) {
    console.error("Error importing meetings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { importMeetings as POST };
