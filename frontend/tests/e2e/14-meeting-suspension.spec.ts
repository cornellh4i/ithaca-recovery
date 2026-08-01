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
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
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
    await expect(suspendedPanel.getByText(/Suspended from .*, indefinitely/)).toBeVisible();

    // Opens ResumeMeetingModal (Immediately vs. On a date) rather than resuming on the spot --
    // the row's own "Resume" button stays mounted underneath, so the modal's confirm button is
    // disambiguated via its own testid, not by the kebab-closes trick other flows in this file use.
    await suspendedPanel.getByRole("button", { name: "Resume" }).click();
    const resumeModal = page.getByTestId("resume-meeting-modal");
    await expect(resumeModal.getByText("Resume this meeting?")).toBeVisible();

    const resumeResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting/resume"));
    await resumeModal.getByRole("button", { name: "Resume", exact: true }).click();
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
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await suspendResponse;

    const prisma = getTestPrismaClient();
    const meeting = await prisma.meeting.findFirst({ where: { title: "Delete Or Suspend Me" } });
    expect(meeting?.status).toBe("Suspended");
    expect(meeting?.deletedAt).toBeNull();
  });

  test("14.3 the kebab's 'Cancel scheduled suspension' opens ResumeMeetingModal instead of resuming immediately", async ({ adminPage }) => {
    const { page } = adminPage;
    const meeting = await seedMeeting({ title: "Future Suspend Me" });
    const prisma = getTestPrismaClient();
    // A suspension scheduled to start next week doesn't hide the meeting from today's view --
    // reachable through the normal calendar flow, unlike an already-active suspension.
    await prisma.meeting.update({ where: { mid: meeting.mid }, data: { status: "Suspended" } });
    await prisma.suspensionPeriod.create({
      data: { mid: meeting.mid, from: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), to: null },
    });

    await page.goto("/");
    await openMeetingOptions(page, "Future Suspend Me");
    await page.getByRole("button", { name: "Cancel scheduled suspension", exact: true }).click();

    const resumeModal = page.getByTestId("resume-meeting-modal");
    // Not yet active (the suspension's `from` is next week) -- the modal reads as cancelling a
    // scheduled suspension, not resuming an active one.
    await expect(resumeModal.getByText("Cancel scheduled suspension?")).toBeVisible();

    const resumeResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting/resume"));
    await resumeModal.getByRole("button", { name: "Cancel suspension", exact: true }).click();
    await resumeResponse;

    const resumed = await prisma.meeting.findFirst({ where: { mid: meeting.mid } });
    expect(resumed?.status).toBe("Active");
    const suspensions = await prisma.suspensionPeriod.findMany({ where: { mid: meeting.mid } });
    expect(suspensions.every((s) => s.to !== null)).toBe(true);
  });

  test("14.4 the Delete modal's 'Suspend instead' nudge is hidden once a suspension already exists", async ({ adminPage }) => {
    const { page } = adminPage;
    const meeting = await seedMeeting({ title: "Already Pending Suspend Me" });
    const prisma = getTestPrismaClient();
    await prisma.meeting.update({ where: { mid: meeting.mid }, data: { status: "Suspended" } });
    await prisma.suspensionPeriod.create({
      data: { mid: meeting.mid, from: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), to: null },
    });

    await page.goto("/");
    await openMeetingOptions(page, "Already Pending Suspend Me");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(/permanently removed/)).toBeVisible();
    // No "Suspend instead" nudge -- suspending again would just 409 against the pending one.
    await expect(page.getByText(/Not sure\?/)).toHaveCount(0);
  });
});
