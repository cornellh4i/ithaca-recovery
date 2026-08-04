import { IMeeting } from "./models";

// Fields safe to serve from unauthenticated meeting endpoints (public calendar + signage
// kiosk). Deliberately an allowlist, not a blacklist -- a new sensitive column added to the
// Meeting model (e.g. another contact/credential field) is excluded by default here instead
// of leaking until someone remembers to blacklist it.
//
// googleSyncStatus/zoomSyncStatus are deliberately NOT included -- ViewMeeting's status band
// (sync-error/conflict messaging) is admin-only (BUG-022), and that gate has to hold at the
// API layer too, not just in the UI -- otherwise the raw status still sits in the public JSON
// response, inspectable via the network tab even though nothing renders it.
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
