export const SIGNAGE_CAL_TYPES = ['AA', 'Al-Anon', 'Other'];
export const SIGNAGE_MODE_TYPES = ['In Person', 'Hybrid', 'Remote'];

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

/**
 * Builds the same boolean filter map HomePageLayout's `filters` state uses, from
 * URL query params. A category param that's absent shows everything in that
 * category; present (even as an empty string) allowlists only the listed values.
 * `roomNames` is passed in by the caller (from DailyView's `defaultRooms`) so this
 * module doesn't duplicate the room list or depend on a components/ import.
 *
 * Note: a meeting can belong to multiple calendars (calType is now string[]), but
 * this function only needs to produce a flat per-tag boolean map - DailyView's
 * filterMeetings already treats a meeting's calendar tags with OR semantics
 * (shown if ANY of its tags are true here), so no special-casing is needed.
 */
export const parseSignageFilters = (
  searchParams: URLSearchParams,
  roomNames: string[]
): SignageFilters => {
  const filters: SignageFilters = {};
  applyCategory(filters, roomNames, searchParams.get('rooms'));
  applyCategory(filters, SIGNAGE_CAL_TYPES, searchParams.get('types'));
  applyCategory(filters, SIGNAGE_MODE_TYPES, searchParams.get('modes'));
  return filters;
};

export const parseSignageView = (searchParams: URLSearchParams): 'Day' | 'Week' =>
  searchParams.get('view')?.toLowerCase() === 'week' ? 'Week' : 'Day';
