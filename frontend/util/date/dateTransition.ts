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
// 0.25s easeOut slide+fade" holds by construction, not by convention. Used by
// DayPortraitView.tsx, DayLandscapeView.tsx, DayView.tsx, WeekView.tsx and CalendarHeader.tsx.
// axis/magnitude vary by surface -- Day content/heading slide y (desktop/landscape 12, matching
// each other), Week content/heading slide x (desktop 24/40, matching DayPortraitView's own
// horizontal swipe convention since a week of days reads left-to-right the same way) -- callers
// pass their own combination; there's no single universal default worth guessing at. Spread the
// result directly onto a motion element: `<motion.div key={...} {...dateEnterMotion(direction,
// "y", 12, { alreadyAnimatedByCaller })}>`.
export const dateEnterMotion = (
    direction: SwipeDirection,
    axis: "x" | "y",
    magnitude: number,
    opts: { alreadyAnimatedByCaller?: boolean; reducedMotion?: boolean } = {},
) => {
    const offset = direction === "forward" ? magnitude : -magnitude;
    // Reduced motion skips the enter animation entirely (element appears already in its final
    // state) rather than just shortening/softening it -- matches this codebase's existing
    // prefers-reduced-motion precedent (ToastProvider.tsx, TopLoadingBar.module.scss) and is
    // the simpler, safer reading of the OS preference for a slide, not just a fade.
    const skip = !!opts.alreadyAnimatedByCaller || !!opts.reducedMotion;
    return axis === "y"
        ? {
            initial: skip ? (false as const) : { y: offset, opacity: 0 },
            animate: { y: 0, opacity: 1 },
            transition: { duration: 0.25, ease: "easeOut" as const },
        }
        : {
            initial: skip ? (false as const) : { x: offset, opacity: 0 },
            animate: { x: 0, opacity: 1 },
            transition: { duration: 0.25, ease: "easeOut" as const },
        };
};
