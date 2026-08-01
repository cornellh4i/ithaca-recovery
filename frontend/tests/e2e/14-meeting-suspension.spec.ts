import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { getTestPrismaClient } from "../factories/db";
import type { Page } from "@playwright/test";

async function openMeetingOptions(page: Page, title: string) {
  // level: 3 avoids colliding with ViewMeeting's <h1> of the same title.
  await page.getByRole("heading", { name: title, exact: true, level: 3 }).click();
  await page.getByRole("button", { name: "Meeting options" }).click();
}

test.describe("meeting suspension", () => {
  test("14.1 suspending a meeting hides it from the live calendar and surfaces it in Diagnostics, and resuming reverses both", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Suspend Me" });
    await page.goto("/");

    await openMeetingOptions(page, "Suspend Me");
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("Suspend this meeting?")).toBeVisible();

    const suspendResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting/suspend"));
    await page.getByRole("button", { name: "Suspend meeting", exact: true }).click();
    await suspendResponse;

    // Hidden from the live Day view.
    await expect(page.getByText("Suspend Me")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Suspend Me")).toHaveCount(0);

    const prisma = getTestPrismaClient();
    const suspended = await prisma.meeting.findFirst({ where: { title: "Suspend Me" } });
    expect(suspended?.status).toBe("Suspended");
    const suspensions = await prisma.suspensionPeriod.findMany({ where: { mid: suspended?.mid } });
    expect(suspensions).toHaveLength(1);
    expect(suspensions[0].to).toBeNull();

    // Surfaces in Diagnostics' suspended panel with a Resume action.
    await page.goto("/admin");
    const suspendedPanel = page.getByTestId("diagnostics-suspended-panel");
    await expect(suspendedPanel.getByText("Suspend Me")).toBeVisible();
    await expect(suspendedPanel.getByText("Suspended indefinitely")).toBeVisible();

    const resumeResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting/resume"));
    await suspendedPanel.getByRole("button", { name: "Resume" }).click();
    await resumeResponse;
    await expect(suspendedPanel.getByText("Suspend Me")).toHaveCount(0);

    // Reappears on the live Day view.
    const dayResponse = page.waitForResponse((r) => r.url().includes("/api/retrieve/meeting/day"));
    await page.goto("/");
    await dayResponse;
    await expect(page.getByText("Suspend Me")).toBeVisible();

    const resumed = await prisma.meeting.findFirst({ where: { title: "Suspend Me" } });
    expect(resumed?.status).toBe("Active");
  });

  test("14.2 the Delete confirmation modal offers Suspend as an alternative", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Delete Or Suspend Me" });
    await page.goto("/");

    await openMeetingOptions(page, "Delete Or Suspend Me");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(/Not sure\?/)).toBeVisible();

    const suspendResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting/suspend"));
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("Suspend this meeting?")).toBeVisible();
    await page.getByRole("button", { name: "Suspend meeting", exact: true }).click();
    await suspendResponse;

    const prisma = getTestPrismaClient();
    const meeting = await prisma.meeting.findFirst({ where: { title: "Delete Or Suspend Me" } });
    expect(meeting?.status).toBe("Suspended");
    expect(meeting?.deletedAt).toBeNull();
  });
});
