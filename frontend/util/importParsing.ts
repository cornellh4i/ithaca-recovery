import { z } from "zod";
import { randomUUID } from "crypto";
import { convertETToUTC } from "./timeUtils";
import { IMeeting, IRecurrencePattern } from "./models";

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_OF_MONTH_ORDINALS = ["1st", "2nd", "3rd", "4th"];

const DAY_NAME_BY_ABBREVIATION: Record<string, string> = {
  Su: "Sunday", M: "Monday", Tu: "Tuesday", W: "Wednesday", Th: "Thursday", F: "Friday", Sa: "Saturday",
};

// Accepts either the abbreviated form the Export tab produces ("M", "Tu") or a spelled-out
// day name/prefix from a manually-authored sheet ("Monday", "Mon").
function resolveDayName(token: string): string | null {
  const trimmed = token.trim();
  if (DAY_NAME_BY_ABBREVIATION[trimmed]) return DAY_NAME_BY_ABBREVIATION[trimmed];
  const match = DAY_ORDER.find((day) => day.toLowerCase() === trimmed.toLowerCase()
    || day.toLowerCase().startsWith(trimmed.toLowerCase()));
  return match ?? null;
}

function expandDayRange(token: string): string[] | null {
  const parts = token.split("-").map((p) => p.trim());
  if (parts.length === 1) {
    const day = resolveDayName(parts[0]);
    return day ? [day] : null;
  }
  if (parts.length === 2) {
    const startDay = resolveDayName(parts[0]);
    const endDay = resolveDayName(parts[1]);
    if (!startDay || !endDay) return null;
    const startIndex = DAY_ORDER.indexOf(startDay);
    const endIndex = DAY_ORDER.indexOf(endDay);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;
    return DAY_ORDER.slice(startIndex, endIndex + 1);
  }
  return null;
}

type ParsedDay =
  | { kind: "weekly"; daysOfWeek: string[] }
  | { kind: "monthlyWeekday"; weekOfMonth: number; daysOfWeek: string[] }
  | { kind: "monthlyDayOfMonth"; dayOfMonth: number }
  | { kind: "oneTime" };

// Inverse of util/recurrenceDisplay.ts's formatDayColumn — same grammar, read backwards.
function parseDayColumn(dayRaw: string, frequency: string): ParsedDay | { error: string } {
  const day = dayRaw.trim();
  const freq = frequency.trim().toLowerCase();

  if (day.toLowerCase() === "one-time" || (!freq && !day)) return { kind: "oneTime" };

  if (freq === "monthly") {
    const dayOfMonthMatch = day.match(/^Day\s+(\d{1,2})$/i);
    if (dayOfMonthMatch) return { kind: "monthlyDayOfMonth", dayOfMonth: parseInt(dayOfMonthMatch[1], 10) };

    const nthMatch = day.match(/^(1st|2nd|3rd|4th|Last)\s+(\S+)$/i);
    if (nthMatch) {
      const [, ordinalRaw, dayToken] = nthMatch;
      const weekOfMonth = ordinalRaw.toLowerCase() === "last"
        ? -1
        : WEEK_OF_MONTH_ORDINALS.indexOf(
            WEEK_OF_MONTH_ORDINALS.find((o) => o.toLowerCase() === ordinalRaw.toLowerCase()) ?? "",
          ) + 1;
      const dayName = resolveDayName(dayToken);
      if (!dayName || weekOfMonth === 0) return { error: `Unrecognized monthly Day value "${dayRaw}"` };
      return { kind: "monthlyWeekday", weekOfMonth, daysOfWeek: [dayName] };
    }

    return { error: `Unrecognized monthly Day value "${dayRaw}"` };
  }

  if (freq === "weekly") {
    if (day.toLowerCase() === "daily") return { kind: "weekly", daysOfWeek: [...DAY_ORDER] };
    if (!day) return { error: "Weekly meeting is missing a Day value" };

    const tokens = day.split(",").map((t) => t.trim()).filter(Boolean);
    const days = new Set<string>();
    for (const token of tokens) {
      const expanded = expandDayRange(token);
      if (!expanded) return { error: `Unrecognized Day value "${token}"` };
      expanded.forEach((d) => days.add(d));
    }
    if (days.size === 0) return { error: `Unrecognized Day value "${dayRaw}"` };
    return { kind: "weekly", daysOfWeek: [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)) };
  }

  return { error: `Unrecognized Frequency value "${frequency}"` };
}

// "Times without AM/PM are treated as AM; 12:00 PM = noon" — standard 12-hour parsing, with a
// missing meridiem defaulting to AM (so a bare "12:00" is midnight, matching that rule).
function parseTimeOfDay(raw: string | Date): { hour: number; minute: number } | null {
  // A time-only Excel cell can come back from xlsx as a Date (epoch date + wall-clock time)
  // when read with cellDates:true — read the ET wall-clock hour/minute directly off it.
  if (raw instanceof Date) {
    return { hour: raw.getHours(), minute: raw.getMinutes() };
  }

  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if ((meridiem === "AM" || !meridiem) && hour === 12) hour = 0;

  return { hour, minute };
}

