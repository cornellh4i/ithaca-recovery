// Shared calendar/mode-tag and room-key filtering logic used by both DailyView and
// WeeklyView, so the two views can't drift apart on what a filter key or tag means.

export type MeetingFilters = Record<string, boolean>;

// Keys mirror MeetingsFilter's Location + Zoom Rooms groups.
const ROOM_FILTER_KEYS = [
    'SerenityRoom', 'SeedsofHopeRoom', 'UnityRoom', 'RoomforImprovement', 'RoomforAcceptance', 'RoomforGratitude',
    'SerenityRoomZoom', 'SeedsofHopeRoomZoom', 'UnityRoomZoom', 'RoomforImprovementZoom', "Children'sRoom@518Zoom",
];

// Keys mirror MeetingsFilter's Calendar + Mode groups.
const CATEGORY_FILTER_KEYS = ['AA', 'AlAnon', 'Other', 'InPerson', 'Hybrid', 'Remote'];

/**
 * Builds a default MeetingsFilter state. Category filters always default on; room
 * filters default per `roomsEnabled` — Week view defaults rooms off (opt-in) since
 * showing every room at once produces too many overlapping meetings, while Day view
 * defaults rooms on.
 */
export const createDefaultFilters = (roomsEnabled: boolean): MeetingFilters => {
    const filters: MeetingFilters = {};
    ROOM_FILTER_KEYS.forEach(key => { filters[key] = roomsEnabled; });
    CATEGORY_FILTER_KEYS.forEach(key => { filters[key] = true; });
    return filters;
};

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
