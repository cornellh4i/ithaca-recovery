import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";
import { selectView } from "./support/formHelpers";

// Manual script §5 (Calendar Display). §5.9 (2+ overlapping meetings sharing space
// with a "+N more" indicator) is DayColumn-specific behavior — DayView lays
// meetings out by absolute time position with no overlap-avoidance, so that case
// belongs to 12-weekly-view.spec.ts, which owns the "+N" mechanism.

test.describe("calendar display", () => {
  test("5.1 Day view loads and shows only today's meetings", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Today Meeting" });
    await page.goto("/");
    await expect(page.getByText("Today Meeting")).toBeVisible();
  });

  test("5.2 Week view shows the full week with every room checked by default", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Week View Meeting", room: "Serenity Room" });
    await page.goto("/");
    await selectView(page, "Week");
    await expect(page.getByText("Week View Meeting")).toBeVisible();
  });

  test("5.3 next/previous navigation changes the displayed date", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 2 });
    const initialLabel = await heading.textContent();

    await page.locator('img[alt="Right Arrow"]').click();
    await expect(heading).not.toHaveText(initialLabel ?? "");

    await page.locator('img[alt="Left Arrow"]').click();
    await expect(heading).toHaveText(initialLabel ?? "");
  });

  test("5.4 clicking a meeting block opens its details", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Clickable Meeting" });
    await page.goto("/");
    await page.getByText("Clickable Meeting", { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Clickable Meeting" })).toBeVisible();
  });

  test("5.5 a day with no meetings renders with no ghost data", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await expect(page.getByTestId(/^meeting-card-/)).toHaveCount(0);
  });

  test("5.6 multiple non-overlapping meetings in a room are all visible", async ({ adminPage }) => {
    const { page } = adminPage;
    const etDate = formatETDateString(new Date());
    await seedMeeting({
      title: "Morning Meeting",
      room: "Unity Room",
      startDateTime: new Date(convertETToUTC(`${etDate}T09:00:00`)),
      endDateTime: new Date(convertETToUTC(`${etDate}T10:00:00`)),
    });
    await seedMeeting({
      title: "Evening Meeting",
      room: "Unity Room",
      startDateTime: new Date(convertETToUTC(`${etDate}T20:00:00`)),
      endDateTime: new Date(convertETToUTC(`${etDate}T21:00:00`)),
    });
    await page.goto("/");
    await expect(page.getByText("Morning Meeting")).toBeVisible();
    await expect(page.getByText("Evening Meeting")).toBeVisible();
  });
});
