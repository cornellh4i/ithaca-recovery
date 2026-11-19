import { parseSignageView } from "../../util/filters/signageFilters";

const view = (query: string) => parseSignageView(new URLSearchParams(query));

describe("parseSignageView", () => {
  test("reads day and week, case-insensitively", () => {
    expect(view("view=day")).toBe("Day");
    expect(view("view=week")).toBe("Week");
    expect(view("view=WEEK")).toBe("Week");
  });

  // Month view exists on the main calendar only (GitHub #462): a signage URL asking for it
  // degrades to the default view instead of erroring.
  test.each(["view=month", "view=Month", "view=", "view=garbage", ""])("%j falls back to Day", (query) => {
    expect(view(query)).toBe("Day");
  });
});
