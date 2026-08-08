import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import DayPortraitView from "../../app/components/calendar/mobile/DayPortraitView";
import { CalendarProvider } from "../../app/context/CalendarProvider";
import { createDefaultFilters } from "../../util/filters/meetingFilters";

const etNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const renderView = (selectedDate: Date) =>
  render(
    <CalendarProvider>
      <DayPortraitView
        filters={createDefaultFilters(true)}
        selectedDate={selectedDate}
        selectedMeetingID={null}
        setSelectedMeetingID={jest.fn()}
        setSelectedNewMeeting={jest.fn()}
        setAnchorEl={jest.fn()}
        isAdmin={true}
      />
    </CalendarProvider>
  );

describe("DayPortraitView", () => {
  // Each test uses a distinct week -- useWeekMeetings' fetch cache is module-level and
  // shared across tests in this file, so reusing a date would let a later test's assertion
  // silently pass off an earlier test's cached (never-refetched) result.

  it("renders WeekStrip (7 days) above the day grid", async () => {
    renderView(etNoon(2026, 7, 30));

    expect(screen.getAllByRole("button")).toHaveLength(7);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it("renders CalendarHeader's date heading with no Day/Week dropdown or Today/arrow controls", async () => {
    renderView(etNoon(2026, 8, 6));

    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it("fetches the ET week containing selectedDate", async () => {
    renderView(etNoon(2026, 8, 13));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("startDate=2026-08-09");
    expect(url).toContain("endDate=2026-08-15");
  });
});
