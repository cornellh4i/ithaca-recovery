import { modeFieldRequirement, modeFieldVisibility } from "../../util/rooms/modeFields";

describe("modeFieldVisibility", () => {
  // The meeting form's own Room / Zoom room / Zoom host block passes exactly one mode, so these
  // three cases are the regression bar for it: mounting anything more or less than this is a
  // visible change to every meeting form, linked schedules or not.
  it.each([
    ["Hybrid", { room: true, zoomRoom: true, zoomHost: true }],
    ["In Person", { room: true, zoomRoom: false, zoomHost: false }],
    ["Remote", { room: false, zoomRoom: false, zoomHost: true }],
  ])("mounts %s's own fields and nothing else", (mode, expected) => {
    expect(modeFieldVisibility([mode])).toEqual(expected);
  });

  it("mounts nothing for an empty or unrecognised selection", () => {
    expect(modeFieldVisibility([])).toEqual({ room: false, zoomRoom: false, zoomHost: false });
    expect(modeFieldVisibility([""])).toEqual({ room: false, zoomRoom: false, zoomHost: false });
  });

  it("mounts the union of several modes' fields", () => {
    // What a linked schedule under a Hybrid meeting sees: Room for In Person, Zoom host for
    // Remote, and no Zoom room at all, since neither remaining mode uses one.
    expect(modeFieldVisibility(["In Person", "Remote"])).toEqual({
      room: true, zoomRoom: false, zoomHost: true,
    });
    expect(modeFieldVisibility(["Hybrid", "Remote"])).toEqual({
      room: true, zoomRoom: true, zoomHost: true,
    });
  });

  it("ignores unrecognised modes inside a set", () => {
    expect(modeFieldVisibility(["Remote", "Telepathic"])).toEqual(modeFieldVisibility(["Remote"]));
  });
});

describe("modeFieldRequirement", () => {
  it("matches visibility for a single mode", () => {
    for (const mode of ["Hybrid", "In Person", "Remote"]) {
      expect(modeFieldRequirement([mode])).toEqual(modeFieldVisibility([mode]));
    }
  });

  it("requires only what every candidate mode needs", () => {
    // Room is mounted for this pair (In Person needs it) but isn't required, since picking
    // Remote leaves it unused.
    expect(modeFieldRequirement(["In Person", "Remote"])).toEqual({
      room: false, zoomRoom: false, zoomHost: false,
    });
  });

  it("requires nothing when no mode is recognised", () => {
    expect(modeFieldRequirement([])).toEqual({ room: false, zoomRoom: false, zoomHost: false });
  });
});
