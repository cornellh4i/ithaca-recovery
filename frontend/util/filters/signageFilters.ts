import { physicalRoomOptions, zoomRoomOptions } from '../rooms/rooms';

export const SIGNAGE_CAL_TYPES = ['AA', 'Al-Anon', 'Other'];
export const SIGNAGE_MODE_TYPES = ['In Person', 'Hybrid', 'Remote'];

// Short, readable slugs used in the `rooms`/`zoom` URL params instead of the full
// room names, so links stay short. Physical rooms use `rooms`, Zoom accounts use a
// separate `zoom` param. Keyed by the same names as util/rooms.ts's room lists.
export const SIGNAGE_ROOM_SLUGS: Record<string, string> = {
  'Serenity Room': 'Serenity',
  'Seeds of Hope Room': 'Seeds of Hope',
  'Unity Room': 'Unity',
  'Room for Improvement': 'Improvement',
  'Room for Acceptance': 'Acceptance',
  'Room for Gratitude': 'Gratitude',
};

export const SIGNAGE_ZOOM_SLUGS: Record<string, string> = {
  'Serenity Room - Zoom': 'Serenity',
  'Seeds of Hope Room - Zoom': 'Seeds of Hope',
  'Unity Room - Zoom': 'Unity',
  'Room for Improvement - Zoom': 'Improvement',
  "Children's Room @ 518 - Zoom": "Children's Room @ 518",
};

export type SignageFilters = Record<string, boolean>;

export const normalizeKey = (name: string): string =>
  name.replace(/[-\s]+/g, '').replace(/\s+/g, '');

const applyCategory = (
  filters: SignageFilters,
  categoryNames: string[],
  paramValue: string | null
) => {
  if (paramValue === null) {
    categoryNames.forEach(name => { filters[normalizeKey(name)] = true; });
    return;
  }

  const allowed = new Set(
    paramValue.split(',').map(v => normalizeKey(v.trim())).filter(Boolean)
  );
  categoryNames.forEach(name => {
    filters[normalizeKey(name)] = allowed.has(normalizeKey(name));
  });
};

// Same as applyCategory, but also matches each name's short slug (from `slugs`)
// against the param value — the URL carries slugs, not full room names.
const applyRoomCategory = (
  filters: SignageFilters,
  categoryNames: string[],
  slugs: Record<string, string>,
  paramValue: string | null
) => {
  if (paramValue === null) {
    categoryNames.forEach(name => { filters[normalizeKey(name)] = true; });
    return;
  }

  const allowed = new Set(
    paramValue.split(',').map(v => normalizeKey(v.trim())).filter(Boolean)
  );
  categoryNames.forEach(name => {
    const slugKey = normalizeKey(slugs[name] ?? name);
    filters[normalizeKey(name)] = allowed.has(slugKey) || allowed.has(normalizeKey(name));
  });
};

/**
 * Builds the same boolean filter map HomePageLayout's `filters` state uses, from
 * URL query params. A category param that's absent shows everything in that
 * category; present (even as an empty string) allowlists only the listed values.
 * Room names come from util/rooms.ts's `physicalRoomOptions`/`zoomRoomOptions`,
 * split into physical rooms (`rooms` param) and Zoom accounts (`zoom` param).
 *
 * Note: a meeting can belong to multiple calendars (calType is now string[]), but
 * this function only needs to produce a flat per-tag boolean map - DayView's
 * filterMeetings already treats a meeting's calendar tags with OR semantics
 * (shown if ANY of its tags are true here), so no special-casing is needed.
 */
export const parseSignageFilters = (
  searchParams: URLSearchParams
): SignageFilters => {
  const filters: SignageFilters = {};
  applyRoomCategory(filters, physicalRoomOptions, SIGNAGE_ROOM_SLUGS, searchParams.get('rooms'));
  applyRoomCategory(filters, zoomRoomOptions, SIGNAGE_ZOOM_SLUGS, searchParams.get('zoom'));
  applyCategory(filters, SIGNAGE_CAL_TYPES, searchParams.get('types'));
  applyCategory(filters, SIGNAGE_MODE_TYPES, searchParams.get('modes'));
  return filters;
};

export const parseSignageView = (searchParams: URLSearchParams): 'Day' | 'Week' =>
  searchParams.get('view')?.toLowerCase() === 'week' ? 'Week' : 'Day';
