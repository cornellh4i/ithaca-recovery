// Shared by ConflictList.tsx (Diagnostics conflicts panel) and ConflictOverrideModal.tsx
// (save-time room/zoomRoom conflict modal) -- pulled out to a neutral module rather than
// exported from ConflictList.tsx directly, since ConflictList also imports EditMeetingSidebar
// (for its inline edit panel) and EditMeetingSidebar itself needs these types, which would
// otherwise create a circular import between admin/ConflictList.tsx and meeting-form/EditMeeting.tsx.
import { formatDayColumn } from "./recurrenceDisplay";
import { formatCompactTimeRange } from "./timeFormat";

export interface ConflictRecurrenceSummary {
  type: string;
  interval: number;
  daysOfWeek: string[];
  weekOfMonth: number | null;
  dayOfMonth: number | null;
}

export interface ConflictMeetingSummary {
  mid: string;
  title: string;
  calType: string[];
  isRecurring: boolean;
  recurrencePattern: ConflictRecurrenceSummary | null;
  // ISO strings -- this meeting's own occurrence, not the overlap intersection.
  occurrence: { start: string; end: string };
}

export interface ConflictListRow {
  field: "room" | "zoomRoom" | "zoomHost";
  value: string;
  // ISO strings -- Dates don't survive JSON as-is.
  overlap: { start: string; end: string };
  meetings: [ConflictMeetingSummary, ConflictMeetingSummary];
}

export const fieldLabel = (field: "room" | "zoomRoom" | "zoomHost"): string => {
  if (field === "room") return "Room";
  if (field === "zoomRoom") return "Zoom Room";
  return "Zoom Host";
};

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what formatCompactTimeRange expects
// -- mirrors ViewMeeting.tsx's etTimeFmt.
const etTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
});

const etWeekday = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date);

const etDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(date);

const compactTimeRange = (start: Date, end: Date): string =>
  formatCompactTimeRange(etTimeFmt.format(start), etTimeFmt.format(end));

// "Overlap: Tue 7-8PM · next occurs Jul 14, 2026" if any meeting recurs, or
// "Overlap: Fri 6-7PM (single occurrence) · Sep 12, 2026" when all of them are one-time.
// Takes a plain array, not ConflictListRow's own 2-tuple -- ConflictList.tsx also calls this
// with a resource group's deduped meetings, which can be 3+ when several meetings share one
// room/zoomRoom/zoomHost.
export const formatOverlapSummary = (overlap: ConflictListRow["overlap"], meetings: ConflictMeetingSummary[]): string => {
  const start = new Date(overlap.start);
  const end = new Date(overlap.end);
  const bothOneTime = meetings.every((m) => !m.isRecurring);
  const timeRange = `${etWeekday(start)} ${compactTimeRange(start, end)}`;
  const dateLabel = etDate(start);
  return bothOneTime
    ? `Overlap: ${timeRange} (single occurrence) · ${dateLabel}`
    : `Overlap: ${timeRange} · next occurs ${dateLabel}`;
};

// "Weekly · Tue · 7-8PM", "Monthly · 2nd Fri · 7-8PM", or "One-time meeting · 7-8PM" -- mirrors
// ViewMeeting.tsx's getRecurrenceText, reusing the same Day-column formatter as the XLSX/lease
// exports. The time shown is this meeting's own occurrence, not the overlap window above, since
// the two can differ (e.g. 6-8PM vs. 7-9PM overlapping 7-8PM).
export const formatMeetingSchedule = (meeting: ConflictMeetingSummary): string => {
  const { recurrencePattern, occurrence } = meeting;
  const time = compactTimeRange(new Date(occurrence.start), new Date(occurrence.end));
  if (!recurrencePattern) return `One-time meeting · ${time}`;

  const day = formatDayColumn(recurrencePattern);
  if (recurrencePattern.type === "monthly") {
    return `${day ? `Monthly · ${day}` : "Monthly"} · ${time}`;
  }

  let intervalText = "Weekly";
  if (recurrencePattern.interval === 2) intervalText = "Biweekly";
  else if (recurrencePattern.interval === 3) intervalText = "Triweekly";
  else if (recurrencePattern.interval > 1) intervalText = `Every ${recurrencePattern.interval} weeks`;
  return `${day ? `${intervalText} · ${day}` : intervalText} · ${time}`;
};
