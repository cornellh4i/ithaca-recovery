import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import WeekStrip from "../../app/components/calendar/WeekStrip";
import { formatETDateString } from "../../util/timeUtils";

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

describe("WeekStrip", () => {
  it("renders 7 days with 1-letter weekday abbreviations", () => {
    render(<WeekStrip selectedDate={etNoon(2026, 7, 30)} setSelectedDate={jest.fn()} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    // Sun..Sat, first letters
    expect(buttons.map((b) => b.textContent?.[0])).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
  });

  it("marks today (not selected) with the today styling and aria-pressed=false", () => {
    // Selected date is a different day in the same week (Monday), today is Thursday.
    render(<WeekStrip selectedDate={etNoon(2026, 7, 27)} setSelectedDate={jest.fn()} />);

    const todayButton = screen.getByRole("button", { name: /T\s*30/ });
    expect(todayButton).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the selected-and-today day distinctly from a selected-not-today day", () => {
    render(<WeekStrip selectedDate={etNoon(2026, 7, 30)} setSelectedDate={jest.fn()} />);

    const selectedTodayButton = screen.getByRole("button", { name: /T\s*30/ });
    expect(selectedTodayButton).toHaveAttribute("aria-pressed", "true");
  });

  it("calls setSelectedDate with the tapped day's date", () => {
    const setSelectedDate = jest.fn();
    render(<WeekStrip selectedDate={etNoon(2026, 7, 30)} setSelectedDate={setSelectedDate} />);

    fireEvent.click(screen.getByRole("button", { name: /M\s*27/ }));

    expect(setSelectedDate).toHaveBeenCalledTimes(1);
    const calledWith: Date = setSelectedDate.mock.calls[0][0];
    expect(formatETDateString(calledWith)).toBe("2026-07-27");
  });
});
