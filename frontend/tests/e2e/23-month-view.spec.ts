import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { selectView, toggleFilter } from "./support/formHelpers";
import {
  addDaysToETDateString,
  addMonthsToETDateString,
  convertETToUTC,
  formatETDateString,
  getETCalendarDateMs,
} from "../../util/date/timeUtils";
import { monthNameForETDateString } from "../../util/date/timeFormat";
import { getMonthGridRange } from "../../util/meetings/monthGrid";

// Month view (GitHub #457 / #462). Every date here is an ET calendar date: the app always
// shows Eastern Time, while Playwright's own clock runs in UTC (see playwright.config.ts).

const todayET = () => formatETDateString(new Date());
const etAt = (etDateStr: string, time: string) => new Date(convertETToUTC(`${etDateStr}T${time}:00`));
const weekdayOf = (etDateStr: string) => new Date(getETCalendarDateMs(etDateStr)).getUTCDay();
const monthHeading = (etDateStr: string) =>
  `${monthNameForETDateString(etDateStr)} ${etDateStr.slice(0, 4)}`;

// Scoped to Month view itself -- the sidebar's mini-calendar is also a grid named "<Month> <Year>".
const monthGrid = (page: Page, name: string) => page.getByTestId("month-view").getByRole("grid", { name });
// exact: "Next" alone also matches the mini-calendar's "Go to the Next Month" button.
const navButton = (page: Page, name: "Next" | "Previous") => page.getByRole("button", { name, exact: true });
const cell = (page: Page, etDateStr: string) => page.locator(`[data-date="${etDateStr}"]`);
// Scoped to the navbar's own view dropdown; its button is named after the current view.
const viewButton = (page: Page, view: string) =>
  page.locator('[class*="viewDropdown"]').getByRole("button", { name: view, exact: true });
const serenityCheckbox = (page: Page) =>
  page.locator('label:has-text("Serenity Room")').first().locator('input[type="checkbox"]');
const unityCheckbox = (page: Page) =>
  page.locator('[class*="meetingsFilter"] label:has-text("Unity Room")').first().locator('input[type="checkbox"]');

