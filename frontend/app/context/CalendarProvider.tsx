"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultFilters, MeetingFilters } from "../../util/meetingFilters";
import { getSwipeDirection, isSameWeek, SwipeDirection } from "../../util/date/weekStripTransition";

// Bridges calendar state between HomePage's page content and the globally-mounted AppNavbar
// (ClientLayout.tsx renders them as siblings, not parent/child, so AppNavbar can't just read
// state HomePage owns locally). Provided once in ClientLayout.tsx, wrapping both; HomePage
// consumes it instead of owning this state itself. navHidden/setNavHidden is the mobile
// scroll-hide bridge (written by the mobile day view's scroll listener, read by
// MobileAppNavbar's hide/show CSS) added ahead of the branch that needs it, same as
// selectedDate/filters, so the Provider is the single bridge for all of it.
//
// transitionDirection/transitionCrossesWeek/changeSelectedDate: the shared animated-date-
// change path for both desktop and mobile -- every date change, from any trigger (desktop
// nav arrows/mini-calendar/day click, WeekStrip tap/swipe, DayColumn swipe, mobile mini-
// calendar pick), goes through changeSelectedDate rather than a raw setter. It derives
// direction/crossesWeek from the *previous* selectedDate before updating, so WeekStrip and
// DayPortraitView (which just react to selectedDate + these fields changing, regardless of
// which trigger caused it) render the same transition no matter the source -- desktop simply
// never reads transitionDirection/transitionCrossesWeek/transitionAlreadyAnimatedByCaller, so
// routing its changes through here too is a no-op for it, not a behavior change. There's
// deliberately no raw setSelectedDate on this context: a desktop call site bypassing
// changeSelectedDate would leave these three fields stale for whatever mobile view mounts
// next after a desktop<->mobile resize (DayPortraitView unmounts/remounts across that
// boundary, but the context itself does not).
//
// transitionAlreadyAnimatedByCaller: set when the caller's own gesture already delivered the
// motion (only DayPortraitView's drag -- the pan itself slides the content into place), so
// consumers that play their own enter transition on every selectedDate change (DayPortraitView's
// per-panel slide-in) know to skip it for that one commit rather than layering a redundant
// second slide right after the drag's. Plain state (not a ref) specifically so it's safe to
// read during render.
interface CalendarContextValue {
  selectedDate: Date;
  selectedView: string;
  setSelectedView: React.Dispatch<React.SetStateAction<string>>;
  dayFilters: MeetingFilters;
  setDayFilters: React.Dispatch<React.SetStateAction<MeetingFilters>>;
  weekFilters: MeetingFilters;
  setWeekFilters: React.Dispatch<React.SetStateAction<MeetingFilters>>;
  navHidden: boolean;
  setNavHidden: React.Dispatch<React.SetStateAction<boolean>>;
  // Which of DayLandscapeView/MultiDayLandscapeView a landscape phone shows -- lives here
  // (not local state in whichever switcher component renders them) specifically so it
  // survives that switcher unmounting/remounting across an orientation round-trip: rotating
  // to portrait and back to landscape shouldn't reset the user's choice.
  landscapeView: "day" | "multiday";
  setLandscapeView: React.Dispatch<React.SetStateAction<"day" | "multiday">>;
  transitionDirection: SwipeDirection;
  transitionCrossesWeek: boolean;
  transitionAlreadyAnimatedByCaller: boolean;
  changeSelectedDate: (newDate: Date, opts?: { alreadyAnimatedByCaller?: boolean }) => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

interface CalendarProviderProps {
  children: React.ReactNode;
  // Test-only override -- real app usage always defaults to today. Lets component tests
  // render WeekStrip/DayPortraitView/MobileAppNavbar against a fixed, deterministic date
  // instead of the real "today" (which would make date-dependent assertions flaky).
  initialDate?: Date;
}

export const CalendarProvider: React.FC<CalendarProviderProps> = ({ children, initialDate }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => initialDate ?? new Date());
  const [selectedView, setSelectedView] = useState<string>("Day");
  // Both views default to every room visible -- see the matching comment on the old
  // HomePage useState this replaced.
  const [dayFilters, setDayFilters] = useState<MeetingFilters>(() => createDefaultFilters(true));
  const [weekFilters, setWeekFilters] = useState<MeetingFilters>(() => createDefaultFilters(true));
  const [navHidden, setNavHidden] = useState(false);
  const [landscapeView, setLandscapeView] = useState<"day" | "multiday">("day");
  const [transitionDirection, setTransitionDirection] = useState<SwipeDirection>("forward");
  const [transitionCrossesWeek, setTransitionCrossesWeek] = useState(false);
  const [transitionAlreadyAnimatedByCaller, setTransitionAlreadyAnimatedByCaller] = useState(false);

  // Ref mirror of selectedDate so changeSelectedDate's identity stays stable (it's handed to
  // framer-motion drag handlers in WeekStrip/DayPortraitView, which don't need to
  // re-subscribe every time the date itself changes).
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const changeSelectedDate = useCallback((newDate: Date, opts?: { alreadyAnimatedByCaller?: boolean }) => {
    const from = selectedDateRef.current;
    setTransitionDirection(getSwipeDirection(from, newDate));
    setTransitionCrossesWeek(!isSameWeek(from, newDate));
    setTransitionAlreadyAnimatedByCaller(!!opts?.alreadyAnimatedByCaller);
    setSelectedDate(newDate);
  }, []);

  const value = useMemo(
    () => ({
      selectedDate,
      selectedView,
      setSelectedView,
      dayFilters,
      setDayFilters,
      weekFilters,
      setWeekFilters,
      navHidden,
      setNavHidden,
      landscapeView,
      setLandscapeView,
      transitionDirection,
      transitionCrossesWeek,
      transitionAlreadyAnimatedByCaller,
      changeSelectedDate,
    }),
    [
      selectedDate,
      selectedView,
      dayFilters,
      weekFilters,
      navHidden,
      landscapeView,
      transitionDirection,
      transitionCrossesWeek,
      transitionAlreadyAnimatedByCaller,
      changeSelectedDate,
    ]
  );

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
};

export function useCalendarContext(): CalendarContextValue {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error("useCalendarContext must be used within a CalendarProvider");
  }
  return context;
}
