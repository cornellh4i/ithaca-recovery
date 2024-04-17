// Please add models here
interface IUser {
  id: string;
  uid: string;
  name: string;
}


interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string; // admin later on
  group: string; // group interface later on
  startDateTime: Date;
  endDateTime: Date;
  zoomAccount: string;
  zoomLink: string;
  zid: string;
  type: string;
  room: string;
}

interface IAdmin extends IUser {
  email: string;
  privilegeMode: string;
}

export type { IUser, IMeeting, IAdmin };


