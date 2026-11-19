import {
    MONTH_GRID_DAYS,
    etDateStringToNoonET,
    getMonthGridRange,
    getMonthGridRangeForStart,
    groupMeetingsByETDate,
    isInGridMonth,
} from "../../util/meetings/monthGrid";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

// Every anchor is a real ET instant (built via convertETToUTC), so these cases hold under the
// suite's TZ=UTC pinning -- the runtime's local zone never enters the window math.
const etNoon = (etDateStr: string) => new Date(convertETToUTC(`${etDateStr}T12:00:00`));

const weekdayOf = (etDateStr: string) => new Date(`${etDateStr}T00:00:00Z`).getUTCDay();

describe("getMonthGridRange", () => {
    test("always returns 42 consecutive days, Sunday through Saturday", () => {
        const range = getMonthGridRange(etNoon("2026-07-15"));
        expect(range.days).toHaveLength(MONTH_GRID_DAYS);
        expect(weekdayOf(range.startDate)).toBe(0);
        expect(weekdayOf(range.endDate)).toBe(6);
        expect(range.days[0]).toBe(range.startDate);
        expect(range.days[41]).toBe(range.endDate);
        // Consecutive: no gaps or repeats.
        expect(new Set(range.days).size).toBe(42);
    });

    test("July 2026 starts on the Sunday before Wednesday the 1st", () => {
        const range = getMonthGridRange(etNoon("2026-07-15"));
        expect(range.monthKey).toBe("2026-07");
        expect(range.startDate).toBe("2026-06-28");
        expect(range.endDate).toBe("2026-08-08");
    });

    test("a month whose 1st is a Sunday starts on the 1st itself", () => {
        // November 1, 2026 is a Sunday.
        const range = getMonthGridRange(etNoon("2026-11-20"));
        expect(range.startDate).toBe("2026-11-01");
        expect(range.endDate).toBe("2026-12-12");
    });

    test("February in a common year (28 days)", () => {
        // February 1, 2026 is a Sunday; 28 days + 14 trailing March cells.
        const range = getMonthGridRange(etNoon("2026-02-10"));
        expect(range.startDate).toBe("2026-02-01");
        expect(range.days.filter(d => d.startsWith("2026-02"))).toHaveLength(28);
        expect(range.endDate).toBe("2026-03-14");
    });

    test("February in a leap year (29 days)", () => {
        // February 1, 2028 is a Tuesday.
        const range = getMonthGridRange(etNoon("2028-02-29"));
        expect(range.startDate).toBe("2028-01-30");
        expect(range.days.filter(d => d.startsWith("2028-02"))).toHaveLength(29);
        expect(range.days).toContain("2028-02-29");
        expect(range.endDate).toBe("2028-03-11");
    });

    test("March 2026 spans the spring-forward DST change without skipping or repeating a day", () => {
        // DST starts Sunday, March 8, 2026.
        const range = getMonthGridRange(etNoon("2026-03-20"));
        expect(range.startDate).toBe("2026-03-01");
        expect(range.days).toContain("2026-03-08");
        expect(range.days).toContain("2026-03-09");
        expect(range.days.filter(d => d.startsWith("2026-03"))).toHaveLength(31);
        expect(new Set(range.days).size).toBe(42);
    });

    test("November 2026 spans the fall-back DST change without skipping or repeating a day", () => {
        // DST ends Sunday, November 1, 2026 -- the grid's very first cell.
        const range = getMonthGridRange(etNoon("2026-11-01"));
        expect(range.days.slice(0, 3)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
        expect(range.days.filter(d => d.startsWith("2026-11"))).toHaveLength(30);
    });

    test("an anchor late in the ET evening still picks the ET month, not the UTC one", () => {
        // 11:30 PM ET on Jan 31 is already Feb 1 in UTC.
        const lateEvening = new Date(convertETToUTC("2026-01-31T23:30:00"));
        expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-02-01");
        expect(getMonthGridRange(lateEvening).monthKey).toBe("2026-01");
    });

    test("every day of the month resolves to the same grid", () => {
        const first = getMonthGridRange(etNoon("2026-07-01"));
        const last = getMonthGridRange(etNoon("2026-07-31"));
        expect(last).toEqual(first);
    });
});

describe("getMonthGridRangeForStart", () => {
    test.each(["2026-02-10", "2026-07-15", "2026-11-20", "2028-02-29"])(
        "recovers the %s grid from its first cell, including when that cell is in the previous month",
        (anchor) => {
            const grid = getMonthGridRange(etNoon(anchor));
            expect(getMonthGridRangeForStart(grid.startDate)).toEqual(grid);
        },
    );
});

describe("isInGridMonth", () => {
    test("tells the month's own days apart from adjacent-month padding", () => {
        const range = getMonthGridRange(etNoon("2026-07-15"));
        expect(isInGridMonth("2026-07-01", range)).toBe(true);
        expect(isInGridMonth("2026-06-30", range)).toBe(false);
        expect(isInGridMonth("2026-08-01", range)).toBe(false);
    });
});

describe("etDateStringToNoonET", () => {
    test("round-trips back to the same ET date string", () => {
        for (const d of ["2026-03-08", "2026-11-01", "2026-12-31"]) {
            expect(formatETDateString(etDateStringToNoonET(d))).toBe(d);
        }
    });
});

describe("groupMeetingsByETDate", () => {
    test("buckets meetings by their ET date and preserves order within a day", () => {
        const meetings = [
            { id: "a", date: "2026-07-01" },
            { id: "b", date: "2026-07-02" },
            { id: "c", date: "2026-07-01" },
        ];
        const grouped = groupMeetingsByETDate(meetings);
        expect(grouped.get("2026-07-01")?.map(m => m.id)).toEqual(["a", "c"]);
        expect(grouped.get("2026-07-02")?.map(m => m.id)).toEqual(["b"]);
        expect(grouped.has("2026-07-03")).toBe(false);
    });
});
