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
}

export type { IUser, IMeeting, IAdmin };


