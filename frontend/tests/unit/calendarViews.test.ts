import { DAY_WEEK_VIEWS, DESKTOP_CALENDAR_VIEWS } from "../../util/common/calendarViews";

describe("calendar views", () => {
  // Month view ships in every build (GitHub #462 removed the development-only gate).
  test("the main calendar's desktop switcher offers Day, Week and Month", () => {
    expect(DESKTOP_CALENDAR_VIEWS).toEqual(["Day", "Week", "Month"]);
  });

  test("the Day/Week pair signage uses never includes Month", () => {
    expect(DAY_WEEK_VIEWS).toEqual(["Day", "Week"]);
  });
});
