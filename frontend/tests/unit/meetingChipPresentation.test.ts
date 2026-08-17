import {
  buildMeetingChipAriaLabel,
  getMeetingChipPresentation,
} from "../../util/meetings/meetingChipPresentation";
import { createDefaultFilters } from "../../util/filters/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../util/rooms/filterColors";

const hybridMeeting = {
  tags: ["Hybrid", "AA"],
  room: "Serenity Room",
  zoomRoom: "Serenity Room - Zoom",
};

describe("getMeetingChipPresentation", () => {
  it("keeps the physical room color and name while the physical room filter is checked", () => {
    const filters = createDefaultFilters(true);

    expect(getMeetingChipPresentation(hybridMeeting, filters)).toEqual({
      primaryColor: ROOM_COLORS["Serenity Room"],
      room: "Serenity Room",
    });
  });

  it("presents as the Zoom room (grey, no physical room) when only the Zoom room filter keeps it visible", () => {
    const filters = { ...createDefaultFilters(true), SerenityRoom: false };

    expect(getMeetingChipPresentation(hybridMeeting, filters)).toEqual({
      primaryColor: ZOOM_ROOM_COLOR,
      room: undefined,
    });
  });

  it("keeps the physical presentation when only the Zoom room filter is unchecked", () => {
    const filters = { ...createDefaultFilters(true), SerenityRoomZoom: false };

    expect(getMeetingChipPresentation(hybridMeeting, filters)).toEqual({
      primaryColor: ROOM_COLORS["Serenity Room"],
      room: "Serenity Room",
    });
  });

  it("leaves Remote meetings on the Remote color regardless of room filters", () => {
    const filters = { ...createDefaultFilters(true), SerenityRoom: false };

    expect(
      getMeetingChipPresentation({ tags: ["Remote", "AA"], room: "Remote", zoomRoom: null }, filters),
    ).toEqual({ primaryColor: REMOTE_COLOR, room: "Remote" });
  });
});

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
