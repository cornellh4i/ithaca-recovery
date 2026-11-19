import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MonthView, { BUSY_DAY_THRESHOLD } from "../../app/components/calendar/desktop/MonthView";
import { createDefaultFilters, MeetingFilters } from "../../util/filters/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "../../util/rooms/filterColors";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";
import { getMonthGridRange } from "../../util/meetings/monthGrid";

// Each test renders a distinct month: useRangeMeetings' fetch cache is module-level and keyed by
// the exact range, so reusing a month would let a later test read an earlier test's cached data
// (same caveat as MultiDayLandscapeView.test.tsx).

const etNoon = (etDateStr: string) => new Date(convertETToUTC(`${etDateStr}T12:00:00`));

interface RawRow {
  mid: string;
  title: string;
  date: string;
  start: string; // "HH:MM" ET
  end: string; // "HH:MM" ET
  room?: string;
  zoomRoom?: string | null;
  modeType?: string;
}

// The /api/retrieve/meeting/range row shape (a raw IMeeting occurrence + its ET date).
const toRangeRow = ({ mid, title, date, start, end, room = "Serenity Room", zoomRoom = null, modeType = "In Person" }: RawRow) => ({
  mid,
  title,
  date,
  startDateTime: convertETToUTC(`${date}T${start}:00`),
  endDateTime: convertETToUTC(`${date}T${end}:00`),
  calType: ["AA"],
  modeType,
  room,
  zoomRoom,
});

const mockRange = (rows: RawRow[]) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => rows.map(toRangeRow),
  }) as jest.Mock;
};

const renderMonth = (anchor: string, opts: { filters?: MeetingFilters; onDayClick?: (d: string) => void } = {}) =>
  render(
    <MonthView
      filters={opts.filters ?? createDefaultFilters(true)}
      selectedDate={etNoon(anchor)}
      onDayClick={opts.onDayClick}
    />,
  );

const cellFor = (container: HTMLElement, etDateStr: string): HTMLElement => {
  const cell = container.querySelector<HTMLElement>(`[data-date="${etDateStr}"]`);
  if (!cell) throw new Error(`no cell for ${etDateStr}`);
  return cell;
};

const dateNumberIn = (cell: HTMLElement) => within(cell).getByTestId("date-number");

// jsdom normalizes inline hex colors to rgb(); compare in the same form.
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MonthView data", () => {
  test("fetches the whole 42-day grid in one range request", async () => {
    mockRange([]);
    renderMonth("2031-07-15");
    const grid = getMonthGridRange(etNoon("2031-07-15"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain(`startDate=${grid.startDate}`);
    expect(url).toContain(`endDate=${grid.endDate}`);
  });

  test("renders six week rows of seven cells under a weekday header", async () => {
    mockRange([]);
    const { container } = renderMonth("2031-08-15");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByRole("columnheader").map(h => h.textContent)).toEqual(
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    );
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(42);
    expect(screen.getByRole("grid", { name: "August 2031" })).toBeInTheDocument();
  });
});

