import {
  SAME_START_AND_END_TIME_ERROR,
  isOvernightTimeRange,
  validateTimeRange,
} from "../../util/meetings/meetingValidation";

describe("validateTimeRange", () => {
  it("accepts an ordinary same-day range", () => {
    expect(validateTimeRange("18:00", "19:00")).toBeNull();
  });

  // The form collects one date plus two wall-clock times, and buildMeetingPayload rolls the
  // end onto the next day when it lands earlier than the start -- that's how an overnight
  // meeting is expressed, not a mistake to reject.
  it("accepts an end earlier in the day as an overnight range", () => {
    expect(validateTimeRange("23:00", "01:00")).toBeNull();
    expect(validateTimeRange("23:30", "00:00")).toBeNull();
  });

  it("rejects an end identical to the start, which would silently become a 24-hour meeting", () => {
    expect(validateTimeRange("18:00", "18:00")).toBe(SAME_START_AND_END_TIME_ERROR);
    expect(validateTimeRange("00:00", "00:00")).toBe(SAME_START_AND_END_TIME_ERROR);
  });

  it("tolerates unpadded hours", () => {
    expect(validateTimeRange("9:00", "09:00")).toBe(SAME_START_AND_END_TIME_ERROR);
  });

  // "Start and end time are required" already covers this case with a better message.
  it("stays silent on unparseable input", () => {
    expect(validateTimeRange("", "19:00")).toBeNull();
    expect(validateTimeRange("18:00", "not-a-time")).toBeNull();
  });
});

describe("isOvernightTimeRange", () => {
  it("is true only when the end lands earlier in the day than the start", () => {
    expect(isOvernightTimeRange("23:00", "01:00")).toBe(true);
    expect(isOvernightTimeRange("18:00", "19:00")).toBe(false);
    expect(isOvernightTimeRange("18:00", "18:00")).toBe(false);
  });

  it("is false for unparseable input", () => {
    expect(isOvernightTimeRange("18:00", "")).toBe(false);
  });
});
