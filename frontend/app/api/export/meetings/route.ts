import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { formatDayColumn, formatFrequencyColumn } from "../../../../util/recurrenceDisplay";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

type MeetingWithRecurrence = Awaited<ReturnType<typeof loadMeetings>>[number];

function formatETDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

// Combines the per-category GCal event ID map into one cell (e.g. "AA: abc123, Al-Anon: def456").
// Falls back to the legacy singular googleCalendarEventId for meetings synced before the
// per-category map existed, since a "full backup" should still capture those IDs.
function formatGoogleCalendarEventIds(meeting: MeetingWithRecurrence): string {
  const map = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;
  const entries = Object.entries(map).filter(([, id]) => id);
  if (entries.length > 0) {
    return entries.map(([category, id]) => `${category}: ${id}`).join(", ");
  }
  return meeting.googleCalendarEventId ?? "";
}

function formatETTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = (parts.find((p) => p.type === "hour")?.value ?? "12").padStart(2, "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toUpperCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

async function loadMeetings() {
  return prisma.meeting.findMany({
    where: notDeleted,
    include: { recurrencePattern: true },
    orderBy: { startDateTime: "asc" },
  });
}

export const GET = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const meetings = await loadMeetings();

    const rows = meetings.map((meeting, i) => ({
      "Meeting ID": `M${String(i + 1).padStart(3, "0")}`,
      "Meeting Name": meeting.title,
      Status: meeting.status ?? "Active",
      Category: meeting.calType.join(", "),
      Day: formatDayColumn(meeting.recurrencePattern),
      Frequency: formatFrequencyColumn(meeting.recurrencePattern),
      "Start Date": formatETDate(meeting.startDateTime),
      "Start Time": formatETTime(meeting.startDateTime),
      "End Date": formatETDate(meeting.endDateTime),
      "End Time": formatETTime(meeting.endDateTime),
      "Location Type": meeting.modeType,
      "Physical Room": meeting.room,
      "Zoom Room": meeting.zoomRoom ?? "",
      "Contact Email": meeting.email,
      Description: meeting.description,
      "Google Calendar Event ID": formatGoogleCalendarEventIds(meeting),
      "Zoom Meeting ID": meeting.zid ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Meetings");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const filename = `ithaca-recovery-meetings-${date}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting meetings:", error);
    return new Response(JSON.stringify({ error: "Error exporting meetings" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
