// Pure helpers for deciding how a selectedDate change should animate on mobile -- shared by
// every trigger (WeekStrip tap, WeekStrip swipe, DayColumn swipe, mini-calendar pick) so "all
// three produce the same visual transition" holds by construction, not by convention.

import { formatETDateString } from "./timeUtils";
import { getFirstDayOfWeek } from "./weekDates";

export type SwipeDirection = "forward" | "backward";

// "forward" = later date (the swipe-left / next-day direction); "backward" = earlier date.
// A same-day "change" (no real difference) defaults to "forward" -- direction is meaningless
// when nothing moved; callers that care about the no-op case check date equality separately.
export const getSwipeDirection = (from: Date, to: Date): SwipeDirection =>
    to.getTime() >= from.getTime() ? "forward" : "backward";

// True when `from` and `to` fall in the same ET week (Sunday-Saturday).
export const isSameWeek = (from: Date, to: Date): boolean =>
    formatETDateString(getFirstDayOfWeek(from)) === formatETDateString(getFirstDayOfWeek(to));
