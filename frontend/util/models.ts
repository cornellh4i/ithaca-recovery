import { Document } from 'mongoose';
// Please add models here

interface IUser extends Document{
    uid: string;
    name: string;
  }

export default IUser