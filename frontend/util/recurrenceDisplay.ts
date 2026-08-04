// Shared by the meetings XLSX and PandaDocs lease CSV exports so their "Day" columns
// can never drift apart.

export interface RecurrencePatternLike {
  type: string;
  weekOfMonth: number | null;
  dayOfMonth: number | null;
  daysOfWeek: string[];
}

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_OF_MONTH_ORDINALS = ["1st", "2nd", "3rd", "4th"];

const DAY_ABBREVIATIONS: Record<string, string> = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

// Collapses a set of weekday names into abbreviated ranges in week order, e.g.
// [Monday, Tuesday, Wednesday, Friday] -> "M-W, F".
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
  return runs
    .map((run) => {
      const first = DAY_ABBREVIATIONS[run[0]] ?? run[0];
      if (run.length < 2) return first;
      const last = DAY_ABBREVIATIONS[run[run.length - 1]] ?? run[run.length - 1];
      return `${first}-${last}`;
    })
    .join(", ");
}

export function formatDayColumn(pattern: RecurrencePatternLike | null): string {
  if (!pattern) return "One-time";

  if (pattern.type === "monthly") {
    if (pattern.weekOfMonth != null) {
      const ordinal = pattern.weekOfMonth === -1
        ? "Last"
        : WEEK_OF_MONTH_ORDINALS[pattern.weekOfMonth - 1] ?? `${pattern.weekOfMonth}th`;
      const dayName = (pattern.daysOfWeek ?? [])[0] ?? "";
      const day = DAY_ABBREVIATIONS[dayName] ?? dayName;
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

export function formatFrequencyColumn(pattern: RecurrencePatternLike | null): string {
  if (!pattern) return "";
  if (pattern.type === "monthly") return "Monthly";
  if (pattern.type === "weekly") return "Weekly";
  return "";
}

// ViewMeeting's recurrence line: "Weekly · Mon, Wed". A pattern that occurs every day of the
// week collapses to just "Daily" -- formatDayColumn already returns that string for
// daysOfWeek.length === 7, so the frequency word would otherwise be a redundant "Weekly · Daily".
export function formatRecurrencePattern(pattern: RecurrencePatternLike | null): string {
  if (!pattern) return "";
  const day = formatDayColumn(pattern);
  if (pattern.type !== "monthly" && (pattern.daysOfWeek ?? []).length === 7) return day;
  const frequency = formatFrequencyColumn(pattern);
  return day ? `${frequency} · ${day}` : frequency;
}
