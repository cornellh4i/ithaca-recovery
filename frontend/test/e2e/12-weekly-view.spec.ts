import { test, expect } from "./support/fixtures";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { toggleFilter } from "./support/formHelpers";
import { convertETToUTC, formatETDateString } from "../../util/timeUtils";

// Manual script §12 (Weekly View). §12.5 (Zoom-room mismatch indicator) is also
// exercised in 06-zoom-integration.spec.ts's 6.2 — this file keeps its own copy
// since it's the section that actually owns Week view's rendering.

test.describe("weekly view", () => {
  test("12.1 Week view shows nothing until a room filter is checked", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Hidden Until Filtered", room: "Serenity Room" });
    await page.goto("/");
    await page.locator("select").selectOption("Week");
    await expect(page.getByText("Hidden Until Filtered")).toHaveCount(0);
  });

  test("12.2 checking a room filter shows that room's meetings, correctly positioned", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Week Room Meeting", room: "Serenity Room" });
    await page.goto("/");
    await page.locator("select").selectOption("Week");
    await toggleFilter(page, "Serenity Room");
    await expect(page.getByText("Week Room Meeting")).toBeVisible();
  });

  test("12.3 a recurring meeting spanning multiple weekdays appears on every matching day", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedRecurringMeeting(
      { title: "Multi Day Recurring", room: "Serenity Room" },
      { type: "weekly", daysOfWeek: ["Sunday", "Wednesday"], interval: 1 },
    );
    await page.goto("/");
    await page.locator("select").selectOption("Week");
    await toggleFilter(page, "Serenity Room");
    await expect(page.getByText("Multi Day Recurring")).toHaveCount(2);
  });

  test("12.4 2+ overlapping meetings share space with a +N indicator beyond 2", async ({ adminPage }) => {
    const { page } = adminPage;
    const etDate = formatETDateString(new Date());
    const start = new Date(convertETToUTC(`${etDate}T18:00:00`));
    const end = new Date(convertETToUTC(`${etDate}T19:00:00`));
    for (const title of ["Overlap A", "Overlap B", "Overlap C"]) {
      await seedMeeting({ title, room: "Serenity Room", startDateTime: start, endDateTime: end });
    }
    await page.goto("/");
    await page.locator("select").selectOption("Week");
    await toggleFilter(page, "Serenity Room");

    // layoutOverlappingMeetings shows up to 2 cards side-by-side plus a "+N" pill.
    await expect(page.getByText("+1")).toBeVisible();
  });

  test("12.5 a mismatched Zoom Room shows the mismatch badge on the card", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({
      title: "Week Mismatch Meeting",
      modeType: "Hybrid",
      room: "Serenity Room",
      zoomRoom: "Unity Room - Zoom",
    });
    await page.goto("/");
    await page.locator("select").selectOption("Week");
    await toggleFilter(page, "Serenity Room");
    await expect(page.getByTitle("Zoom room: Unity Room")).toBeVisible();
  });
});
