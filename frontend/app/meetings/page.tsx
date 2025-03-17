import React from "react";
import { compareMeetings } from "../api/sync/calendar-sync/page";

const MeetingsPage = async() => {
  const meetings = await compareMeetings();
  
  return <div>Look at all meetings here!</div>;
};

export default MeetingsPage;
