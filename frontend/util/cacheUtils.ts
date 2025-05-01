// cacheUtils.ts
import { IMeeting } from "./models";

const meetingCache: Record<string, IMeeting> = {};

export const getCachedMeetingDetails = (meetingId: string): IMeeting | null => {
  return meetingCache[meetingId] || null;
};

export const setCachedMeetingDetails = (meetingId: string, meeting: IMeeting) => {
  meetingCache[meetingId] = meeting;
};

export const clearCache = (meetingId: string) => {
  delete meetingCache[meetingId];
};
