import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { formatRecurrencePattern } from "../../../../util/recurrenceDisplay";
import {
  ALL_MEETING_EXPORT_FIELD_KEYS,
  sanitizeMeetingExportFields,
  type MeetingExportFieldKey,
} from "../../../../util/meetingExportFields";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { deletedAt: null };

const CATEGORY_LABELS: Record<string, string> = {
  "Al-Anon": "AL_ANON",
  Other: "OTHER",
};

const LOCATION_TYPE_LABELS: Record<string, string> = {
  Hybrid: "HYBRID",
  Remote: "ONLINE_ONLY",
  "In Person": "IN_PERSON",
};

type MeetingWithRecurrence = Awaited<ReturnType<typeof loadMeetings>>[number];

function formatETDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
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

// One entry per optional field key -- the export route and the config UI both derive their
// column list from util/meetingExportFields.ts, so this is the only place that needs to know
// how to actually compute a given field's cell value.
const FIELD_COLUMN: Record<MeetingExportFieldKey, { label: string; value: (m: MeetingWithRecurrence) => string }> = {
  status: { label: "Status", value: (m) => m.status ?? "Active" },
  category: { label: "Category", value: (m) => m.calType.map((c) => CATEGORY_LABELS[c] ?? c).join(", ") },
  locationType: { label: "Location Type", value: (m) => LOCATION_TYPE_LABELS[m.modeType] ?? m.modeType },
  physicalRoom: { label: "Physical Room", value: (m) => m.room },
  zoomRoom: { label: "Zoom Room", value: (m) => m.zoomRoom ?? "" },
  zoomLink: { label: "Zoom Link", value: (m) => m.zoomLink ?? "" },
  zoomHost: { label: "Zoom Host", value: (m) => m.zoomHost ?? "" },
  description: { label: "Description", value: (m) => m.description },
  // Bundled rather than two separate Day/Frequency columns -- an every-day pattern used to
  // render as the contradictory "Daily" (Day) / "Weekly" (Frequency) pair; this reuses the
  // same recurrence-summary logic as ViewMeeting.tsx's own recurrence line.
  dayFrequency: { label: "Day / Frequency", value: (m) => formatRecurrencePattern(m.recurrencePattern) },
  startDate: { label: "Start Date", value: (m) => formatETDate(m.startDateTime) },
  startTime: { label: "Start Time", value: (m) => formatETTime(m.startDateTime) },
  endDate: { label: "End Date", value: (m) => formatETDate(m.endDateTime) },
  endTime: { label: "End Time", value: (m) => formatETTime(m.endDateTime) },
  contactEmail: { label: "Contact Email", value: (m) => m.email },
};

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

    const [meetings, settings] = await Promise.all([
      loadMeetings(),
      prisma.meetingExportSettings.findFirst(),
    ]);
    const selectedFields = new Set(
      settings ? sanitizeMeetingExportFields(settings.fields) : ALL_MEETING_EXPORT_FIELD_KEYS,
    );

    const rows = meetings.map((meeting, i) => {
      // Meeting ID and Meeting Name are never optional -- everything else is only included if
      // selected, in the same order as the field registry (matching the config UI's grouping).
      const row: Record<string, string> = {
        "Meeting ID": `M${String(i + 1).padStart(3, "0")}`,
        "Meeting Name": meeting.title,
      };
      for (const key of ALL_MEETING_EXPORT_FIELD_KEYS) {
        if (selectedFields.has(key)) {
          const column = FIELD_COLUMN[key];
          row[column.label] = column.value(meeting);
        }
      }
      return row;
    });

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
