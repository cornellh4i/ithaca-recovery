import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import WeekStrip from "../../app/components/calendar/mobile/WeekStrip";
import { CalendarProvider, useCalendarContext } from "../../app/context/CalendarProvider";
import { formatETDateString } from "../../util/date/timeUtils";

// A fixed "today" (a Thursday) so tests don't depend on when they're run.
const REAL_DATE_NOW = Date.now;
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 6, 30, 16, 0))); // Thu 2026-07-30 noon ET
});
afterAll(() => {
  jest.useRealTimers();
  Date.now = REAL_DATE_NOW;
});

const etNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0));

// Exposes the current context's selectedDate as text so tests can assert what a tap/swipe
// actually did without reaching into WeekStrip's own internals.
const SelectedDateProbe: React.FC = () => {
  const { selectedDate } = useCalendarContext();
  return <div data-testid="selected-date">{formatETDateString(selectedDate)}</div>;
};

const renderStrip = (initialDate: Date) =>
  render(
    <CalendarProvider initialDate={initialDate}>
      <SelectedDateProbe />
      <WeekStrip />
    </CalendarProvider>
  );

describe("WeekStrip", () => {
  it("renders 7 days with 1-letter weekday abbreviations", () => {
    renderStrip(etNoon(2026, 7, 30));

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    // Sun..Sat, first letters
    expect(buttons.map((b) => b.textContent?.[0])).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
  });

  it("marks today (not selected) with aria-pressed=false", () => {
    // Selected date is a different day in the same week (Monday); today is Thursday.
    renderStrip(etNoon(2026, 7, 27));

    const todayButton = screen.getByRole("button", { name: /T\s*30/ });
    expect(todayButton).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the selected-and-today day as selected", () => {
    renderStrip(etNoon(2026, 7, 30));

    const selectedTodayButton = screen.getByRole("button", { name: /T\s*30/ });
    expect(selectedTodayButton).toHaveAttribute("aria-pressed", "true");
  });

  it("tapping a day updates the shared selectedDate", () => {
    renderStrip(etNoon(2026, 7, 30));

    fireEvent.click(screen.getByRole("button", { name: /M\s*27/ }));

    expect(screen.getByTestId("selected-date")).toHaveTextContent("2026-07-27");
  });

  // Swipe-drag gesture behavior (framer-motion's drag="x" + onDragEnd) isn't reliably
  // triggerable via jsdom's fireEvent.pointer* -- framer-motion's own gesture recognition
  // needs real pointer-capture/layout measurement jsdom doesn't provide. Covered instead by
  // a real-browser Playwright spec (tests/e2e/16-mobile-swipe.spec.ts) using
  // page.touchscreen. The underlying direction/same-week math (util/date/dateTransition.ts)
  // has its own unit tests.
});
