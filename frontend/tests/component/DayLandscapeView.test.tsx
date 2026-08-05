import React from "react";
import { render, screen } from "@testing-library/react";
import DayLandscapeView from "../../app/components/calendar/mobile/DayLandscapeView";
import { createDefaultFilters } from "../../util/meetingFilters";
import { defaultRooms } from "../../util/rooms";

// Noon ET (UTC-4, matching this repo's other fixed-date component tests, e.g.
// DayPortraitView.test.tsx's etNoon helper).
const etDate = (y: number, m: number, d: number, hourEt: number) => new Date(Date.UTC(y, m - 1, d, hourEt + 4, 0));

const buildProps = (day: number) => ({
  filters: createDefaultFilters(true),
  selectedDate: etDate(2026, 8, day, 12),
  selectedMeetingID: null,
  setSelectedMeetingID: jest.fn(),
  setSelectedNewMeeting: jest.fn(),
  setAnchorEl: jest.fn(),
});

const mockMeetingResponse = (day: number) => ({
  ok: true,
  json: async () => [
    {
      mid: "meeting-1",
      title: "AA Big Book Study",
      startDateTime: etDate(2026, 8, day, 9),
      endDateTime: etDate(2026, 8, day, 10),
      calType: ["AA"],
      modeType: "In Person",
      room: "Serenity Room",
      zoomRoom: null,
      googleSyncStatus: "synced",
      zoomSyncStatus: "not_applicable",
    },
  ],
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DayLandscapeView", () => {
  // Each test uses a distinct day -- fetchMeetingsByDay's cache is module-level and shared
  // across tests in this file, so reusing a date would let a later test's assertion silently
  // pass off an earlier test's cached (never-refetched) result (see DayPortraitView.test.tsx's
  // identical caveat for useWeekMeetings' cache).

  it("renders one row per room, labeled by room name", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockMeetingResponse(10)) as jest.Mock;
    render(<DayLandscapeView {...buildProps(10)} />);

    for (const room of defaultRooms) {
      expect(await screen.findByText(room.name)).toBeInTheDocument();
    }
  });

  it("renders the 7AM-8PM hour header, not the full 24-hour day", () => {
    global.fetch = jest.fn().mockResolvedValue(mockMeetingResponse(11)) as jest.Mock;
    render(<DayLandscapeView {...buildProps(11)} />);

    expect(screen.getByText("7AM")).toBeInTheDocument();
    expect(screen.getByText("8PM")).toBeInTheDocument();
    expect(screen.queryByText("6AM")).not.toBeInTheDocument();
    expect(screen.queryByText("9PM")).not.toBeInTheDocument();
  });

  it("renders a fetched meeting's title only -- no time, no tags (subcompact tier)", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockMeetingResponse(12)) as jest.Mock;
    render(<DayLandscapeView {...buildProps(12)} />);

    const card = await screen.findByTestId("meeting-card-meeting-1");
    expect(card).toHaveTextContent("AA Big Book Study");
    expect(screen.queryByText("9-10AM")).not.toBeInTheDocument();
    expect(screen.queryByText("AA")).not.toBeInTheDocument();
  });
});
