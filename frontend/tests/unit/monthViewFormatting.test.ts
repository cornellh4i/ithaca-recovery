import { formatCompactTime, formatETDateLine } from "../../util/date/timeFormat";
import { pluralize } from "../../util/format/plural";
import { convertETToUTC } from "../../util/date/timeUtils";

describe("formatCompactTime", () => {
  test.each([
    ["09:00", "9 AM"],
    ["09:30", "9:30 AM"],
    ["12:00", "12 PM"],
    ["00:00", "12 AM"],
    ["19:05", "7:05 PM"],
  ])("%s -> %s", (input, expected) => {
    expect(formatCompactTime(input)).toBe(expected);
  });
});

describe("formatETDateLine", () => {
  test("uses the ET calendar date, with the year only when it isn't the current one", () => {
    // 11:30 PM ET on July 15 is already July 16 in UTC.
    const lateEvening = new Date(convertETToUTC("2031-07-15T23:30:00"));
    expect(formatETDateLine(lateEvening)).toBe("Tuesday, July 15, 2031");
  });
});

describe("pluralize", () => {
  test.each([
    [0, "0 meetings"],
    [1, "1 meeting"],
    [2, "2 meetings"],
  ])("%i", (count, expected) => {
    expect(pluralize(count, "meeting")).toBe(expected);
  });

  test("takes an irregular plural", () => {
    expect(pluralize(2, "double-booking")).toBe("2 double-bookings");
    expect(pluralize(3, "person", "people")).toBe("3 people");
  });
});
