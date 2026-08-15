// Shared by DiagnosticsTab.tsx's suspended panel and ViewMeeting.tsx's suspended-status row --
// same underlying data (suspendedSince/resumesAt/suspensionActive from retrieve/meeting/[id] and
// the diagnostics route), same phrasing, so a suspended meeting reads identically wherever it's
// shown. "Suspends" (not "Suspended") when the suspension hasn't started yet -- past tense would
// be misleading for a meeting that's still showing normally on the calendar today.
import { formatETLongDate } from "../date/timeUtils";

export function formatSuspensionStatusText(
  suspendedSince: string | Date | null | undefined,
  resumesAt: string | Date | null | undefined,
  suspensionActive: boolean | undefined,
): string {
  // formatETLongDate, not the runtime's default timezone -- these dates are ET-day boundaries
  // (see suspend/resume routes), and the runtime default (UTC on the server, whatever the
  // browser is set to on the client) can shift the displayed date by a day.
  // Guarded: Intl.DateTimeFormat.format() throws a RangeError on an invalid Date, and
  // suspendedSince/resumesAt carry no parseability guarantee beyond the truthy-checks below.
  const formatDate = (value: string | Date) => {
    const date = new Date(value);
    return isNaN(date.getTime()) ? "Invalid Date" : formatETLongDate(date);
  };

  const verb = suspensionActive ? "Suspended" : "Suspends";
  const since = suspendedSince ? ` from ${formatDate(suspendedSince)}` : "";
  const until = resumesAt ? ` til ${formatDate(resumesAt)}` : ", indefinitely";
  return `${verb}${since}${until}`;
}
