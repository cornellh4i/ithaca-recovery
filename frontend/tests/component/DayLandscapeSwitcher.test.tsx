import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DayLandscapeSwitcher from "../../app/components/calendar/mobile/DayLandscapeSwitcher";
import { CalendarProvider } from "../../app/context/CalendarProvider";
import { createDefaultFilters } from "../../util/meetingFilters";

const etDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0));

const baseProps = {
  filters: createDefaultFilters(true),
  selectedDate: etDate(2026, 8, 12),
  selectedMeetingID: null,
  setSelectedMeetingID: jest.fn(),
  setSelectedNewMeeting: jest.fn(),
  setAnchorEl: jest.fn(),
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DayLandscapeSwitcher", () => {
  it("defaults to DayLandscapeView (rooms as rows) with a Day/Week toggle", async () => {
    render(
      <CalendarProvider>
        <DayLandscapeSwitcher {...baseProps} />
      </CalendarProvider>
    );

    expect(screen.getByRole("tab", { name: "Day" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "false");
    // DayLandscapeView's room-row structure, not MultiDayLandscapeView's day columns.
    expect(await screen.findByText("Serenity Room")).toBeInTheDocument();
  });

  it("switches to MultiDayLandscapeView when Week is tapped", async () => {
    render(
      <CalendarProvider>
        <DayLandscapeSwitcher {...baseProps} />
      </CalendarProvider>
    );

    fireEvent.click(screen.getByRole("tab", { name: "Week" }));

    expect(screen.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Serenity Room")).not.toBeInTheDocument();
  });
});
