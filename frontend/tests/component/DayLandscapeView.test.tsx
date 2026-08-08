import React from "react";
import { render, within } from "@testing-library/react";
import DayLandscapeView, { roomDisplayName } from "../../app/components/calendar/mobile/DayLandscapeView";
import { CalendarProvider } from "../../app/context/CalendarProvider";
import { createDefaultFilters } from "../../util/meetingFilters";
import { defaultRooms } from "../../util/rooms";
import { formatETDateString } from "../../util/date/timeUtils";

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

// useScrollNavHide (the mobile-nav-hide-on-scroll hook) requires a CalendarProvider ancestor.
const renderView = (day: number) =>
  render(
    <CalendarProvider>
      <DayLandscapeView {...buildProps(day)} />
    </CalendarProvider>
  );

// This view now fetches 3 days at once (prev/current/next, one call each -- see its own
// vertical-drag-carousel comment), so a mock that ignores which date was actually requested
// would return the same meeting for all 3, appearing 3 times over. Inspects the request URL's
// startDate and only answers with the meeting on the day it's actually scheduled.
const mockFetchMeetingOnDay = (day: number) => {
  const meetingDateStr = formatETDateString(etDate(2026, 8, day, 9));
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const startDate = new URL(url, "http://localhost").searchParams.get("startDate");
    const meetings =
      startDate === meetingDateStr
        ? [
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
          ]
        : [];
    return { ok: true, json: async () => meetings } as Response;
  }) as jest.Mock;
};

const findCurrentDayPanel = (container: HTMLElement, day: number): HTMLElement => {
  const panels = Array.from(container.querySelectorAll('[class*="dayPanel"]'));
  const panel = panels.find((p) => within(p as HTMLElement).queryByText(new RegExp(`Aug ${day}\\b`))) as HTMLElement;
  expect(panel).not.toBeUndefined();
  return panel;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DayLandscapeView", () => {
  // Each test uses a day at least 4 apart from the others -- this view now fetches 3
  // consecutive days per render (prev/current/next), and fetchMeetingsByDay's cache is
  // module-level and shared across tests in this file, so overlapping 3-day windows would let
  // one test's fetch silently populate (or leave empty) another test's cache entry before it
  // gets a chance to fetch it with its own mock (see DayPortraitView.test.tsx's identical
  // caveat for useWeekMeetings' cache).

  it("renders one row per room, labeled by its (possibly truncated) display name", async () => {
    mockFetchMeetingOnDay(10);
    const { container } = renderView(10);

    const currentPanel = findCurrentDayPanel(container, 10);
    for (const room of defaultRooms) {
      expect(await within(currentPanel).findByText(roomDisplayName(room.name))).toBeInTheDocument();
    }
  });

  it("renders the full 24-hour day header, now that the hour axis scrolls horizontally", () => {
    mockFetchMeetingOnDay(14);
    const { container } = renderView(14);

    const currentPanel = findCurrentDayPanel(container, 14);
    expect(within(currentPanel).getByText("12AM")).toBeInTheDocument();
    expect(within(currentPanel).getByText("11PM")).toBeInTheDocument();
  });

  it("renders the selected date, in brand pink, in the header corner", () => {
    mockFetchMeetingOnDay(18);
    const { container } = renderView(18);

    const currentPanel = findCurrentDayPanel(container, 18);
    const label = within(currentPanel).getByText(/\w{3}, Aug 18/, { selector: '[class*="headerCornerLabel"]' });
    expect(label).toBeInTheDocument();
  });

  it("renders a fetched meeting's title only -- no time, no tags (subcompact tier)", async () => {
    mockFetchMeetingOnDay(22);
    const { container } = renderView(22);

    const currentPanel = findCurrentDayPanel(container, 22);
    const card = await within(currentPanel).findByTestId("meeting-card-meeting-1");
    expect(card).toHaveTextContent("AA Big Book Study");
    expect(within(currentPanel).queryByText("9-10AM")).not.toBeInTheDocument();
    expect(within(currentPanel).queryByText("AA")).not.toBeInTheDocument();
  });
});
