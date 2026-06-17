// Please add models here
interface IUser {
  name: string;
}

interface IAdmin extends IUser {
  email: string;
  googleId?: string | null;
  refreshToken?: string | null;
  accessToken?: string | null;
  tokenExpiresAt?: number | null;
}

interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string; // admin later on [optional]
  group: string; // group interface later on [optional]
  startDateTime: Date;
  endDateTime: Date;
  email: string;
  zoomAccount?: string | null;
  zoomLink?: string | null;
  zid?: string | null;
  calType: string;
  modeType: string;
  room: string;
  isRecurring?: boolean;
  recurrencePattern?: IRecurrencePattern | null;
  googleCalendarEventId?: string | null;
  syncStatus?: string | null;
  deletedAt?: Date | null;
  updatedAt?: Date | null;
}

interface IRecurrencePattern {
  mid?: string;
  type: string;
  startDate: Date;
  endDate?: Date | null;
  numberOfOccurrences?: number | null;
  daysOfWeek?: string[] | null;
  firstDayOfWeek: string;
  interval: number; // 1 = weekly, 2 = biweekly, etc.
  excludedDates?: Date[] | null;
}

export type { IUser, IAdmin, IMeeting, IRecurrencePattern };