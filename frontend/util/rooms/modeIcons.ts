import type { IconName } from '../../app/components/ui/displays/Icon';
import type { LinkedScheduleMode } from '../meetings/linkedSchedules';

// Meeting-mode -> icon mapping, shared by every place a mode ("Hybrid", "In Person",
// "Remote") is shown as text, so users learn the association before mobile's BoxText
// drops the label entirely for space (see BoxText.tsx's hideTags prop).
// Keyed by LinkedScheduleMode (type-only import, so no runtime coupling) rather than by loose
// strings: the mode names live in one authoritative list, and adding or renaming one there is a
// compile error here until this map covers it.
const MODE_ICONS: Record<LinkedScheduleMode, IconName> = {
  'In Person': 'location',
  Remote: 'video-call',
  Hybrid: 'co-present',
};

// Null-prototype so lookups for inherited keys (e.g. "constructor", "toString") come back
// undefined instead of resolving to an Object.prototype member. Widened to Record<string, ...>
// because callers look modes up by an arbitrary tag string.
export const MODE_ICON_NAME: Record<string, IconName> = Object.assign(Object.create(null), MODE_ICONS);
