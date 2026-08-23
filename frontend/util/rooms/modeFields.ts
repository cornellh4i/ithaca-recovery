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
 *
 * One mode in gives exactly what that mode needs (the meeting form's own Room / Zoom room /
 * Zoom host block). Several modes in gives the superset, which is what a section whose mode is
 * still being picked needs: the fields stay mounted across every choice still open there, so
 * nothing remounts (and no value is silently dropped) as the admin toggles between them, and
 * there is no disabled/greyed intermediate state to build.
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
 * Which of the mounted fields every one of `modes` needs -- the intersection, i.e. the ones that
 * are required whichever mode is ultimately picked. Identical to {@link modeFieldVisibility} for
 * a single mode; narrower for a set (Room is mounted for an In Person / Remote choice, but only
 * required if In Person wins).
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
