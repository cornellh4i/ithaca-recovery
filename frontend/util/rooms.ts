// Shared physical-room / Zoom-room options and their default pairing, used by the
// meeting forms (NewMeeting, EditMeeting), WeeklyView's room/zoom-room mismatch tag,
// and DailyView/the signage page (via `defaultRooms` below).

import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "./filterColors";

export const physicalRoomOptions = [
  "Serenity Room",
  "Seeds of Hope Room",
  "Unity Room",
  "Room for Improvement",
  "Room for Acceptance",
  "Room for Gratitude",
];

export const zoomRoomOptions = [
  "Serenity Room - Zoom",
  "Seeds of Hope Room - Zoom",
  "Unity Room - Zoom",
  "Room for Improvement - Zoom",
  "Children's Room @ 518 - Zoom",
];

// Room for Acceptance and Room for Gratitude have no same-named Zoom room (there are
// only 5 Zoom rooms for 6 physical rooms), so they're intentionally absent here — any
// Zoom room assigned to them is never a "default" match.
export const roomToZoomRoom: Record<string, string> = {
  "Serenity Room": "Serenity Room - Zoom",
  "Seeds of Hope Room": "Seeds of Hope Room - Zoom",
  "Unity Room": "Unity Room - Zoom",
  "Room for Improvement": "Room for Improvement - Zoom",
};

/** True if a meeting's Zoom room isn't the default pairing for its physical room. */
export const isZoomRoomMismatched = (room: string, zoomRoom?: string | null): boolean =>
  !!zoomRoom && zoomRoom !== roomToZoomRoom[room];

// Combines the room lists above with their filter colors (util/filterColors.ts) into the
// {name, primaryColor} shape DailyView and the signage page render rooms with, so that
// shape doesn't need its own separately-maintained room list.
export const defaultRooms: { name: string; primaryColor: string }[] = [
  ...physicalRoomOptions.map(name => ({ name, primaryColor: ROOM_COLORS[name] })),
  ...zoomRoomOptions.map(name => ({ name, primaryColor: ZOOM_ROOM_COLOR })),
];
