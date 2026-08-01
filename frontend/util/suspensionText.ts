// Shared by DiagnosticsTab.tsx's suspended panel and ViewMeeting.tsx's suspended-status row --
// same underlying data (suspendedSince/resumesAt/suspensionActive from retrieve/meeting/[id] and
// the diagnostics route), same phrasing, so a suspended meeting reads identically wherever it's
// shown. "Suspends" (not "Suspended") when the suspension hasn't started yet -- past tense would
// be misleading for a meeting that's still showing normally on the calendar today.
export function formatSuspensionStatusText(
  suspendedSince: string | Date | null | undefined,
  resumesAt: string | Date | null | undefined,
  suspensionActive: boolean | undefined,
): string {
  // Explicit America/New_York -- these dates are ET-day boundaries (see suspend/resume routes),
  // and formatting with the runtime's default timezone instead (UTC on the server, whatever the
  // browser is set to on the client) can shift the displayed date by a day.
  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });

  const verb = suspensionActive ? "Suspended" : "Suspends";
  const since = suspendedSince ? ` from ${formatDate(suspendedSince)}` : "";
  const until = resumesAt ? ` til ${formatDate(resumesAt)}` : ", indefinitely";
  return `${verb}${since}${until}`;
}
