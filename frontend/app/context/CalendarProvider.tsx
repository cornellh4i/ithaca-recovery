"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultFilters, MeetingFilters } from "../../util/meetingFilters";
import { getSwipeDirection, isSameWeek, SwipeDirection } from "../../util/weekStripTransition";

// Bridges calendar state between HomePage's page content and the globally-mounted AppNavbar
// (ClientLayout.tsx renders them as siblings, not parent/child, so AppNavbar can't just read
// state HomePage owns locally). Provided once in ClientLayout.tsx, wrapping both; HomePage
// consumes it instead of owning this state itself. navHidden/setNavHidden is the mobile
// scroll-hide bridge (written by the mobile day view's scroll listener, read by
// MobileAppNavbar's hide/show CSS) added ahead of the branch that needs it, same as
// selectedDate/filters, so the Provider is the single bridge for all of it.
//
// transitionDirection/transitionCrossesWeek/changeSelectedDate: the shared animated-date-
// change path for mobile. Every trigger that should animate (WeekStrip tap/swipe, DayColumn
// swipe, mini-calendar pick) calls changeSelectedDate instead of setSelectedDate directly --
// it derives direction/crossesWeek from the *previous* selectedDate before updating, so
// WeekStrip and MobileCalendarView (which both just react to selectedDate + these two fields
// changing, regardless of which trigger caused it) render the same transition no matter the
// source. Desktop code keeps using plain setSelectedDate, which never touches these fields.
interface CalendarContextValue {
  selectedDate: Date;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
  selectedView: string;
  setSelectedView: React.Dispatch<React.SetStateAction<string>>;
  dayFilters: MeetingFilters;
  setDayFilters: React.Dispatch<React.SetStateAction<MeetingFilters>>;
  weekFilters: MeetingFilters;
  setWeekFilters: React.Dispatch<React.SetStateAction<MeetingFilters>>;
  navHidden: boolean;
  setNavHidden: React.Dispatch<React.SetStateAction<boolean>>;
  transitionDirection: SwipeDirection;
  transitionCrossesWeek: boolean;
  changeSelectedDate: (newDate: Date) => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

interface CalendarProviderProps {
  children: React.ReactNode;
  // Test-only override -- real app usage always defaults to today. Lets component tests
  // render WeekStrip/MobileCalendarView/MobileAppNavbar against a fixed, deterministic date
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
  const [transitionDirection, setTransitionDirection] = useState<SwipeDirection>("forward");
  const [transitionCrossesWeek, setTransitionCrossesWeek] = useState(false);

  // Ref mirror of selectedDate so changeSelectedDate's identity stays stable (it's handed to
  // framer-motion drag handlers in WeekStrip/MobileCalendarView, which don't need to
  // re-subscribe every time the date itself changes).
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const changeSelectedDate = useCallback((newDate: Date) => {
    const from = selectedDateRef.current;
    setTransitionDirection(getSwipeDirection(from, newDate));
    setTransitionCrossesWeek(!isSameWeek(from, newDate));
    setSelectedDate(newDate);
  }, []);

  const value = useMemo(
    () => ({
      selectedDate,
      setSelectedDate,
      selectedView,
      setSelectedView,
      dayFilters,
      setDayFilters,
      weekFilters,
      setWeekFilters,
      navHidden,
      setNavHidden,
      transitionDirection,
      transitionCrossesWeek,
      changeSelectedDate,
    }),
    [
      selectedDate,
      selectedView,
      dayFilters,
      weekFilters,
      navHidden,
      transitionDirection,
      transitionCrossesWeek,
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
