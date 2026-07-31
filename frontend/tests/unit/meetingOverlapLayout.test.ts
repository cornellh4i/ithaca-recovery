import { layoutOverlappingMeetings, MAX_VISIBLE_OVERLAP, type OverlapMeeting } from "../../util/meetingOverlapLayout";

const meeting = (id: string, title: string, startTime: string, endTime: string): OverlapMeeting => ({
  id,
  title,
  startTime,
  endTime,
  date: "2026-07-08",
  tags: [],
  room: "Room A",
});

describe("layoutOverlappingMeetings — default maxVisibleOverlap", () => {
  it("does not fold a cluster at or below MAX_VISIBLE_OVERLAP", () => {
    const meetings = [meeting("1", "A", "09:00", "10:00"), meeting("2", "B", "09:00", "10:00")];
    const result = layoutOverlappingMeetings(meetings);

    expect(result).toHaveLength(2);
    expect(result.every(m => !m.isOverflowIndicator)).toBe(true);
    expect(result.every(m => m.totalOverlapping === 2)).toBe(true);
  });

  it("folds a cluster exceeding MAX_VISIBLE_OVERLAP into an overflow indicator", () => {
    const meetings = [
      meeting("1", "A", "09:00", "10:00"),
      meeting("2", "B", "09:00", "10:00"),
      meeting("3", "C", "09:00", "10:00"),
    ];
    const result = layoutOverlappingMeetings(meetings);

    const shown = result.filter(m => !m.isOverflowIndicator);
    const overflow = result.filter(m => m.isOverflowIndicator);

    expect(shown).toHaveLength(MAX_VISIBLE_OVERLAP);
    expect(overflow).toHaveLength(1);
    expect(overflow[0].overflowCount).toBe(3 - MAX_VISIBLE_OVERLAP);
    expect(overflow[0].overflowMeetings).toHaveLength(3);
  });
});

describe("layoutOverlappingMeetings — explicit maxVisibleOverlap (mobile DayColumn uses 4)", () => {
  it("shows up to 4 full columns before folding", () => {
    const meetings = [
      meeting("1", "A", "09:00", "10:00"),
      meeting("2", "B", "09:00", "10:00"),
      meeting("3", "C", "09:00", "10:00"),
      meeting("4", "D", "09:00", "10:00"),
    ];
    const result = layoutOverlappingMeetings(meetings, 4);

    expect(result.every(m => !m.isOverflowIndicator)).toBe(true);
    expect(result).toHaveLength(4);
    expect(result.every(m => m.totalOverlapping === 4)).toBe(true);
  });

  it("folds only the meetings past the 5th when maxVisibleOverlap is 4", () => {
    const meetings = [
      meeting("1", "A", "09:00", "10:00"),
      meeting("2", "B", "09:00", "10:00"),
      meeting("3", "C", "09:00", "10:00"),
      meeting("4", "D", "09:00", "10:00"),
      meeting("5", "E", "09:00", "10:00"),
    ];
    const result = layoutOverlappingMeetings(meetings, 4);

    const shown = result.filter(m => !m.isOverflowIndicator);
    const overflow = result.filter(m => m.isOverflowIndicator);

    expect(shown).toHaveLength(4);
    expect(overflow).toHaveLength(1);
    expect(overflow[0].overflowCount).toBe(1);
  });
});
