import { test, expect } from "./support/fixtures";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { getTestPrismaClient } from "../factories/db";
import type { Page } from "@playwright/test";

async function openMeetingOptions(page: Page, title: string) {
  await page.getByText(title, { exact: true }).click();
  await page.locator('[class*="moreOptions"]').hover();
}

test.describe("meeting deletion", () => {
  test("4.1, 4.6, 4.7 deleting a non-recurring meeting is immediate, with no confirmation prompt", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "One-Off To Delete" });
    await page.goto("/");
    await openMeetingOptions(page, "One-Off To Delete");

    // The point of this test is that there's no confirm() prompt before deletion
    // (flagged as an easy-to-miss risk in the manual script) — there IS a normal
    // success alert() afterward, which must still be dismissed or the page hangs.
    let confirmDialogFired = false;
    page.on("dialog", (dialog) => {
      if (dialog.type() === "confirm") confirmDialogFired = true;
      dialog.accept();
    });

    const deleteResponse = page.waitForResponse((r) => r.url().includes("/api/delete/meeting"));
    await page.getByRole("button", { name: "Delete Meeting" }).click();
    await deleteResponse;
    expect(confirmDialogFired).toBe(false);

    await expect(page.getByText("One-Off To Delete")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("One-Off To Delete")).toHaveCount(0);

    // Deletion is a soft delete (deletedAt), not a hard remove — the routes/UI
    // filter it out, but the row itself still exists.
    const prisma = getTestPrismaClient();
    const found = await prisma.meeting.findFirst({ where: { title: "One-Off To Delete" } });
    expect(found?.deletedAt).not.toBeNull();
  });

  test("4.2 deleting a recurring meeting opens the delete-recurring dialog", async ({ adminPage }) => {
    const { page } = adminPage;
    const { meeting } = await seedRecurringMeeting({ title: "Recurring To Delete" });
    await page.goto("/");
    await openMeetingOptions(page, "Recurring To Delete");
    await page.getByRole("button", { name: "Delete Meeting" }).click();

    await expect(page.getByLabel("This event")).toBeVisible();
    await expect(page.getByLabel("This and following events")).toBeVisible();
    await expect(page.getByLabel("All events")).toBeVisible();

    const prisma = getTestPrismaClient();
    const stillThere = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    expect(stillThere).not.toBeNull();
  });

  test("4.3 'This event' removes only the clicked occurrence's date, series survives", async ({ adminPage }) => {
    const { page } = adminPage;
    const { meeting } = await seedRecurringMeeting({ title: "Delete This Occurrence" });
    await page.goto("/");
    await openMeetingOptions(page, "Delete This Occurrence");
    await page.getByRole("button", { name: "Delete Meeting" }).click();
    await page.getByLabel("This event").check();

    page.on("dialog", (dialog) => dialog.accept());
    const deleteResponse = page.waitForResponse((r) => r.url().includes("/api/delete/meeting"));
    await page.getByRole("button", { name: "OK" }).click();
    await deleteResponse;

    const prisma = getTestPrismaClient();
    const series = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    expect(series).not.toBeNull(); // series itself survives
    const pattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
    expect(pattern?.excludedDates.length).toBeGreaterThan(0);
  });

  test("4.5 'All events' removes the entire series", async ({ adminPage }) => {
    const { page } = adminPage;
    const { meeting } = await seedRecurringMeeting({ title: "Delete Whole Series" });
    await page.goto("/");
    await openMeetingOptions(page, "Delete Whole Series");
    await page.getByRole("button", { name: "Delete Meeting" }).click();
    await page.getByLabel("All events").check();

    page.on("dialog", (dialog) => dialog.accept());
    const deleteResponse = page.waitForResponse((r) => r.url().includes("/api/delete/meeting"));
    await page.getByRole("button", { name: "OK" }).click();
    await deleteResponse;

    const prisma = getTestPrismaClient();
    const series = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    expect(series?.deletedAt).not.toBeNull();
  });
});
