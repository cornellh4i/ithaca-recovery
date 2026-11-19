import { DAY_WEEK_VIEWS, getDesktopCalendarViews, isMonthViewEnabled } from "../../util/common/calendarViews";

// Month view is dev-gated until GitHub #462 ships it -- production builds must never list it.
describe("desktop calendar views", () => {
  test("development builds offer Day, Week and Month", () => {
    expect(isMonthViewEnabled("development")).toBe(true);
    expect(getDesktopCalendarViews("development")).toEqual(["Day", "Week", "Month"]);
  });

  test.each(["production", "test", undefined])("a %s build offers only Day and Week", (env) => {
    expect(isMonthViewEnabled(env)).toBe(false);
    expect(getDesktopCalendarViews(env)).toEqual(["Day", "Week"]);
  });

  test("the Day/Week pair signage uses never includes Month", () => {
    expect(DAY_WEEK_VIEWS).toEqual(["Day", "Week"]);
  });
});
