import { GridFSBucketWriteStream } from 'mongodb';

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
  zoomAccount?: string | null;
  zoomLink?: string | null;
  zid?: string | null;
  type: string;
  room: string;
  pandaDoc?: File | Buffer | GridFSBucketWriteStream | null;

  // Recurrence-related properties
  recurrenceId: string; // Shared across all instances in the recurrence group
  weeklyFrequency?: number; // How often it occurs (1 = weekly, 2 = every other week, etc.)
  recurrenceEndOn?: Date | null; // Optional: The date when the recurrence ends
  recurrenceEndAfter?: number | null; // Optional: The number of occurrences after which it ends
}

export type { IUser, IMeeting, IAdmin };