describe("MonthView cell states", () => {
  test("default: a day with meetings shows its number, count and one dot per meeting", async () => {
    mockRange([
      { mid: "a", title: "Morning", date: "2031-09-10", start: "09:00", end: "10:00" },
      { mid: "b", title: "Evening", date: "2031-09-10", start: "19:00", end: "20:00" },
    ]);
    const { container } = renderMonth("2031-09-10");
    const cell = cellFor(container, "2031-09-10");
    await waitFor(() => expect(within(cell).getAllByTestId("meeting-dot")).toHaveLength(2));

    expect(dateNumberIn(cell)).toHaveTextContent("10");
    expect(dateNumberIn(cell).className).toBe("dateNumber");
    const count = within(cell).getByTestId("meeting-count");
    expect(count).toHaveTextContent("2");
    expect(count).not.toHaveClass("countBusy");
    expect(within(cell).getByRole("button")).toHaveAccessibleName(/2 meetings$/);
  });

  test("empty: a day with no meetings shows only its number -- no zero, no dots", async () => {
    mockRange([{ mid: "a", title: "Elsewhere", date: "2031-10-02", start: "09:00", end: "10:00" }]);
    const { container } = renderMonth("2031-10-15");
    await waitFor(() => expect(within(cellFor(container, "2031-10-02")).getAllByTestId("meeting-dot")).toHaveLength(1));

    const empty = cellFor(container, "2031-10-03");
    expect(within(empty).queryByTestId("meeting-count")).not.toBeInTheDocument();
    expect(within(empty).queryByTestId("meeting-dot")).not.toBeInTheDocument();
    expect(within(empty).queryByText("0")).not.toBeInTheDocument();
    expect(within(empty).getByRole("button")).toHaveAccessibleName(/no meetings$/);
  });

  test("today: the current ET date gets the filled circle", async () => {
    mockRange([]);
    const todayKey = formatETDateString(new Date());
    const { container } = renderMonth(todayKey);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const number = dateNumberIn(cellFor(container, todayKey));
    expect(number).toHaveClass("today");
    expect(number).toHaveAttribute("aria-current", "date");
    expect(container.querySelectorAll(".today")).toHaveLength(1);
  });

  test("adjacent-month: the number greys out but the dots stay full strength", async () => {
    // November 2031 starts on a Saturday, so Oct 26-31 pad the first row.
    mockRange([
      { mid: "pad", title: "Padding Day", date: "2031-10-30", start: "09:00", end: "10:00" },
      { mid: "own", title: "Own Month", date: "2031-11-12", start: "09:00", end: "10:00" },
    ]);
    const { container } = renderMonth("2031-11-12");
    const padCell = cellFor(container, "2031-10-30");
    const ownCell = cellFor(container, "2031-11-12");
    await waitFor(() => expect(within(padCell).getAllByTestId("meeting-dot")).toHaveLength(1));

    expect(dateNumberIn(padCell)).toHaveClass("adjacentMonth");
    expect(dateNumberIn(ownCell)).not.toHaveClass("adjacentMonth");

    const padDot = within(padCell).getByTestId("meeting-dot");
    const ownDot = within(ownCell).getByTestId("meeting-dot");
    expect(padDot.className).toBe(ownDot.className);
    expect(padDot.getAttribute("style")).toBe(ownDot.getAttribute("style"));
  });

  test(`${BUSY_DAY_THRESHOLD}+ meetings: the count switches to the emphasis color`, async () => {
    const busy = Array.from({ length: BUSY_DAY_THRESHOLD }, (_, i) => ({
      mid: `busy-${i}`, title: `Busy ${i}`, date: "2031-12-09", start: `${String(8 + i).padStart(2, "0")}:00`, end: `${String(9 + i).padStart(2, "0")}:00`,
    }));
    const almost = busy.slice(0, BUSY_DAY_THRESHOLD - 1).map(m => ({ ...m, mid: `almost-${m.mid}`, date: "2031-12-10" }));
    mockRange([...busy, ...almost]);
    const { container } = renderMonth("2031-12-09");
    const busyCell = cellFor(container, "2031-12-09");
    await waitFor(() => expect(within(busyCell).getAllByTestId("meeting-dot")).toHaveLength(BUSY_DAY_THRESHOLD));

    expect(within(busyCell).getByTestId("meeting-count")).toHaveClass("countBusy");
    expect(within(cellFor(container, "2031-12-10")).getByTestId("meeting-count")).not.toHaveClass("countBusy");
  });

  test("past days render identically to future days -- no dimming", async () => {
    // A month well in the past and one well in the future, each with one meeting on the 10th.
    mockRange([{ mid: "past", title: "Past", date: "2020-03-10", start: "09:00", end: "10:00" }]);
    const past = renderMonth("2020-03-10");
    const pastCell = cellFor(past.container, "2020-03-10");
    await waitFor(() => expect(within(pastCell).getAllByTestId("meeting-dot")).toHaveLength(1));
    const pastSnapshot = pastCell.outerHTML.replaceAll("2020-03-10", "X").replace(/Tuesday, March 10, 2020/, "LABEL");
    past.unmount();

    mockRange([{ mid: "past", title: "Past", date: "2035-04-10", start: "09:00", end: "10:00" }]);
    const future = renderMonth("2035-04-10");
    const futureCell = cellFor(future.container, "2035-04-10");
    await waitFor(() => expect(within(futureCell).getAllByTestId("meeting-dot")).toHaveLength(1));
    const futureSnapshot = futureCell.outerHTML.replaceAll("2035-04-10", "X").replace(/Tuesday, April 10, 2035/, "LABEL");

    expect(futureSnapshot).toBe(pastSnapshot);
  });
});

