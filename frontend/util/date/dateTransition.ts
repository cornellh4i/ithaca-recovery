// Pure helpers for deciding how a selectedDate change should animate -- shared by every
// trigger, mobile (WeekStrip tap/swipe, DayColumn swipe, mini-calendar pick) and desktop
// (CalendarNavbar's nav arrows/Today/view toggle, DayView/WeekView's own content transition),
// so "every consumer produces the same visual transition" holds by construction, not by
// convention.

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

// Framer-motion props for a date-keyed enter transition (slide + fade) -- shared by every
// content/heading transition tied to a selectedDate change, so "every call site plays the same
// 0.25s easeOut slide+fade" holds by construction, not by convention. Previously hand-copied in
// DayLandscapeView.tsx, DayView.tsx, WeekView.tsx and CalendarHeader.tsx. axis/magnitude vary by
// surface -- mobile-portrait content slides x:24 (DayPortraitView.tsx, not yet migrated to this
// helper), desktop/landscape content and the desktop heading slide y:12, the mobile-portrait
// heading slides x:40 -- callers pass their own combination; there's no single universal default
// worth guessing at. Spread the result directly onto a motion element:
// `<motion.div key={...} {...dateEnterMotion(direction, "y", 12, alreadyAnimated)}>`.
export const dateEnterMotion = (
    direction: SwipeDirection,
    axis: "x" | "y",
    magnitude: number,
    alreadyAnimatedByCaller = false,
) => {
    const offset = direction === "forward" ? magnitude : -magnitude;
    return axis === "y"
        ? {
            initial: alreadyAnimatedByCaller ? (false as const) : { y: offset, opacity: 0 },
            animate: { y: 0, opacity: 1 },
            transition: { duration: 0.25, ease: "easeOut" as const },
        }
        : {
            initial: alreadyAnimatedByCaller ? (false as const) : { x: offset, opacity: 0 },
            animate: { x: 0, opacity: 1 },
            transition: { duration: 0.25, ease: "easeOut" as const },
        };
};
