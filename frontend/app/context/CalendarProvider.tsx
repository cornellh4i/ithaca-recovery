"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { createDefaultFilters, MeetingFilters } from "../../util/meetingFilters";

// Bridges calendar state between HomePage's page content and the globally-mounted AppNavbar
// (ClientLayout.tsx renders them as siblings, not parent/child, so AppNavbar can't just read
// state HomePage owns locally). Provided once in ClientLayout.tsx, wrapping both; HomePage
// consumes it instead of owning this state itself. navHidden/setNavHidden is the mobile
// scroll-hide bridge (written by the mobile day view's scroll listener, read by
// MobileAppNavbar's hide/show CSS) added ahead of the branch that needs it, same as
// selectedDate/filters, so the Provider is the single bridge for all of it.
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
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedView, setSelectedView] = useState<string>("Day");
  // Both views default to every room visible -- see the matching comment on the old
  // HomePage useState this replaced.
  const [dayFilters, setDayFilters] = useState<MeetingFilters>(() => createDefaultFilters(true));
  const [weekFilters, setWeekFilters] = useState<MeetingFilters>(() => createDefaultFilters(true));
  const [navHidden, setNavHidden] = useState(false);

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
    }),
    [selectedDate, selectedView, dayFilters, weekFilters, navHidden]
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
