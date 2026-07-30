import { test, expect } from "./support/fixtures";
import { fillTimeRange, selectFromDropdown, toggleCalType } from "./support/formHelpers";
import { seedRecurringMeeting } from "../factories/meeting";
import { getTestPrismaClient } from "../factories/db";

// Manual script §10 (Recurring Meetings). §10.4-10.6 (edit-updates-whole-series,
// delete "This event"/"All events") are already covered end-to-end in
// 03-meeting-editing.spec.ts and 04-meeting-deletion.spec.ts — this file owns
// creation (weekly/monthly) and future-occurrence rendering.

test.describe("recurring meetings", () => {
  test("10.1 creating a weekly recurring meeting shows recurrence options and saves a pattern", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Weekly Recurring Meeting");
    await page.getByRole("button", { name: "In Person" }).click();

    // Pick a Tuesday so the "On" day-button assertion below is unambiguous.
    const dateInput = page.getByPlaceholder("MM/DD/YYYY");
    await dateInput.fill("08/04/2026"); // a Tuesday
    await dateInput.blur();
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("weekly@test.icr");

    await page.getByText("This meeting is recurring", { exact: true }).click();
    await expect(page.getByText("Repeats", { exact: true })).toBeVisible();

    const dialogPromise = page.waitForEvent("dialog");
    await page.getByRole("button", { name: "Create Meeting" }).click();
    await (await dialogPromise).accept();

    const prisma = getTestPrismaClient();
    const meeting = await prisma.meeting.findFirst({ where: { title: "Weekly Recurring Meeting" } });
    expect(meeting?.isRecurring).toBe(true);
    const pattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting!.mid } });
    expect(pattern?.type).toBe("weekly");
    expect(pattern?.daysOfWeek).toEqual(["Tuesday"]);
  });

  test("10.2 creating a monthly recurring meeting saves the correct cadence", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Monthly Recurring Meeting");
    await page.getByRole("button", { name: "In Person" }).click();

    const dateInput = page.getByPlaceholder("MM/DD/YYYY");
    await dateInput.fill("08/11/2026"); // 2nd Tuesday of August 2026
    await dateInput.blur();
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("monthly@test.icr");

    await page.getByText("This meeting is recurring", { exact: true }).click();
    // The frequency dropdown already shows "Weekly" (its own default selection), so
    // it can't be opened by the "Select frequency" placeholder text.
    await page.getByRole("button", { name: "Weekly" }).click();
    await page.getByRole("option").filter({ hasText: "Monthly" }).click();

    // Switching to Monthly auto-selects "Monthly on day 11" (day-of-month is always
    // first in RecurringMeeting.tsx's getMonthlyOptions()) — explicitly pick the
    // Nth-weekday option instead.
    await page.getByRole("button", { name: "Monthly on day 11" }).click();
    await page.getByRole("option").filter({ hasText: "Monthly on the 2nd Tuesday" }).click();
    await expect(page.getByRole("button", { name: "Monthly on the 2nd Tuesday" })).toBeVisible();

    const dialogPromise = page.waitForEvent("dialog");
    await page.getByRole("button", { name: "Create Meeting" }).click();
    await (await dialogPromise).accept();

    const prisma = getTestPrismaClient();
    const meeting = await prisma.meeting.findFirst({ where: { title: "Monthly Recurring Meeting" } });
    const pattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting!.mid } });
    expect(pattern?.type).toBe("monthly");
    expect(pattern?.weekOfMonth).toBe(2);
    expect(pattern?.daysOfWeek).toEqual(["Tuesday"]);
  });

  test("10.3 future occurrences of a recurring meeting appear on the calendar", async ({ adminPage }) => {
    const { page } = adminPage;
    // ET, not the runner's local clock — see formHelpers.ts's todayMMDDYYYY for why.
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
    await seedRecurringMeeting(
      { title: "Recurring Occurrence Meeting" },
      { type: "weekly", daysOfWeek: [dayName], interval: 1 },
    );
    await page.goto("/");
    await expect(page.getByText("Recurring Occurrence Meeting")).toBeVisible();

    // Jump a week ahead — the ET-day-boundary math around DST is exactly what
    // meetingOccurrences.test.ts covers at the unit level; this just checks the
    // occurrence actually renders through the real day-retrieval API.
    await page.locator('img[alt="Right Arrow"]').click();
    await page.locator('img[alt="Right Arrow"]').click();
    await page.locator('img[alt="Right Arrow"]').click();
    await page.locator('img[alt="Right Arrow"]').click();
    await page.locator('img[alt="Right Arrow"]').click();
    await page.locator('img[alt="Right Arrow"]').click();
    await page.locator('img[alt="Right Arrow"]').click();
    await expect(page.getByText("Recurring Occurrence Meeting")).toBeVisible();
  });
});
