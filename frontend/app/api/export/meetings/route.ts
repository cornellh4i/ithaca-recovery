import * as XLSX from "xlsx";
import { PrismaClient, Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_OF_MONTH_ORDINALS = ["1st", "2nd", "3rd", "4th"];

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

// Collapses a set of weekday names into ranges in week order, e.g.
// [Monday, Tuesday, Wednesday, Friday] -> "Monday-Wednesday, Friday".
function collapseDayRuns(days: string[]): string {
  const sorted = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const runs: string[][] = [];
  for (const day of sorted) {
    const dayIndex = DAY_ORDER.indexOf(day);
    const currentRun = runs[runs.length - 1];
    const runEndIndex = currentRun ? DAY_ORDER.indexOf(currentRun[currentRun.length - 1]) : -2;
    if (currentRun && dayIndex === runEndIndex + 1) {
      currentRun.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs.map((run) => (run.length >= 2 ? `${run[0]}-${run[run.length - 1]}` : run[0])).join(", ");
}

function formatDayColumn(pattern: MeetingWithRecurrence["recurrencePattern"]): string {
  if (!pattern) return "One-time";

  if (pattern.type === "monthly") {
    if (pattern.weekOfMonth != null) {
      const ordinal = pattern.weekOfMonth === -1
        ? "Last"
        : WEEK_OF_MONTH_ORDINALS[pattern.weekOfMonth - 1] ?? `${pattern.weekOfMonth}th`;
      const day = (pattern.daysOfWeek ?? [])[0] ?? "";
      return `${ordinal} ${day}`.trim();
    }
    if (pattern.dayOfMonth != null) return `Day ${pattern.dayOfMonth}`;
    return "Monthly";
  }

  const days = pattern.daysOfWeek ?? [];
  if (days.length === 7) return "Daily";
  if (days.length === 0) return "";
  return collapseDayRuns(days);
}

function formatFrequencyColumn(pattern: MeetingWithRecurrence["recurrencePattern"]): string {
  if (!pattern) return "";
  if (pattern.type === "monthly") return "Monthly";
  if (pattern.type === "weekly") return "Weekly";
  return "";
}

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
      Category: meeting.calType.map((c) => CATEGORY_LABELS[c] ?? c).join(", "),
      Day: formatDayColumn(meeting.recurrencePattern),
      Frequency: formatFrequencyColumn(meeting.recurrencePattern),
      "Start Date": formatETDate(meeting.startDateTime),
      "Start Time": formatETTime(meeting.startDateTime),
      "End Date": formatETDate(meeting.endDateTime),
      "End Time": formatETTime(meeting.endDateTime),
      "Location Type": LOCATION_TYPE_LABELS[meeting.modeType] ?? meeting.modeType,
      "Physical Room": meeting.room,
      "Zoom Room": meeting.zoomAccount ?? "",
      "Contact Email": meeting.email,
      Description: meeting.description,
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
