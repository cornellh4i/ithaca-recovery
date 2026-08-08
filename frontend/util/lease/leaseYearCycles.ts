import { formatETDateString } from "../date/timeUtils";

// Lease years run Jul 1 -> Jun 30 (matches util/leaseDefaults.ts's default settings), stored as
// UTC dates like the rest of LeaseSettings.

export interface LeaseYearCycle {
  startDate: Date;
  endDate: Date;
  label: string;
  status: "past" | "current" | "upcoming";
}

// Reads the ET calendar date, not the UTC instant -- the org operates in America/New_York, and
// UTC is ahead of ET, so a raw UTC read would flip "current" to the next lease year several
// hours before it's actually Jul 1 in Ithaca.
export function cycleStartYear(date: Date): number {
  const [yearStr, monthStr] = formatETDateString(date).split("-");
  const year = Number(yearStr);
  return Number(monthStr) >= 7 ? year : year - 1;
}

function buildCycle(startYear: number, currentStartYear: number): LeaseYearCycle {
  const status: LeaseYearCycle["status"] =
    startYear < currentStartYear ? "past" : startYear > currentStartYear ? "upcoming" : "current";
  return {
    startDate: new Date(Date.UTC(startYear, 6, 1)),
    endDate: new Date(Date.UTC(startYear + 1, 5, 30)),
    label: `Jul 1, ${startYear} – Jun 30, ${startYear + 1}`,
    status,
  };
}

// Derives the selectable lease-year cycles from actual meeting activity, rather than hard-coding
// a fixed window: every cycle that has at least one meeting in it, plus the current cycle (even
// if it has no meetings yet) and the cycle after current (so next year's lease can be prepared
// ahead of any meeting data existing in it). The list naturally grows by one cycle each time `now`
// crosses into a new lease year, since both the current cycle and the "one after current" shift
// forward together.
export function computeLeaseYearCycles(meetingDates: Date[], now: Date): LeaseYearCycle[] {
  const currentStartYear = cycleStartYear(now);
  const dataYears = meetingDates.map(cycleStartYear);
  const minDataYear = dataYears.length ? Math.min(...dataYears) : currentStartYear;
  const maxDataYear = dataYears.length ? Math.max(...dataYears) : currentStartYear;

  const firstYear = Math.min(minDataYear, currentStartYear);
  const lastYear = Math.max(maxDataYear, currentStartYear) + 1;

  const cycles: LeaseYearCycle[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    cycles.push(buildCycle(year, currentStartYear));
  }
  return cycles;
}