// Accepts "MM/DD/YYYY" (what the Export tab writes) or "YYYY-MM-DD", or a real Date (xlsx
// returns one when the source cell is Excel-formatted as a date and read with cellDates:true).
function parseCalendarDate(raw: string | Date): { year: number; month: number; day: number } | null {
  if (raw instanceof Date) {
    return { year: raw.getFullYear(), month: raw.getMonth() + 1, day: raw.getDate() };
  }
  const trimmed = raw.trim();
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return { year: Number(slash[3]), month: Number(slash[1]), day: Number(slash[2]) };
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  return null;
}

function toETInstant(date: { year: number; month: number; day: number }, time: { hour: number; minute: number }): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const etDateTime = `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(time.hour)}:${pad(time.minute)}:00`;
  return new Date(convertETToUTC(etDateTime));
}

const cellValue = z.union([z.string(), z.number(), z.date()]).transform((v) => (v instanceof Date ? v : String(v)));

export const importRowSchema = z.object({
  "Meeting Name": z.string().min(1, "Meeting Name is required"),
  Status: z.string().optional(),
  Category: z.string().min(1, "Category is required"),
  Day: cellValue.optional(),
  Frequency: cellValue.optional(),
  "Start Date": cellValue,
  "Start Time": cellValue,
  "End Time": cellValue,
  "Location Type": z.string().min(1, "Location Type is required"),
  "Physical Room": z.string().optional(),
  "Zoom Room": z.string().optional(),
  "Contact Email": z.string().min(1, "Contact Email is required"),
  Description: z.string().optional(),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export type ParsedImportRow = {
  meeting: IMeeting;
  recurrencePattern: IRecurrencePattern | null;
};

export type ParseImportRowResult =
  | { ok: true; row: ParsedImportRow }
  | { ok: false; error: string };

// Parses one raw spreadsheet row (already shaped by importRowSchema) into an IMeeting +
// optional IRecurrencePattern, implementing the parsing rules from the Ticket B spec: category
// split, Day/Frequency recurrence decoding (see parseDayColumn above), AM/PM-less time
// defaulting to AM, Location Type relabeling, room fallback, first-listed email.
export function parseImportRow(rawRow: unknown, rowIndex: number): ParseImportRowResult {
  const fail = (message: string): { ok: false; error: string } => ({ ok: false, error: `Row ${rowIndex + 1}: ${message}` });

  const parsed = importRowSchema.safeParse(rawRow);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const row = parsed.data;

  const calType = row.Category.split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (calType.length === 0) {
    return fail("Category is required");
  }

  const modeType = row["Location Type"];

  const physicalRoom = (row["Physical Room"] ?? "").trim();
  const zoomRoomRaw = (row["Zoom Room"] ?? "").trim();
  const room = physicalRoom || zoomRoomRaw;
  if (!room) {
    return fail("Row has neither a Physical Room nor a Zoom Room");
  }

  const email = (row["Contact Email"] ?? "")
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean)[0];
  if (!email) {
    return fail("Contact Email is required");
  }

  const startDate = parseCalendarDate(row["Start Date"]);
  if (!startDate) {
    return fail(`Unrecognized Start Date "${String(row["Start Date"])}"`);
  }
  const startTime = parseTimeOfDay(row["Start Time"]);
  const endTime = parseTimeOfDay(row["End Time"]);
  if (!startTime || !endTime) {
    return fail("Unrecognized Start Time or End Time");
  }

  const startDateTime = toETInstant(startDate, startTime);
  const endDateTime = toETInstant(startDate, endTime);
  if (endDateTime <= startDateTime) {
    return fail("End Time must be after Start Time");
  }

  const dayStr = typeof row.Day === "string" ? row.Day : "";
  const frequencyStr = typeof row.Frequency === "string" ? row.Frequency : "";
  const parsedDay = parseDayColumn(dayStr, frequencyStr);
  if ("error" in parsedDay) {
    return fail(parsedDay.error);
  }

  const mid = randomUUID();
  const baseMeeting: Omit<IMeeting, "isRecurring" | "recurrencePattern"> = {
    title: row["Meeting Name"],
    mid,
    description: row.Description ?? "",
    creator: "Import",
    group: "Group", // matches the placeholder value the New Meeting form itself submits
    startDateTime,
    endDateTime,
    email,
    zoomRoom: zoomRoomRaw || null,
    room,
    calType,
    modeType,
    status: row.Status?.trim() || "Active",
  };

  if (parsedDay.kind === "oneTime") {
    return {
      ok: true,
      row: { meeting: { ...baseMeeting, isRecurring: false, recurrencePattern: null }, recurrencePattern: null },
    };
  }

  const recurrencePattern: IRecurrencePattern =
    parsedDay.kind === "weekly"
      ? {
          type: "weekly",
          startDate: startDateTime,
          endDate: null,
          daysOfWeek: parsedDay.daysOfWeek,
          firstDayOfWeek: "Sunday",
          interval: 1,
        }
      : parsedDay.kind === "monthlyWeekday"
        ? {
            type: "monthly",
            startDate: startDateTime,
            endDate: null,
            daysOfWeek: parsedDay.daysOfWeek,
            weekOfMonth: parsedDay.weekOfMonth,
            firstDayOfWeek: "Sunday",
            interval: 1,
          }
        : {
            type: "monthly",
            startDate: startDateTime,
            endDate: null,
            dayOfMonth: parsedDay.dayOfMonth,
            firstDayOfWeek: "Sunday",
            interval: 1,
          };

  return {
    ok: true,
    row: {
      meeting: { ...baseMeeting, isRecurring: true, recurrencePattern },
      recurrencePattern,
    },
  };
}
