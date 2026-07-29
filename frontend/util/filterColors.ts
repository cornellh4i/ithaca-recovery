// Shared physical-room / zoom-room / category color coding used by both the calendar
// sidebar filter (MeetingsFilter) and the Export tab's signage filter (SignageUrlCard) —
// keyed by the same full room names used in util/signageFilters.ts, so a color change
// only has to happen in one place.
export const ROOM_COLORS: Record<string, string> = {
  "Serenity Room": "#B3EA75",
  "Seeds of Hope Room": "#F7E57B",
  "Unity Room": "#96DBFE",
  "Room for Improvement": "#FFAE73",
  "Room for Acceptance": "#FFA3C2",
  "Room for Gratitude": "#D2AFFF",
};

export const ZOOM_ROOM_COLOR = "#CECECE";
export const CATEGORY_COLOR = "#CC3366";

// Distinguishes the "Remote" virtual room (util/rooms.ts's defaultRooms) from the grey
// used for a Hybrid meeting's Zoom room -- Remote has no physical presence at all, so
// pairing it with the same grey as a room's Zoom companion would read as if it belonged
// to one of the physical rooms' Zoom pairings.
export const REMOTE_COLOR = "#7ED9C3";
