import {
  createDefaultFilters,
  filterMeetingsForDate,
  getRoomFilterVisibility,
} from "../../util/filters/meetingFilters";

const hybridMeeting = {
  date: "2026-08-17",
  tags: ["Hybrid", "AA"],
  room: "Serenity Room",
  zoomRoom: "Serenity Room - Zoom",
};

const remoteMeeting = {
  date: "2026-08-17",
  tags: ["Remote", "AA"],
  room: "Remote",
  zoomRoom: null,
};

describe("getRoomFilterVisibility", () => {
  it("reports both resources when the physical room and Zoom room filters are checked", () => {
    const filters = createDefaultFilters(true);

    expect(getRoomFilterVisibility(hybridMeeting, filters)).toEqual({
      viaPhysicalRoom: true,
      viaZoomRoom: true,
    });
  });

  it("reports physical-only when the Zoom room filter is unchecked", () => {
    const filters = { ...createDefaultFilters(true), SerenityRoomZoom: false };

    expect(getRoomFilterVisibility(hybridMeeting, filters)).toEqual({
      viaPhysicalRoom: true,
      viaZoomRoom: false,
    });
  });

  it("reports zoom-only when the physical room filter is unchecked", () => {
    const filters = { ...createDefaultFilters(true), SerenityRoom: false };

    expect(getRoomFilterVisibility(hybridMeeting, filters)).toEqual({
      viaPhysicalRoom: false,
      viaZoomRoom: true,
    });
  });

  it("reports neither when both filters are unchecked", () => {
    const filters = {
      ...createDefaultFilters(true),
      SerenityRoom: false,
      SerenityRoomZoom: false,
    };

    expect(getRoomFilterVisibility(hybridMeeting, filters)).toEqual({
      viaPhysicalRoom: false,
      viaZoomRoom: false,
    });
  });

  it("reports a meeting without a Zoom room as never visible via Zoom", () => {
    const filters = createDefaultFilters(true);

    expect(
      getRoomFilterVisibility(
        { tags: ["In Person", "AA"], room: "Unity Room", zoomRoom: null },
        filters,
      ),
    ).toEqual({ viaPhysicalRoom: true, viaZoomRoom: false });
  });

  it("gates a Remote meeting on the virtual Remote room key, reported as physical", () => {
    const filters = createDefaultFilters(true);

    expect(getRoomFilterVisibility(remoteMeeting, filters)).toEqual({
      viaPhysicalRoom: true,
      viaZoomRoom: false,
    });
    expect(
      getRoomFilterVisibility(remoteMeeting, { ...filters, Remote: false }),
    ).toEqual({ viaPhysicalRoom: false, viaZoomRoom: false });
  });
});

describe("filterMeetingsForDate", () => {
  const date = new Date("2026-08-17T16:00:00Z"); // noon ET on 2026-08-17

  it("keeps a Hybrid meeting visible when only its Zoom room filter is checked", () => {
    const filters = { ...createDefaultFilters(true), SerenityRoom: false };

    expect(filterMeetingsForDate([hybridMeeting], date, filters)).toHaveLength(1);
  });

  it("drops a Hybrid meeting when both its room filters are unchecked", () => {
    const filters = {
      ...createDefaultFilters(true),
      SerenityRoom: false,
      SerenityRoomZoom: false,
    };

    expect(filterMeetingsForDate([hybridMeeting], date, filters)).toHaveLength(0);
  });
});
