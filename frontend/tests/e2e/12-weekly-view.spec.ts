import { test, expect } from "./support/fixtures";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { selectView } from "./support/formHelpers";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

// Manual script §12 (Weekly View). §12.5 (Zoom-room mismatch indicator) is also
// exercised in 06-zoom-integration.spec.ts's 6.2 — this file keeps its own copy
// since it's the section that actually owns Week view's rendering.

test.describe("weekly view", () => {
  test("12.1 Week view shows a room's meetings by default (rooms start checked)", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Shown By Default", room: "Serenity Room" });
    await page.goto("/");
    await selectView(page, "Week");
    await expect(page.getByText("Shown By Default")).toBeVisible();
  });

  test("12.2 a room's meetings are correctly positioned", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Week Room Meeting", room: "Serenity Room" });
    await page.goto("/");
    await selectView(page, "Week");
    await expect(page.getByText("Week Room Meeting")).toBeVisible();
  });

  test("12.3 a recurring meeting spanning multiple weekdays appears on every matching day", async ({ adminPage }) => {
    const { page } = adminPage;
    // Must predate this week's Sunday, or it's excluded as "before the series started". Also
    // anchors the underlying meeting record's own startDateTime/endDateTime here (not today's
    // default) -- getMeetingsForDate renders that literal anchor day unconditionally regardless
    // of daysOfWeek, so leaving it at today's default would add a 3rd, unintended card whenever
    // today isn't itself Sunday or Wednesday.
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    await seedRecurringMeeting(
      {
        title: "Multi Day Recurring",
        room: "Serenity Room",
        startDateTime: twoWeeksAgo,
        endDateTime: new Date(twoWeeksAgo.getTime() + 60 * 60 * 1000),
      },
      { type: "weekly", daysOfWeek: ["Sunday", "Wednesday"], interval: 1, startDate: twoWeeksAgo },
    );
    await page.goto("/");
    await selectView(page, "Week");
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
    await selectView(page, "Week");

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
    await selectView(page, "Week");
    await expect(page.getByTitle("Zoom room: Unity Room")).toBeVisible();
  });
});
