import type { LinkedScheduleMode } from "../meetings/linkedSchedules";

// Which of the meeting form's three resource fields each mode actually uses. Keyed by
// LinkedScheduleMode (type-only import, so no runtime coupling) for the same reason
// MODE_ICON_NAME is: the mode names live in one authoritative list, and adding or renaming one
// there is a compile error here until this map covers it.
const MODE_FIELDS: Record<LinkedScheduleMode, ModeFieldVisibility> = {
  Hybrid: { room: true, zoomRoom: true, zoomHost: true },
  "In Person": { room: true, zoomRoom: false, zoomHost: false },
  Remote: { room: false, zoomRoom: false, zoomHost: true },
};

/** Which resource fields to mount. See {@link modeFieldVisibility}. */
export interface ModeFieldVisibility {
  room: boolean;
  zoomRoom: boolean;
  zoomHost: boolean;
}

/**
 * The fields a form section must mount to serve ANY of `modes` -- the union, not an intersection.
 * Callers pass the one mode their section currently uses, which yields exactly that mode's
 * fields (the meeting form's own Room / Zoom room / Zoom host block).
 *
 * An unrecognised mode contributes nothing, so an empty or unknown selection mounts no field --
 * the behavior a bare `selectedMode === "Hybrid"`-style check already had.
 */
export function modeFieldVisibility(modes: string[]): ModeFieldVisibility {
  return modes.reduce<ModeFieldVisibility>(
    (union, mode) => {
      const fields = MODE_FIELDS[mode as LinkedScheduleMode];
      if (!fields) return union;
      return {
        room: union.room || fields.room,
        zoomRoom: union.zoomRoom || fields.zoomRoom,
        zoomHost: union.zoomHost || fields.zoomHost,
      };
    },
    { room: false, zoomRoom: false, zoomHost: false },
  );
}

/**
 * Which of the mounted fields every one of `modes` needs -- the intersection. Callers pass the
 * one mode their section currently uses, where this is identical to {@link modeFieldVisibility};
 * for a set it is narrower, since a field only some of the modes use is mounted but not required.
 */
export function modeFieldRequirement(modes: string[]): ModeFieldVisibility {
  const known = modes.filter((mode): mode is LinkedScheduleMode => !!MODE_FIELDS[mode as LinkedScheduleMode]);
  if (known.length === 0) return { room: false, zoomRoom: false, zoomHost: false };
  return known.reduce<ModeFieldVisibility>(
    (all, mode) => ({
      room: all.room && MODE_FIELDS[mode].room,
      zoomRoom: all.zoomRoom && MODE_FIELDS[mode].zoomRoom,
      zoomHost: all.zoomHost && MODE_FIELDS[mode].zoomHost,
    }),
    { room: true, zoomRoom: true, zoomHost: true },
  );
}
