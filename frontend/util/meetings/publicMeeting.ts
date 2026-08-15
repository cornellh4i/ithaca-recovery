import { IMeeting } from "../../types/models";

// Fields safe to serve from unauthenticated or USER-role meeting endpoints (public calendar +
// signage kiosk). Deliberately an allowlist, a new sensitive column added to
// the Meeting model (e.g. another contact/credential field) is excluded by default here.
//
// googleSyncStatus/zoomSyncStatus are deliberately NOT included -- ViewMeeting's status band
// (sync-error/conflict messaging) is admin-only.
export type PublicMeeting = Pick<
  IMeeting,
  | "mid"
  | "title"
  | "startDateTime"
  | "endDateTime"
  | "calType"
  | "modeType"
  | "room"
  | "zoomRoom"
  | "isRecurring"
  | "recurrencePattern"
>;

export const toPublicMeeting = (meeting: PublicMeeting): PublicMeeting => ({
  mid: meeting.mid,
  title: meeting.title,
  startDateTime: meeting.startDateTime,
  endDateTime: meeting.endDateTime,
  calType: meeting.calType,
  modeType: meeting.modeType,
  room: meeting.room,
  zoomRoom: meeting.zoomRoom,
  isRecurring: meeting.isRecurring,
  recurrencePattern: meeting.recurrencePattern,
});
