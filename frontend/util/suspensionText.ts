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
  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const verb = suspensionActive ? "Suspended" : "Suspends";
  const since = suspendedSince ? ` from ${formatDate(suspendedSince)}` : "";
  const until = resumesAt ? ` til ${formatDate(resumesAt)}` : ", indefinitely";
  return `${verb}${since}${until}`;
}
