import React from "react";
import { render, screen } from "@testing-library/react";
import MultiDayLandscapeView from "../../app/components/calendar/mobile/MultiDayLandscapeView";
import { createDefaultFilters } from "../../util/meetingFilters";

// Noon ET (UTC-4), matching this repo's other fixed-date component tests.
const etDate = (y: number, m: number, d: number, hourEt: number = 12) => new Date(Date.UTC(y, m - 1, d, hourEt + 4, 0));

const buildProps = (date: Date) => ({
  filters: createDefaultFilters(true),
  selectedDate: date,
  selectedMeetingID: null,
  setSelectedMeetingID: jest.fn(),
  setSelectedNewMeeting: jest.fn(),
  setAnchorEl: jest.fn(),
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MultiDayLandscapeView", () => {
  // Each test uses a date in a distinct ET week -- useWeekMeetings' fetch cache is
  // module-level and keyed by week, shared across tests in this file, so reusing a week would
  // let a later test's assertion silently pass off an earlier test's cached (never-refetched)
  // result (see DayPortraitView.test.tsx's identical caveat).
  //
  // jsdom also reports clientWidth as 0 (no real layout engine), so `days` always falls back
  // to its minimum of 1 here -- these tests exercise the day-count fallback and the 3-page
  // (prev/current/next) carousel structure it drives, not the real width-driven math (that's
  // covered by weekDates.test.ts's daysBetweenET and manual/e2e viewport checks instead).

  it("renders a header for the selected day, labeled with its weekday and date", () => {
    render(<MultiDayLandscapeView {...buildProps(etDate(2026, 8, 24))} />); // a Monday, week of 8/23

    expect(screen.getByText("MON")).toBeInTheDocument();
    expect(screen.getByText(/24/)).toBeInTheDocument();
  });

  it("renders 3 day panels (prev/current/next) when days falls back to 1", () => {
    const { container } = render(<MultiDayLandscapeView {...buildProps(etDate(2026, 8, 31))} />); // week of 8/30

    expect(container.querySelectorAll('[class*="dayPanel"]')).toHaveLength(3);
  });

  it("fetches the ET week(s) covering the visible pages", async () => {
    render(<MultiDayLandscapeView {...buildProps(etDate(2026, 8, 12))} />); // a Wednesday

    await screen.findByText("WED");
    expect(global.fetch).toHaveBeenCalled();
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => call[0] as string);
    expect(urls.some((url) => url.includes("startDate=2026-08-09"))).toBe(true);
  });
});
