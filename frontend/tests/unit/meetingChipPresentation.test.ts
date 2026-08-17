import { buildMeetingChipAriaLabel } from "../../util/meetings/meetingChipPresentation";

describe("buildMeetingChipAriaLabel", () => {
  it("composes title, time range, room, and mode", () => {
    expect(
      buildMeetingChipAriaLabel({
        title: "Noon Brown Baggers",
        startTime: "12:00",
        endTime: "13:00",
        room: "Serenity Room",
        zoomRoom: "Serenity Room - Zoom",
        tags: ["Hybrid", "AA"],
      }),
    ).toBe("Noon Brown Baggers, 12 - 1 PM, Serenity Room, Hybrid");
  });

  it("prefers the display (unclipped) times over the layout times", () => {
    expect(
      buildMeetingChipAriaLabel({
        title: "Overnight",
        startTime: "00:00",
        endTime: "01:00",
        displayStartTime: "23:00",
        displayEndTime: "01:00",
        room: "Unity Room",
        tags: ["In Person"],
      }),
    ).toBe("Overnight, 11 PM - 1 AM, Unity Room, In Person");
  });

  it("falls back to the Zoom room name when no physical room is presented", () => {
    expect(
      buildMeetingChipAriaLabel({
        title: "Zoom-only Survivor",
        startTime: "09:00",
        endTime: "10:00",
        room: undefined,
        zoomRoom: "Serenity Room - Zoom",
        tags: ["Hybrid"],
      }),
    ).toBe("Zoom-only Survivor, 9 - 10 AM, Serenity Room - Zoom, Hybrid");
  });

  it("labels a Remote meeting's location as Remote and skips a duplicate mode entry", () => {
    expect(
      buildMeetingChipAriaLabel({
        title: "Online Only",
        startTime: "18:00",
        endTime: "19:00",
        tags: ["Remote"],
      }),
    ).toBe("Online Only, 6 - 7 PM, Remote");
  });
});
