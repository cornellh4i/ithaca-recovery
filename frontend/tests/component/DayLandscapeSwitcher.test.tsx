import React, { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import DayLandscapeSwitcher from "../../app/components/calendar/mobile/DayLandscapeSwitcher";
import { roomDisplayName } from "../../app/components/calendar/mobile/DayLandscapeView";
import { CalendarProvider, useCalendarContext } from "../../app/context/CalendarProvider";
import { createDefaultFilters } from "../../util/filters/meetingFilters";

const etDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0));

const baseProps = {
  filters: createDefaultFilters(true),
  selectedDate: etDate(2026, 8, 12),
  selectedMeetingID: null,
  setSelectedMeetingID: jest.fn(),
  setSelectedNewMeeting: jest.fn(),
  setAnchorEl: jest.fn(),
};

// The Day/Multi-Day choice now lives in CalendarProvider and is driven by MobileAppNavigation's
// dropdown, not by any UI inside DayLandscapeSwitcher itself -- this test-only component
// stands in for that dropdown so these tests can force landscapeView without rendering the
// navbar (same "probe/driver" pattern MobileAppNavigation.test.tsx's SelectedDateProbe uses).
const LandscapeViewSetter: React.FC<{ view: "day" | "multiday" }> = ({ view }) => {
  const { setLandscapeView } = useCalendarContext();
  useEffect(() => {
    setLandscapeView(view);
  }, [view, setLandscapeView]);
  return null;
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DayLandscapeSwitcher", () => {
  it("defaults to DayLandscapeView (rooms as rows)", async () => {
    render(
      <CalendarProvider>
        <DayLandscapeSwitcher {...baseProps} />
      </CalendarProvider>
    );

    // DayLandscapeView's room-row structure, not MultiDayLandscapeView's day columns. Appears
    // 3 times now -- one per panel in the vertical drag carousel (prev/current/next day), all
    // showing the same room list regardless of that day's actual meeting data.
    const labels = await screen.findAllByText(roomDisplayName("Serenity Room"));
    expect(labels.length).toBe(3);
  });

  it("renders MultiDayLandscapeView once landscapeView is 'multiday'", () => {
    const { container } = render(
      <CalendarProvider>
        <LandscapeViewSetter view="multiday" />
        <DayLandscapeSwitcher {...baseProps} />
      </CalendarProvider>
    );

    expect(screen.queryByText(roomDisplayName("Serenity Room"))).not.toBeInTheDocument();
    expect(container.querySelectorAll('[class*="dayPanel"]').length).toBeGreaterThan(0);
  });
});
