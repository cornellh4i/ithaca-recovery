// Shared calendar/mode-tag and room-key filtering logic used by both DailyView and
// WeeklyView, so the two views can't drift apart on what a filter key or tag means.

// Mode tags (In Person / Hybrid / Remote) are mutually exclusive per meeting, unlike
// calendar tags (AA / Al-Anon / Other), which can apply multiple at once.
const modeTagNames = new Set(['InPerson', 'Hybrid', 'Remote']);

// Normalizes a room or tag name into its MeetingsFilter key by stripping spaces/hyphens
// (e.g. "Serenity Room - Zoom" -> "SerenityRoomZoom").
export const normalizeFilterKey = (name: string): string => name.replace(/[-\s]+/g, '');

/**
 * Returns true if a meeting's tags pass the calendar-category and mode filters.
 * A meeting with multiple calendar tags survives once any one of them is checked;
 * mode is a single required tag.
 */
export const passesTagFilters = (tags: string[], filters: Record<string, boolean>): boolean => {
    const normalizedTags = tags.map(normalizeFilterKey);
    const modeTags = normalizedTags.filter(tag => modeTagNames.has(tag));
    const calendarTags = normalizedTags.filter(tag => !modeTagNames.has(tag));

    const passesCalendarFilter =
        calendarTags.length === 0 || calendarTags.some(tag => filters[tag] !== false);
    const passesModeFilter = modeTags.every(tag => filters[tag] !== false);

    return passesCalendarFilter && passesModeFilter;
};

/** Returns true if the given room name's filter is enabled (unset/true counts as enabled). */
export const passesRoomFilter = (roomName: string, filters: Record<string, boolean>): boolean =>
    filters[normalizeFilterKey(roomName)] !== false;
