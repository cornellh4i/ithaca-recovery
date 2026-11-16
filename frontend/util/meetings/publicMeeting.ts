import { IMeeting } from "../../types/models";

// Fields safe to serve from unauthenticated or USER-role meeting endpoints (public calendar,
// signage kiosk, ICR's website). Deliberately an allowlist, a new sensitive column added to
// the Meeting model (e.g. another contact/credential field) is excluded by default here.
//
// googleSyncStatus/zoomSyncStatus are deliberately NOT included -- ViewMeeting's status band
// (sync-error/conflict messaging) is admin-only.
export type PublicMeeting = Pick<
  IMeeting,
  | "mid"
  | "title"
  | "description"
  | "startDateTime"
  | "endDateTime"
  | "calType"
  | "modeType"
  | "room"
  | "zoomRoom"
  | "zoomLink"
  | "zid"
  | "zoomPasscode"
  | "zoomInvitation"
  | "isRecurring"
  | "recurrencePattern"
>;

export const toPublicMeeting = (meeting: PublicMeeting): PublicMeeting => ({
  mid: meeting.mid,
  title: meeting.title,
  description: meeting.description,
  startDateTime: meeting.startDateTime,
  endDateTime: meeting.endDateTime,
  calType: meeting.calType,
  modeType: meeting.modeType,
  room: meeting.room,
  zoomRoom: meeting.zoomRoom,
  zoomLink: meeting.zoomLink ?? null,
  zid: meeting.zid ?? null,
  // Same rule as buildEventBody -- a passcode with no link or ID to join is a dangling secret.
  zoomPasscode: meeting.zoomLink?.trim() || meeting.zid ? meeting.zoomPasscode ?? null : null,
  zoomInvitation: meeting.zoomInvitation ?? null,
  isRecurring: meeting.isRecurring,
  recurrencePattern: meeting.recurrencePattern,
});
