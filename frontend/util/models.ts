// Please add models here
interface IUser {
  uid: string;
  name: string;
}

interface IAdmin extends IUser {
  email: string;
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
}

interface IRecurrencePattern {
  mid?: string;
  type: string; 
  startDate: Date;
  endDate?: Date | null;
  numberOfOccurences?: number | null;
  daysOfWeek?: string[] | null;
  firstDayOfWeek: string; 
  interval: number; // 1 = weekly, 2 = biweekly, etc.
  excludedDates?: Date[] | null;
}

export type { IUser, IAdmin, IMeeting, IRecurrencePattern };