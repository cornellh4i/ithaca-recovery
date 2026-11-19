// Which views the calendar's view switchers offer.

// Signage keeps this Day/Week pair: its URL contract is ?view=day|week, and a wall display has
// no Month mode (see CalendarNavbar's `views` prop and parseSignageView).
export const DAY_WEEK_VIEWS: readonly string[] = ["Day", "Week"];

// The main calendar's desktop switcher, in display order. Month view (GitHub #457) shipped
// development-only while it landed; #462 removed that gate.
export const DESKTOP_CALENDAR_VIEWS: readonly string[] = [...DAY_WEEK_VIEWS, "Month"];
