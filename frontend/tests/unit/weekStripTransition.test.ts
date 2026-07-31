import { getSwipeDirection, isSameWeek } from "../../util/weekStripTransition";

const utcNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0)); // ~noon ET

describe("getSwipeDirection", () => {
  it("returns forward when moving to a later date", () => {
    expect(getSwipeDirection(utcNoon(2026, 7, 27), utcNoon(2026, 7, 30))).toBe("forward");
  });

  it("returns backward when moving to an earlier date", () => {
    expect(getSwipeDirection(utcNoon(2026, 7, 30), utcNoon(2026, 7, 27))).toBe("backward");
  });

  it("returns forward for a same-day no-op change", () => {
    const date = utcNoon(2026, 7, 30);
    expect(getSwipeDirection(date, new Date(date))).toBe("forward");
  });

  it("handles a change that crosses a DST boundary without misreporting direction", () => {
    // 2026's US fall-back (EDT -> EST) is 2026-11-01. A forward move across it should still
    // read as forward, not flip due to the underlying UTC-offset shift.
    expect(getSwipeDirection(utcNoon(2026, 10, 30), utcNoon(2026, 11, 2))).toBe("forward");
  });
});

describe("isSameWeek", () => {
  it("returns true for two dates in the same ET week", () => {
    expect(isSameWeek(utcNoon(2026, 7, 26), utcNoon(2026, 8, 1))).toBe(true); // Sun..Sat
  });

  it("returns false across a week boundary", () => {
    expect(isSameWeek(utcNoon(2026, 8, 1), utcNoon(2026, 8, 2))).toBe(false); // Sat -> Sun
  });

  it("returns true for the same date", () => {
    const date = utcNoon(2026, 7, 30);
    expect(isSameWeek(date, new Date(date))).toBe(true);
  });

  it("returns false across a month boundary that's also a week boundary", () => {
    expect(isSameWeek(utcNoon(2026, 7, 31), utcNoon(2026, 8, 2))).toBe(false); // Fri -> Sun
  });
});
