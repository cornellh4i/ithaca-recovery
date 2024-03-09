import { Document } from 'mongoose';
// Please add models here

interface IUser extends Document {
  uid: string;
  name: string;
}

interface IAdmin extends IUser {
  email: string;
  privilegeMode: string;
}