import { MODE_ICON_NAME } from "../../util/rooms/modeIcons";

describe("MODE_ICON_NAME", () => {
  it("maps each known mode to its icon", () => {
    expect(MODE_ICON_NAME["In Person"]).toBe("location");
    expect(MODE_ICON_NAME.Remote).toBe("video-call");
    expect(MODE_ICON_NAME.Hybrid).toBe("co-present");
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])(
    "returns undefined for the inherited Object.prototype key %s",
    (key) => {
      expect(MODE_ICON_NAME[key]).toBeUndefined();
    },
  );
});
