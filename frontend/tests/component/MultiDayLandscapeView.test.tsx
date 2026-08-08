import React from "react";
import { render, screen, within } from "@testing-library/react";
import MultiDayLandscapeView from "../../app/components/calendar/mobile/MultiDayLandscapeView";
import { CalendarProvider } from "../../app/context/CalendarProvider";
import { createDefaultFilters } from "../../util/filters/meetingFilters";

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

// useScrollNavHide (the mobile-nav-hide-on-scroll hook) requires a CalendarProvider ancestor.
const renderView = (date: Date) =>
  render(
    <CalendarProvider>
      <MultiDayLandscapeView {...buildProps(date)} />
    </CalendarProvider>
  );

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MultiDayLandscapeView", () => {
  // Each test uses a distinct date -- useRangeMeetings' fetch cache is module-level and keyed
  // by the exact date range requested, shared across tests in this file, so reusing a date
  // would let a later test's assertion silently pass off an earlier test's cached
  // (never-refetched) result (see DayPortraitView.test.tsx's identical caveat for
  // useWeekMeetings' own cache).
  //
  // jsdom also reports clientWidth as 0 (no real layout engine), so `days` always falls back
  // to its minimum of 1 here -- these tests exercise the day-count fallback and the 3-page
  // (prev/current/next) carousel structure it drives, not the real width-driven math (that's
  // covered by weekDates.test.ts's daysBetweenET and manual/e2e viewport checks instead).

  it("renders a header for the selected day, labeled with its weekday and date", () => {
    const { container } = renderView(etDate(2026, 8, 24)); // a Monday, week of 8/23

    // 3 panels render (prev/current/next, see the "3 day panels" test below) -- the selected
    // day's own header is the one carrying "24", not necessarily the first in DOM order (that's
    // the "prev" panel).
    const dayHeaders = container.querySelectorAll('[class*="dayHeader"]');
    const dayHeader = Array.from(dayHeaders).find((el) => within(el as HTMLElement).queryByText(/24/)) as HTMLElement;
    expect(dayHeader).not.toBeUndefined();
    expect(within(dayHeader).getByText("MON")).toBeInTheDocument();
  });

  it("renders 3 day panels (prev/current/next) when days falls back to 1", () => {
    const { container } = renderView(etDate(2026, 8, 31)); // week of 8/30

    expect(container.querySelectorAll('[class*="dayPanel"]')).toHaveLength(3);
  });

  it("renders a 24-hour time column, not repeated per day panel", () => {
    const { container } = renderView(etDate(2026, 8, 17)); // week of 8/16

    const timeColumn = container.querySelector('[class*="timeColumn"]') as HTMLElement;
    expect(timeColumn).not.toBeNull();
    expect(within(timeColumn).getByText("12AM")).toBeInTheDocument();
    expect(within(timeColumn).getByText("11PM")).toBeInTheDocument();
    expect(container.querySelectorAll('[class*="timeColumn"]')).toHaveLength(1);
  });

  it("fetches exactly the 3 day-range pages (prev/current/next) covering the visible strip, not whole weeks around them", async () => {
    renderView(etDate(2026, 8, 12)); // a Wednesday -- days falls back to 1 in jsdom (see above)

    await screen.findByText("WED");
    expect(global.fetch).toHaveBeenCalled();
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => call[0] as string);
    expect(urls.every((url) => url.includes("/api/retrieve/meeting/range"))).toBe(true);
    expect(urls.some((url) => url.includes("startDate=2026-08-11") && url.includes("endDate=2026-08-11"))).toBe(true);
    expect(urls.some((url) => url.includes("startDate=2026-08-12") && url.includes("endDate=2026-08-12"))).toBe(true);
    expect(urls.some((url) => url.includes("startDate=2026-08-13") && url.includes("endDate=2026-08-13"))).toBe(true);
  });
});
