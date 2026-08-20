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

// Mirrors CalendarSidebar.module.scss's .sidebar width and WeekView.module.scss's .timeColumn
// min-width — same manual-sync contract as the Sass breakpoint tokens above.
export const FULL_SIDEBAR_WIDTH = 240;
export const WEEK_TIME_GUTTER_WIDTH = 60;

// The viewport width below which the full sidebar and an unscrolled 7-day week no longer fit
// side by side — the sidebar yields (auto-collapses) before the calendar is forced to scroll
// horizontally. Derived, not hand-picked, so a column/sidebar width change moves it too.
export const SIDEBAR_YIELD_BREAKPOINT =
  FULL_SIDEBAR_WIDTH + WEEK_TIME_GUTTER_WIDTH + 7 * MIN_DAY_COLUMN_WIDTH;

// Auto-re-expand only comfortably past the yield point — the gap is hysteresis so a window
// dragged near the boundary doesn't flap the sidebar cross-fade.
export const SIDEBAR_EXPAND_BREAKPOINT = SIDEBAR_YIELD_BREAKPOINT + 40;
