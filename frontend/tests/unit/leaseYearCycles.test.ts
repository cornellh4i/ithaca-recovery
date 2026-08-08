import { computeLeaseYearCycles } from "../../util/lease/leaseYearCycles";

const d = (iso: string) => new Date(iso);

describe("computeLeaseYearCycles", () => {
  it("with no meeting data, returns just the current cycle and the one after it", () => {
    const cycles = computeLeaseYearCycles([], d("2026-08-07T00:00:00Z"));
    expect(cycles.map((c) => c.label)).toEqual([
      "Jul 1, 2026 – Jun 30, 2027",
      "Jul 1, 2027 – Jun 30, 2028",
    ]);
    expect(cycles.map((c) => c.status)).toEqual(["current", "upcoming"]);
  });

  it("marks the cycle containing `now` as current regardless of month", () => {
    // January falls inside the lease year that started the previous July.
    const cycles = computeLeaseYearCycles([], d("2027-01-15T00:00:00Z"));
    expect(cycles[0].label).toBe("Jul 1, 2026 – Jun 30, 2027");
    expect(cycles[0].status).toBe("current");
  });

  it("includes every cycle with meeting data, marking earlier ones past", () => {
    const cycles = computeLeaseYearCycles(
      [d("2024-09-01T00:00:00Z"), d("2025-03-01T00:00:00Z")],
      d("2026-08-07T00:00:00Z"),
    );
    expect(cycles.map((c) => c.label)).toEqual([
      "Jul 1, 2024 – Jun 30, 2025",
      "Jul 1, 2025 – Jun 30, 2026",
      "Jul 1, 2026 – Jun 30, 2027",
      "Jul 1, 2027 – Jun 30, 2028",
    ]);
    expect(cycles.map((c) => c.status)).toEqual(["past", "past", "current", "upcoming"]);
  });

  it("extends the upcoming cycle past the latest meeting data when data reaches further than current", () => {
    // A meeting already scheduled two lease years out shouldn't be swallowed by the
    // "current + 1" default -- the option list must reach at least as far as real data does.
    const cycles = computeLeaseYearCycles([d("2028-10-01T00:00:00Z")], d("2026-08-07T00:00:00Z"));
    expect(cycles.map((c) => c.label)).toEqual([
      "Jul 1, 2026 – Jun 30, 2027",
      "Jul 1, 2027 – Jun 30, 2028",
      "Jul 1, 2028 – Jun 30, 2029",
      "Jul 1, 2029 – Jun 30, 2030",
    ]);
    expect(cycles.map((c) => c.status)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("cycle boundaries are exactly Jul 1 and Jun 30", () => {
    const [cycle] = computeLeaseYearCycles([], d("2026-08-07T00:00:00Z"));
    expect(cycle.startDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(cycle.endDate.toISOString()).toBe("2027-06-30T00:00:00.000Z");
  });

  it("reads the ET calendar date, not the UTC instant, for the Jul 1 boundary", () => {
    // Jul 1 00:00 UTC is still Jun 30, evening in ET (UTC is ahead of ET) -- the cycle that
    // just ended must still read as current at that instant, not the new one that hasn't
    // actually started yet locally.
    const cycles = computeLeaseYearCycles([], d("2026-07-01T00:00:00Z"));
    expect(cycles[0].label).toBe("Jul 1, 2025 – Jun 30, 2026");
    expect(cycles[0].status).toBe("current");
  });
});
