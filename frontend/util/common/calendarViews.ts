// Which views the desktop calendar's view switcher offers.
//
// Month view (GitHub #457) lands over several tickets, so until the last one (#462) it is
// development-only: `yarn dev` (and the e2e suite, which runs against it) sees the "Month"
// option, production builds never do -- same rollout approach the Backups admin tab used.
// process.env.NODE_ENV is inlined at build time, so a production bundle drops the option
// entirely rather than hiding it at runtime.
export const isMonthViewEnabled = (nodeEnv: string | undefined = process.env.NODE_ENV): boolean =>
  nodeEnv === "development";

// Signage keeps this Day/Week pair regardless (a wall display has no Month mode -- see
// CalendarNavbar's `views` prop), so it's exported on its own.
export const DAY_WEEK_VIEWS: readonly string[] = ["Day", "Week"];

/** Views the main calendar's desktop switcher lists, in display order. */
export const getDesktopCalendarViews = (nodeEnv?: string): readonly string[] =>
  isMonthViewEnabled(nodeEnv) ? [...DAY_WEEK_VIEWS, "Month"] : DAY_WEEK_VIEWS;
