import { getETTimeOfDay } from "../date/timeUtils";

// The subset of a meeting row this comparison reads -- deliberately structural, so both the
// Prisma row (with its included recurrencePattern) and an IMeeting satisfy it without casting.
export interface SharedZoomScheduleRow {
  isRecurring: boolean;
  startDateTime: Date | string;
  endDateTime: Date | string;
  recurrencePattern?: { type: string; interval: number } | null;
}

const etTimeOfDayKey = (value: Date | string): string => {
  const { hour, minute, second } = getETTimeOfDay(new Date(value));
  return `${hour}:${minute}:${second}`;
};

/**
 * Whether every row sharing one Zoom meeting (one zid) can be expressed as a single Zoom
 * series: all weekly, same interval, same ET time-of-day, same duration -- differing only in
 * weekdays, which Zoom holds as the union. Anything else has no single-series representation,
 * so Zoom's schedule is left untouched (services/zoom.ts) and the UI reports the divergence as
 * a pending state rather than an error.
 */
export function isSharedZoomScheduleCompatible(rows: SharedZoomScheduleRow[]): boolean {
  if (rows.length < 2) return true;
  const [reference] = rows;
  if (!reference.isRecurring || !reference.recurrencePattern) return false;
  const referenceInterval = reference.recurrencePattern.interval ?? 1;
  const referenceTime = etTimeOfDayKey(reference.startDateTime);
  const durationOf = (row: SharedZoomScheduleRow) =>
    new Date(row.endDateTime).getTime() - new Date(row.startDateTime).getTime();
  const referenceDuration = durationOf(reference);
  return rows.every((row) =>
    row.isRecurring && row.recurrencePattern && row.recurrencePattern.type === "weekly" &&
    (row.recurrencePattern.interval ?? 1) === referenceInterval &&
    etTimeOfDayKey(row.startDateTime) === referenceTime &&
    durationOf(row) === referenceDuration,
  );
}