describe("MonthView dots", () => {
  test("sort by start time and carry a time + title tooltip", async () => {
    mockRange([
      { mid: "late", title: "Late Meeting", date: "2032-01-14", start: "19:30", end: "20:30" },
      { mid: "early", title: "Beginners Meeting", date: "2032-01-14", start: "09:00", end: "10:00" },
      { mid: "noon", title: "Noon Meeting", date: "2032-01-14", start: "12:00", end: "13:00" },
    ]);
    const { container } = renderMonth("2032-01-14");
    const cell = cellFor(container, "2032-01-14");
    await waitFor(() => expect(within(cell).getAllByTestId("meeting-dot")).toHaveLength(3));

    expect(within(cell).getAllByTestId("meeting-dot").map(d => d.getAttribute("title"))).toEqual([
      "9 AM Beginners Meeting",
      "12 PM Noon Meeting",
      "7:30 PM Late Meeting",
    ]);
  });

  test("use the same room colors as Day/Week, with Zoom-only meetings in the Zoom grey", async () => {
    mockRange([
      { mid: "ser", title: "Serenity", date: "2032-02-11", start: "09:00", end: "10:00", room: "Serenity Room" },
      { mid: "uni", title: "Unity", date: "2032-02-11", start: "10:00", end: "11:00", room: "Unity Room" },
      {
        mid: "hyb", title: "Hybrid", date: "2032-02-11", start: "11:00", end: "12:00",
        room: "Seeds of Hope Room", zoomRoom: "Seeds of Hope Room - Zoom", modeType: "Hybrid",
      },
    ]);
    // Seeds of Hope's physical room unchecked: the Hybrid meeting survives only via its Zoom
    // room, so (exactly as in Week view) it presents in the Zoom grey.
    const filters = { ...createDefaultFilters(true), SeedsofHopeRoom: false };
    const { container } = renderMonth("2032-02-11", { filters });
    const cell = cellFor(container, "2032-02-11");
    await waitFor(() => expect(within(cell).getAllByTestId("meeting-dot")).toHaveLength(3));

    expect(within(cell).getAllByTestId("meeting-dot").map(d => d.style.backgroundColor)).toEqual([
      rgb(ROOM_COLORS["Serenity Room"]),
      rgb(ROOM_COLORS["Unity Room"]),
      rgb(ZOOM_ROOM_COLOR),
    ]);
  });
});

describe("MonthView filters and clicks", () => {
  test("toggling a room filter hides and shows its dots without refetching", async () => {
    mockRange([
      { mid: "ser", title: "Serenity", date: "2032-03-10", start: "09:00", end: "10:00", room: "Serenity Room" },
      { mid: "uni", title: "Unity", date: "2032-03-10", start: "10:00", end: "11:00", room: "Unity Room" },
    ]);
    const defaults = createDefaultFilters(true);
    const { container, rerender } = render(<MonthView filters={defaults} selectedDate={etNoon("2032-03-10")} />);
    const cell = () => cellFor(container, "2032-03-10");
    await waitFor(() => expect(within(cell()).getAllByTestId("meeting-dot")).toHaveLength(2));
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;

    rerender(<MonthView filters={{ ...defaults, UnityRoom: false }} selectedDate={etNoon("2032-03-10")} />);
    expect(within(cell()).getAllByTestId("meeting-dot")).toHaveLength(1);
    expect(within(cell()).getByTestId("meeting-count")).toHaveTextContent("1");

    rerender(<MonthView filters={defaults} selectedDate={etNoon("2032-03-10")} />);
    expect(within(cell()).getAllByTestId("meeting-dot")).toHaveLength(2);

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  test("picking another day in the same month doesn't refetch", async () => {
    mockRange([]);
    const filters = createDefaultFilters(true);
    const { rerender } = render(<MonthView filters={filters} selectedDate={etNoon("2032-04-03")} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    rerender(<MonthView filters={filters} selectedDate={etNoon("2032-04-28")} />);
    await new Promise(r => setTimeout(r, 0));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("clicking anywhere on a cell reports that day, including adjacent-month cells", async () => {
    mockRange([]);
    const onDayClick = jest.fn();
    const { container } = renderMonth("2032-05-12", { onDayClick });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(within(cellFor(container, "2032-05-12")).getByRole("button"));
    // May 2032 starts on a Saturday, so April 25 is the grid's first cell.
    fireEvent.click(within(cellFor(container, "2032-04-25")).getByRole("button"));
    expect(onDayClick.mock.calls).toEqual([["2032-05-12"], ["2032-04-25"]]);
  });
});
