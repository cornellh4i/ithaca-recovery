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
  date: Date;
  startTime: Date;
  fromTime: Date;
  zoomAccount: string;
}

interface IAdmin extends IUser {
  email: string;
  privilegeMode: string;
}

export type { IUser, IMeeting, IAdmin };


