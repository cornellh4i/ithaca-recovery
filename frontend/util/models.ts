import { Document } from 'mongoose';
// Please add models here

export interface IUser {
  id: string;
  uid: string;
  name: string;
}

export interface IAdmin extends IUser {
  email: string;
  privilegeMode: string;
}