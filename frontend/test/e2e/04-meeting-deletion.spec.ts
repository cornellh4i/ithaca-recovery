import { test, expect } from "./support/fixtures";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { getTestPrismaClient } from "../factories/db";
import type { Page } from "@playwright/test";

async function openMeetingOptions(page: Page, title: string) {
  // Scoped to the card's h3 (not a plain getByText) — clicking a card also opens
  // ViewMeeting's <h1> of the same title, so a second call in the same test (e.g.
  // cancel-then-delete) would otherwise match both and violate strict mode.
  await page.getByRole("heading", { name: title, exact: true, level: 3 }).click();
  await page.locator('[class*="moreOptions"]').hover();
}

test.describe("meeting deletion", () => {
  test("4.1 deleting a non-recurring meeting requires confirmation via a modal", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "One-Off To Delete" });
    await page.goto("/");
    const prisma = getTestPrismaClient();

    // Clicking "Delete Meeting" opens a confirmation modal rather than deleting immediately.
    await openMeetingOptions(page, "One-Off To Delete");
    await page.getByRole("button", { name: "Delete Meeting", exact: true }).click();
    await expect(page.getByText("Delete this meeting?")).toBeVisible();
    await expect(page.getByText(/will be permanently removed from the calendar/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Delete this meeting?")).toHaveCount(0);

    const stillThere = await prisma.meeting.findFirst({ where: { title: "One-Off To Delete" } });
    expect(stillThere?.deletedAt).toBeNull();

    // Confirming via "Delete meeting" actually deletes it.
    page.on("dialog", (dialog) => dialog.accept());
    await openMeetingOptions(page, "One-Off To Delete");
    await page.getByRole("button", { name: "Delete Meeting", exact: true }).click();
    const deleteResponse = page.waitForResponse((r) => r.url().includes("/api/delete/meeting"));
    await page.getByRole("button", { name: "Delete meeting", exact: true }).click();
    await deleteResponse;

    await expect(page.getByText("One-Off To Delete")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("One-Off To Delete")).toHaveCount(0);

    // Deletion is a soft delete (deletedAt), not a hard remove.
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

  test("4.4 'All events' removes the entire series", async ({ adminPage }) => {
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
