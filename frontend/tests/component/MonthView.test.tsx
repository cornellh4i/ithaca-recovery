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

const renderMonth = (
  anchor: string,
  opts: { filters?: MeetingFilters; conflictMids?: Set<string>; onOpenDay?: (d: Date) => void } = {},
) =>
  render(
    <MonthView
      filters={opts.filters ?? createDefaultFilters(true)}
      selectedDate={etNoon(anchor)}
      conflictMids={opts.conflictMids}
      onOpenDay={opts.onOpenDay}
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

});

const openCell = (container: HTMLElement, etDateStr: string) =>
  fireEvent.click(within(cellFor(container, etDateStr)).getByRole("button", { name: /meeting/ }));

describe("MonthView day popover", () => {
  test("clicking a cell opens its day's popover with the long date, count and every meeting", async () => {
    mockRange([
      { mid: "a", title: "Beginners Meeting", date: "2032-06-16", start: "09:00", end: "10:00", room: "Serenity Room" },
      { mid: "b", title: "A Very Long Meeting Title That Will Not Fit", date: "2032-06-16", start: "19:30", end: "20:30", room: "Unity Room" },
    ]);
    const { container } = renderMonth("2032-06-16");
    await waitFor(() => expect(within(cellFor(container, "2032-06-16")).getAllByTestId("meeting-dot")).toHaveLength(2));

    openCell(container, "2032-06-16");
    const dialog = screen.getByRole("dialog", { name: /Wednesday, June 16/ });
    expect(within(dialog).getByText("2 meetings")).toBeInTheDocument();
    const rows = within(dialog).getAllByRole("listitem");
    expect(rows.map(r => r.textContent)).toEqual([
      "Beginners Meeting9 - 10 AM · Serenity Room",
      "A Very Long Meeting Title That Will Not Fit7:30 - 8:30 PM · Unity Room",
    ]);
    // Ellipsized titles keep their full text as a tooltip.
    expect(within(dialog).getByTitle("A Very Long Meeting Title That Will Not Fit")).toBeInTheDocument();
    // Lives inside its own cell -- not portaled out of the grid.
    expect(cellFor(container, "2032-06-16")).toContainElement(dialog);
  });

  test("an empty day's popover says so", async () => {
    mockRange([]);
    const { container } = renderMonth("2034-06-07");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    openCell(container, "2034-06-07");
    expect(within(screen.getByRole("dialog")).getByText("No meetings")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByRole("list")).not.toBeInTheDocument();
  });

  test("only one popover is open at a time, and clicking the same cell again closes it", async () => {
    mockRange([]);
    const { container } = renderMonth("2032-07-14");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    openCell(container, "2032-07-14");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // A click elsewhere is a mousedown (outside the open cell) then a click on the new cell.
    const other = within(cellFor(container, "2032-07-15")).getByRole("button", { name: /meeting/ });
    fireEvent.mouseDown(other);
    fireEvent.click(other);
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveAccessibleName(/July 15/);

    const same = within(cellFor(container, "2032-07-15")).getByRole("button", { name: /meeting/ });
    fireEvent.mouseDown(same);
    fireEvent.click(same);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("closes on ✕, Escape and an outside click", async () => {
    mockRange([]);
    const { container } = renderMonth("2032-08-11");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const cellButton = () => within(cellFor(container, "2032-08-11")).getByRole("button", { name: /meeting/ });

    openCell(container, "2032-08-11");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cellButton()).toHaveFocus();

    openCell(container, "2032-08-11");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cellButton()).toHaveFocus();

    openCell(container, "2032-08-11");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("clicks inside the popover don't close it", async () => {
    mockRange([{ mid: "a", title: "Inside", date: "2032-09-15", start: "09:00", end: "10:00" }]);
    const { container } = renderMonth("2032-09-15");
    await waitFor(() => expect(within(cellFor(container, "2032-09-15")).getAllByTestId("meeting-dot")).toHaveLength(1));
    openCell(container, "2032-09-15");
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(within(dialog).getByText("Inside"));
    fireEvent.click(within(dialog).getByText("Inside"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("anchors left on the first five columns and right on Friday and Saturday", async () => {
    mockRange([]);
    const { container } = renderMonth("2032-10-13");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Oct 2032: Sun 10th .. Sat 16th.
    const expected: Record<string, string> = {
      "2032-10-10": "alignLeft", "2032-10-11": "alignLeft", "2032-10-12": "alignLeft",
      "2032-10-13": "alignLeft", "2032-10-14": "alignLeft",
      "2032-10-15": "alignRight", "2032-10-16": "alignRight",
    };
    for (const [day, align] of Object.entries(expected)) {
      openCell(container, day);
      expect(screen.getByRole("dialog")).toHaveClass(align);
      fireEvent.keyDown(document, { key: "Escape" });
    }
  });

  test("“Open day view →” hands back the clicked date and closes the popover", async () => {
    mockRange([]);
    const onOpenDay = jest.fn();
    const { container } = renderMonth("2032-11-10", { onOpenDay });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // An adjacent-month cell works too: Nov 2032 starts on a Monday, so Oct 31 pads row one.
    openCell(container, "2032-10-31");
    fireEvent.click(screen.getByRole("button", { name: "Open day view →" }));
    expect(onOpenDay).toHaveBeenCalledTimes(1);
    expect(formatETDateString(onOpenDay.mock.calls[0][0])).toBe("2032-10-31");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("navigating to another month closes an open popover", async () => {
    mockRange([]);
    const filters = createDefaultFilters(true);
    const { container, rerender } = render(<MonthView filters={filters} selectedDate={etNoon("2033-01-12")} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    openCell(container, "2033-01-12");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(<MonthView filters={filters} selectedDate={etNoon("2033-02-12")} />);
    await waitFor(() => expect(screen.getByRole("grid", { name: "February 2033" })).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// Mirrors the Day/Week conflict-badge tests (OverlapMeetingsPopover.test.tsx): conflictMids is
// admin-only data, so its presence alone decides whether any conflict UI renders.
describe("MonthView conflict indicators", () => {
  const rows: RawRow[] = [
    { mid: "c1", title: "Clash One", date: "2033-03-16", start: "18:00", end: "19:00", room: "Serenity Room" },
    { mid: "c2", title: "Clash Two", date: "2033-03-16", start: "18:30", end: "19:30", room: "Serenity Room" },
    {
      mid: "zoomOnly", title: "Zoom Clash", date: "2033-03-16", start: "20:00", end: "21:00",
      room: "", zoomRoom: "Unity Room - Zoom", modeType: "Zoom Only",
    },
    { mid: "fine", title: "No Clash", date: "2033-03-16", start: "09:00", end: "10:00", room: "Unity Room" },
  ];

  test("admins see the in-cell count, the popover subline and a per-meeting line naming the physical room", async () => {
    mockRange(rows);
    const { container } = renderMonth("2033-03-16", { conflictMids: new Set(["c1", "c2", "zoomOnly"]) });
    const cell = cellFor(container, "2033-03-16");
    await waitFor(() => expect(within(cell).getAllByTestId("meeting-dot")).toHaveLength(4));

    expect(within(cell).getByTestId("cell-conflict")).toHaveTextContent("⚠ 3 double-bookings");

    openCell(container, "2033-03-16");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("4 meetings · 3 double-booked")).toBeInTheDocument();
    expect(within(dialog).getAllByText("⚠ Double-booked in Serenity Room")).toHaveLength(2);
    // No physical room: never names the Zoom room.
    expect(within(dialog).getByText("⚠ Double-booked")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Double-booked in Unity Room/)).not.toBeInTheDocument();

    const fineRow = within(dialog).getByText("No Clash").closest("li") as HTMLElement;
    expect(within(fineRow).queryByText(/Double-booked/)).not.toBeInTheDocument();
  });

  test("a single conflict reads in the singular", async () => {
    mockRange([{ ...rows[0], date: "2033-04-13" }]);
    const { container } = renderMonth("2033-04-13", { conflictMids: new Set(["c1"]) });
    const cell = cellFor(container, "2033-04-13");
    await waitFor(() => expect(within(cell).getByTestId("cell-conflict")).toHaveTextContent("⚠ 1 double-booking"));
    openCell(container, "2033-04-13");
    expect(within(screen.getByRole("dialog")).getByText("1 meeting · 1 double-booked")).toBeInTheDocument();
  });

  test("public viewers (no conflictMids) see no conflict UI anywhere", async () => {
    mockRange(rows.map(r => ({ ...r, date: "2033-05-18" })));
    const { container } = renderMonth("2033-05-18");
    const cell = cellFor(container, "2033-05-18");
    await waitFor(() => expect(within(cell).getAllByTestId("meeting-dot")).toHaveLength(4));

    expect(within(cell).queryByTestId("cell-conflict")).not.toBeInTheDocument();
    openCell(container, "2033-05-18");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("4 meetings")).toBeInTheDocument();
    expect(within(dialog).queryByText(/double-booked/i)).not.toBeInTheDocument();
  });
});
