import { GridFSBucketWriteStream } from 'mongodb';

// Please add models here
interface IUser {
  uid: string;
  name: string;
}

interface IAdmin extends IUser {
  email: string;
}

interface IRecurrencePattern {
  id?: string;
  meetingId?: string;
  type: string; 
  startDate: Date;
  endDate?: Date | null;
  numberOfOccurrences?: number | null;
  daysOfWeek?: string[] | null;
  firstDayOfWeek: string; 
  interval: number; // 1 = weekly, 2 = biweekly, etc.
}

interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string; // admin later on [optional]
  group: string; // group interface later on [optional]
  startDateTime: Date;
  endDateTime: Date;
  zoomAccount?: string | null;
  zoomLink?: string | null;
  zid?: string | null;
  type: string;
  room: string;
  pandaDoc?: File | Buffer | GridFSBucketWriteStream | null;
  
  // Optional recurrence pattern (will be null if not recurring)
  recurrencePattern?: IRecurrencePattern | null;
  
  isRecurring?: boolean;
  recurrenceType?: string;
  recurrenceInterval?: number;
  recurrenceStartDate?: Date;
  recurrenceEndDate?: Date | null;
  recurrenceOccurrences?: number | null;
  recurrenceDaysOfWeek?: string[];
  recurrenceFirstDay?: string;
}

export type { IUser, IMeeting, IAdmin, IRecurrencePattern };