import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import DayView from "../../app/components/calendar/desktop/DayView";
import { createDefaultFilters } from "../../util/filters/meetingFilters";

const etNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0));

afterEach(() => {
  jest.restoreAllMocks();
});

const renderView = (selectedDate: Date) =>
  render(
    <DayView
      filters={createDefaultFilters(true)}
      selectedDate={selectedDate}
      setSelectedDate={jest.fn()}
      selectedMeetingID={null}
      setSelectedMeetingID={jest.fn()}
      setSelectedNewMeeting={jest.fn()}
      setAnchorEl={jest.fn()}
    />
  );

describe("DayView loading bar", () => {
  // Regression coverage for #448's bundled scope addition: DayView previously had no isLoading
  // flag at all (unlike WeekView's, which already renders TopLoadingBar via useWeekMeetings),
  // so it showed an empty grid with no indication a fetch was in flight.
  it("shows the loading bar while the day's meetings are being fetched, hides it once resolved", async () => {
    let resolveFetch!: (value: { ok: true; json: () => Promise<unknown[]> }) => void;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    ) as jest.Mock;

    renderView(etNoon(2026, 8, 20));

    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    expect(screen.getByRole("progressbar")).toHaveAccessibleName("Loading meetings");

    resolveFetch({ ok: true, json: async () => [] });

    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
  });
});
