import { linkedScheduleSchema } from "../../util/meetings/meetingValidation";

const weeklyPattern = {
  type: "weekly",
  startDate: "2026-09-12T18:00:00.000Z",
  daysOfWeek: ["Saturday"],
  firstDayOfWeek: "Sunday",
  interval: 1,
};

const linkedSchedule = (overrides: Record<string, unknown> = {}) => ({
  linkedSchedule: {
    mid: "linked-mid",
    modeType: "Remote",
    room: null,
    zoomRoom: null,
    recurrencePattern: weeklyPattern,
    ...overrides,
  },
});

describe("linkedScheduleSchema", () => {
  it("accepts a Remote schedule with no rooms at all", () => {
    const parsed = linkedScheduleSchema.safeParse(linkedSchedule());
    expect(parsed.success).toBe(true);
  });

  // The block is parsed from the same raw body as meetingSchema, so a request without one has
  // to read as "no linked schedule", not as invalid input.
  it("treats a body with no linkedSchedule as absent, not invalid", () => {
    const parsed = linkedScheduleSchema.safeParse({ mid: "m-1", title: "Meeting" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.linkedSchedule).toBeUndefined();
  });

  // Nothing the two schedules must agree on is accepted from the client (the route derives it
  // from the anchor), so keys like title or startDateTime are simply not part of the contract.
  it("strips fields the linked schedule doesn't own", () => {
    const parsed = linkedScheduleSchema.safeParse(
      linkedSchedule({ title: "Renamed", startDateTime: "2026-09-12T18:00:00.000Z" }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.linkedSchedule).not.toHaveProperty("title");
    expect(parsed.success && parsed.data.linkedSchedule).not.toHaveProperty("startDateTime");
  });

  it("rejects a mode outside the three the family model knows", () => {
    expect(linkedScheduleSchema.safeParse(linkedSchedule({ modeType: "Hyflex" })).success).toBe(false);
  });

  it("rejects a client-generated mid that is empty", () => {
    expect(linkedScheduleSchema.safeParse(linkedSchedule({ mid: "" })).success).toBe(false);
  });

  it("rejects a block with no recurrence pattern -- a linked schedule is always recurring", () => {
    const parsed = linkedScheduleSchema.safeParse(linkedSchedule({ recurrencePattern: undefined }));
    expect(parsed.success).toBe(false);
  });

  // Same room requirements meetingSchema puts on the primary schedule -- the linked row is an
  // ordinary Meeting row once written.
  it("requires a Hybrid schedule to carry both a room and a Zoom room", () => {
    expect(linkedScheduleSchema.safeParse(linkedSchedule({ modeType: "Hybrid", room: "Serenity Room" })).success)
      .toBe(false);
    expect(linkedScheduleSchema.safeParse(
      linkedSchedule({ modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Zoom Room A" }),
    ).success).toBe(true);
  });

  it("requires an In Person schedule to carry a room", () => {
    expect(linkedScheduleSchema.safeParse(linkedSchedule({ modeType: "In Person" })).success).toBe(false);
    expect(linkedScheduleSchema.safeParse(linkedSchedule({ modeType: "In Person", room: "Serenity Room" })).success)
      .toBe(true);
  });
});
