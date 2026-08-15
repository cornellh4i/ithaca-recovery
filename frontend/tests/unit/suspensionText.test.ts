import { formatSuspensionStatusText } from "../../util/meetings/suspensionText";

describe("formatSuspensionStatusText", () => {
  it("formats an active suspension with a since-date, indefinite", () => {
    expect(formatSuspensionStatusText("2026-08-14T12:00:00Z", null, true)).toBe(
      "Suspended from August 14, 2026, indefinitely"
    );
  });

  it("formats a pending (not-yet-active) suspension with a scheduled resume date", () => {
    expect(formatSuspensionStatusText("2026-08-14T12:00:00Z", "2026-09-01T12:00:00Z", false)).toBe(
      "Suspends from August 14, 2026 til September 1, 2026"
    );
  });

  // formatDate's Intl.DateTimeFormat.format() throws a RangeError on an invalid Date; neither
  // suspendedSince nor resumesAt carries a parseability guarantee beyond a truthy check.
  it("does not throw for an unparseable date, and degrades to literal text instead", () => {
    expect(() => formatSuspensionStatusText("not-a-date", null, true)).not.toThrow();
    expect(formatSuspensionStatusText("not-a-date", null, true)).toBe(
      "Suspended from Invalid Date, indefinitely"
    );
  });
});
