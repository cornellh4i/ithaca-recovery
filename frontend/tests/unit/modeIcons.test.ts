import { MODE_ICON_SRC } from "../../util/modeIcons";

describe("MODE_ICON_SRC", () => {
  it("maps each known mode to its icon", () => {
    expect(MODE_ICON_SRC["In Person"]).toBe("/svg/location-icon.svg");
    expect(MODE_ICON_SRC.Remote).toBe("/svg/video-call-icon.svg");
    expect(MODE_ICON_SRC.Hybrid).toBe("/svg/co-present-icon.svg");
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])(
    "returns undefined for the inherited Object.prototype key %s",
    (key) => {
      expect(MODE_ICON_SRC[key]).toBeUndefined();
    },
  );
});
