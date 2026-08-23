// Please add models here
import type { Role } from "@prisma/client";

interface IAdmin {
  name: string;
  email: string;
  role: Role;
  googleId?: string | null;
}

interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string; // admin later on [optional]
  lastEditedBy?: string | null; // server-managed: session email of the last admin to save an edit
  zoomManaged?: boolean; // false = the app points at an ICR-owned/external Zoom meeting and never mutates it
  zoomTopic?: string | null; // pinned Zoom display topic; null derives title + mode suffix
  group: string; // group interface later on [optional]
  startDateTime: Date;
  endDateTime: Date;
  email: string;
  zoomRoom?: string | null;
  zoomLink?: string | null;
  zid?: string | null;
  zoomPasscode?: string | null;
  zoomInvitation?: string | null;
  calType: string[];
  modeType: string;
  room: string;
  status?: string;
  // The most recent unresolved suspension's scheduled resume date, populated only by
  // retrieve/meeting/[id] for authenticated callers -- includes one scheduled to start later,
  // not just one already active. null means indefinite, or no suspension at all. Never a source
  // of truth by itself; the backend always derives from SuspensionPeriod.
  resumesAt?: Date | null;
  // The suspension's own start date (SuspensionPeriod.from), same population rules as
  // resumesAt above -- null means no suspension at all.
  suspendedSince?: Date | null;
  // Whether that suspension has actually started (hiding the meeting from the calendar right
  // now) vs. is merely scheduled for a future date. Only meaningful when suspendedSince is
  // non-null.
  suspensionActive?: boolean;
  // Other active rows sharing this meeting's Zoom link (same zid), populated only by
  // retrieve/meeting/[id] for admin sessions -- absent/empty whenever the link is this
  // meeting's alone. Never part of the public payload (util/meetings/publicMeeting.ts).
  sharedWith?: ISharedZoomRow[];
  // Those rows' schedules can't currently be expressed as one Zoom series, so Zoom keeps the
  // schedule it already has until they match again. Same population rules as sharedWith.
  zoomScheduleDiverged?: boolean;
  // This meeting's OTHER schedules in its linked family (Meeting.linkedToMid) -- same
  // population rules as sharedWith, and absent whenever the meeting has no linked schedule.
  // A different question from sharedWith: that one asks whether this Zoom LINK feeds another
  // row (a zid question), this one asks which schedules make up this one meeting.
  linkedSchedules?: ILinkedSchedule[];
  isRecurring: boolean;
  recurrencePattern?: IRecurrencePattern | null;
  googleCalendarEventId?: string | null;
  googleCalendarEventIds?: Record<string, string> | null;
  googleSyncStatus?: string | null;
  googleSyncError?: string | null;
  zoomCalendarEventId?: string | null;
  zoomSyncStatus?: string | null;
  zoomHost?: string | null;
  zoomSyncError?: string | null;
  deletedAt?: Date | null;
  updatedAt?: Date | null;
  // Set true to resubmit a payload that already saw (and was shown) a room/zoomRoom conflict --
  // never persisted, write/update strip it before the Prisma write.
  confirmOverride?: boolean;
}

interface ISharedZoomRow {
  title: string;
  modeType: string;
}

// One member of a meeting's linked-schedule family, as retrieve/meeting/[id] returns it to an
// admin -- everything ScheduleSummaryCard needs to render that schedule read-only, and nothing
// else. The sync statuses are part of it because a family member can legitimately still be
// waiting on Zoom host capacity when the card first renders (its calendar events don't exist
// yet), which the card has to say rather than showing the schedule as already live.
interface ILinkedSchedule {
  mid: string;
  modeType: string;
  room: string;
  zoomRoom: string | null;
  zoomHost: string | null;
  recurrencePattern: IRecurrencePattern | null;
  startDateTime: Date;
  endDateTime: Date;
  googleSyncStatus: string | null;
  zoomSyncStatus: string | null;
}

interface IRecurrencePattern {
  mid?: string;
  type: string;
  startDate: Date; // UTC timestamp of midnight ET on the day the series starts; used for calendar-day boundary checks.
  endDate?: Date | null; // UTC timestamp of 23:59:59 ET on the inclusive last day of the series
  numberOfOccurrences?: number | null;
  daysOfWeek?: string[] | null;
  firstDayOfWeek: string;
  interval: number; // number of frequency units between occurrences (e.g. 2 = biweekly or every 2 months)
  weekOfMonth?: number | null; // 1–4 for Nth weekday, -1 for last; paired with daysOfWeek
  dayOfMonth?: number | null; // 1–31 for fixed day of month
  excludedDates?: Date[] | null;
}

interface IRoomRate {
  room: string;
  rate: number;
  unit: "hr" | "month";
}

interface ILeaseSettings {
  leaseStartDate: Date;
  leaseEndDate: Date;
  rooms: IRoomRate[];
  agentFirstName: string;
  agentLastName: string;
  agentTitle: string;
  agentEmail: string;
  agentPhone: string;
  agentStreetAddress: string;
  agentCity: string;
  agentState: string;
  agentZip: string;
  emailTemplate: string;
}

export type { IAdmin, IMeeting, ISharedZoomRow, ILinkedSchedule, IRecurrencePattern, IRoomRate, ILeaseSettings };