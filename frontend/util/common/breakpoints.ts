// JS-side source of truth for responsive breakpoints, mirroring the Sass tokens in
// Variables.module.scss ($breakpoint-phone / $breakpoint-tablet). Sass vars aren't importable
// into TS, so these are kept in sync manually — edit both together.
export const PHONE_BREAKPOINT = 480;
export const TABLET_BREAKPOINT = 768;
export const DESKTOP_BREAKPOINT = 1024;

// Narrowest day-of-meetings column that stays legible at BoxText's compact tier (room + title).
// Shared by desktop WeekView (its .dayColumn min-width in WeekView.module.scss mirrors this —
// edit both together) and mobile MultiDayLandscapeView's fits-how-many-days math.
export const MIN_DAY_COLUMN_WIDTH = 150;

// What the expanded sidebar really costs the calendar, as rendered: the 240px panel
// (CalendarSidebar.module.scss) plus its padding, the collapse-handle strip, and the gap to the
// calendar. Measured from the live layout (window.innerWidth − .viewContainer width with the
// full sidebar mounted) rather than summed from CSS — the naive 240 undercounted by ~108px.
export const FULL_SIDEBAR_ZONE_WIDTH = 348;

// The week view's minimum unscrolled content width, as rendered: 61px time gutter +
// 7 × (MIN_DAY_COLUMN_WIDTH + 1px border) + header slack. Measured (.viewContainer scrollWidth
// with columns pinned at their min) for the same reason as above.
export const WEEK_MIN_CONTENT_WIDTH = 1142;

// The viewport width below which the full sidebar and an unscrolled 7-day week no longer fit
// side by side — the sidebar yields (auto-collapses) before the calendar is forced to scroll
// horizontally. If sidebar or column dimensions change, re-measure the two constants above.
export const SIDEBAR_YIELD_BREAKPOINT = FULL_SIDEBAR_ZONE_WIDTH + WEEK_MIN_CONTENT_WIDTH;

// Auto-re-expand only comfortably past the yield point — the gap is hysteresis so a window
// dragged near the boundary doesn't flap the sidebar cross-fade.
export const SIDEBAR_EXPAND_BREAKPOINT = SIDEBAR_YIELD_BREAKPOINT + 40;