test.describe("month view", () => {
  test("23.1 Month is in the view switcher and shows this month's grid", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await selectView(page, "Month");

    await expect(viewButton(page, "Month")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(monthHeading(todayET()));
    await expect(monthGrid(page, monthHeading(todayET()))).toBeVisible();
    await expect(page.getByTestId("month-view").getByRole("gridcell")).toHaveCount(42);
    await expect(cell(page, todayET()).getByTestId("date-number")).toHaveAttribute("aria-current", "date");
  });

  test("23.2 switching Day -> Month -> Week keeps each view's own filters", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");

    await selectView(page, "Month");
    await toggleFilter(page, "Unity Room");
    await expect(unityCheckbox(page)).not.toBeChecked();

    await selectView(page, "Week");
    await expect(unityCheckbox(page)).toBeChecked();

    await selectView(page, "Month");
    await expect(unityCheckbox(page)).not.toBeChecked();

    await selectView(page, "Day");
    await expect(unityCheckbox(page)).toBeChecked();
    await expect(serenityCheckbox(page)).toBeChecked();
  });

  test("23.3 ‹ / › step by calendar month and Today returns to this month", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await selectView(page, "Month");
    const heading = page.getByRole("heading", { level: 2 });
    const today = todayET();

    await navButton(page, "Next").click();
    await expect(heading).toHaveText(monthHeading(addMonthsToETDateString(today, 1)));
    await expect(monthGrid(page, monthHeading(addMonthsToETDateString(today, 1)))).toBeVisible();

    await navButton(page, "Previous").click();
    await navButton(page, "Previous").click();
    await expect(heading).toHaveText(monthHeading(addMonthsToETDateString(today, -1)));

    await page.getByRole("link", { name: "Today" }).click();
    await expect(heading).toHaveText(monthHeading(today));
  });

  test("23.4 a day's popover lists its meetings and “Open day view →” opens that day", async ({ adminPage }) => {
    const { page } = adminPage;
    // The 15th of this month, so the cell is always in the grid's own month.
    const day = `${todayET().slice(0, 7)}-15`;
    await seedMeeting({ title: "Month Popover Meeting", room: "Serenity Room", startDateTime: etAt(day, "18:00"), endDateTime: etAt(day, "19:00") });
    await page.goto("/");
    await selectView(page, "Month");

    await expect(cell(page, day).getByTestId("meeting-dot")).toHaveCount(1);
    await cell(page, day).getByRole("button", { name: /meeting/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("1 meeting", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Month Popover Meeting")).toBeVisible();
    await expect(dialog.getByText("6 - 7 PM · Serenity Room")).toBeVisible();

    await dialog.getByRole("button", { name: "Open day view →" }).click();
    await expect(viewButton(page, "Day")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toContainText(
      `${monthNameForETDateString(day)} 15`,
    );
    await expect(page.getByText("Month Popover Meeting")).toBeVisible();
  });

  test("23.5 a weekly recurring meeting lands on its weekday across a month boundary", async ({ adminPage }) => {
    const { page } = adminPage;
    // Anchored on a Wednesday at least two weeks back, so the series predates every cell of
    // next month's grid -- and the anchor day itself (always rendered) is a Wednesday too.
    let anchor = addDaysToETDateString(todayET(), -14);
    anchor = addDaysToETDateString(anchor, -((weekdayOf(anchor) - 3 + 7) % 7));
    await seedRecurringMeeting(
      { title: "Recurring Month Meeting", room: "Unity Room", startDateTime: etAt(anchor, "18:00"), endDateTime: etAt(anchor, "19:00") },
      { type: "weekly", daysOfWeek: ["Wednesday"], interval: 1, startDate: etAt(anchor, "18:00") },
    );

    await page.goto("/");
    await selectView(page, "Month");
    await navButton(page, "Next").click();

    // Next month's 42-day grid always spans at least two calendar months (it has trailing
    // cells from the month after), so this crosses a month boundary by construction.
    const grid = getMonthGridRange(etAt(addMonthsToETDateString(todayET(), 1), "12:00"));
    await expect(monthGrid(page, monthHeading(grid.days[10]))).toBeVisible();
    const wednesdays = grid.days.filter(d => weekdayOf(d) === 3);
    expect(new Set(wednesdays.map(d => d.slice(0, 7))).size).toBeGreaterThan(1);

    const dots = page.locator('[data-testid="meeting-dot"][title$="Recurring Month Meeting"]');
    await expect(dots).toHaveCount(wednesdays.length);
    for (const wednesday of wednesdays) {
      await expect(cell(page, wednesday).locator('[title$="Recurring Month Meeting"]')).toHaveCount(1);
    }
    await expect(cell(page, addDaysToETDateString(wednesdays[2], 1)).locator('[title$="Recurring Month Meeting"]')).toHaveCount(0);
  });

  test("23.6 toggling a room filter hides and restores its dots", async ({ adminPage }) => {
    const { page } = adminPage;
    const day = `${todayET().slice(0, 7)}-14`;
    await seedMeeting({ title: "Serenity Month Dot", room: "Serenity Room", startDateTime: etAt(day, "09:00"), endDateTime: etAt(day, "10:00") });
    await seedMeeting({ title: "Unity Month Dot", room: "Unity Room", startDateTime: etAt(day, "11:00"), endDateTime: etAt(day, "12:00") });
    await page.goto("/");
    await selectView(page, "Month");

    const dots = cell(page, day).getByTestId("meeting-dot");
    await expect(dots).toHaveCount(2);

    await toggleFilter(page, "Unity Room");
    await expect(dots).toHaveCount(1);
    await expect(dots.first()).toHaveAttribute("title", "9 AM Serenity Month Dot");

    await toggleFilter(page, "Unity Room");
    await expect(dots).toHaveCount(2);
  });

  test("23.7 /signage?view=month falls back to Day view and offers no Month option", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/signage?view=month");
    await expect(viewButton(page, "Day")).toBeVisible();
    await expect(page.getByTestId("month-view")).toHaveCount(0);

    await viewButton(page, "Day").click();
    const options = page.locator('[class*="viewDropdown"]').getByRole("option");
    await expect(options).toHaveText(["Day", "Week"]);

    expect(pageErrors).toEqual([]);
  });
});
