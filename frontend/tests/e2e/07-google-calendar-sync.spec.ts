import { test, expect } from "./support/fixtures";
import { fillDatePicker, fillTimeRange, selectFromDropdown, toggleCalType, todayMMDDYYYY } from "./support/formHelpers";
import { seedMeeting } from "../factories/meeting";
import { seedAdmin } from "../factories/admin";
import { getTestPrismaClient } from "../factories/db";
import { loginAs } from "./support/auth";
import { FAKE_ACCESS_TOKEN } from "./support/sync-fixtures";
import { Role } from "@prisma/client";

// Manual script §7 (Google Calendar Sync). Verifying events actually land on a real
// Google Calendar (§7.1-7.5) needs real credentials and stays manual-only — what's
// automatable here is the app's own sync-attempt/status-badge behavior. The test env
// has a truthy-but-fake session accessToken (see support/sync-fixtures.ts) available
// where needed to make GCal sync actually attempt (it's gated on a real accessToken,
// unlike Zoom); with no GOOGLE_CALENDAR_* configured, an attempt deterministically
// fails with zero real network calls.

test.describe("google calendar sync", () => {
  test("7.7 creating a meeting with no session accessToken never attempts a sync, but records it as an error", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("No Token Meeting");
    await page.getByRole("button", { name: "In Person" }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("notoken@test.icr");

    const writeResponse = page.waitForResponse((r) => r.url().includes("/api/write/meeting"));
    await page.getByRole("button", { name: "Create Meeting" }).click();
    await writeResponse;

    // A missing accessToken is never a silent no-op: googleSyncStatus must land on an
    // explicit 'error' (not stay null forever) so a missing sync surfaces on Diagnostics
    // instead of looking healthy. Sync runs in the background after the response
    // (waitUntil), so poll rather than reading the DB once immediately after writeResponse.
    const prisma = getTestPrismaClient();
    await expect.poll(async () => {
      const created = await prisma.meeting.findFirst({ where: { title: "No Token Meeting" } });
      return created?.googleSyncStatus;
    }).toBe("error");

    const created = await prisma.meeting.findFirst({ where: { title: "No Token Meeting" } });
    expect(created?.googleSyncError).toBeTruthy();
  });

  test("7.8 creating a meeting with a session accessToken attempts a sync for every checked category", async ({ page, context }) => {
    const admin = await seedAdmin(Role.ADMIN);
    await loginAs(context, admin.email, { accessToken: FAKE_ACCESS_TOKEN });

    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Dual Calendar Meeting");
    await page.getByRole("button", { name: "In Person" }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await toggleCalType(page, "Other");
    await page.getByPlaceholder("Email").fill("dualcal@test.icr");

    const writeResponse = page.waitForResponse((r) => r.url().includes("/api/write/meeting"));
    await page.getByRole("button", { name: "Create Meeting" }).click();
    await writeResponse;

    // No GOOGLE_CALENDAR_AA/OTHER configured in the test env — the sync attempt
    // deterministically fails with zero real network calls (see sync-fixtures.ts).
    // Sync runs in the background after the response (waitUntil), so poll rather than
    // reading the DB once immediately after writeResponse.
    const prisma = getTestPrismaClient();
    await expect.poll(async () => {
      const created = await prisma.meeting.findFirst({ where: { title: "Dual Calendar Meeting" } });
      return created?.googleSyncStatus;
    }).toBe("error");
  });

  test("7.9 a failed sync shows a ⚠ badge and offers a retry", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "GCal Retry Meeting", googleSyncStatus: "error" });
    await page.goto("/");
    await page.getByText("GCal Retry Meeting", { exact: true }).click();
    await expect(page.locator("span", { hasText: /^Failed to sync$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry sync" })).toBeVisible();
  });

  // A synced meeting has no dedicated "success" indicator by design (ViewMeeting's status
  // band only ever renders for a problem -- sync failure, conflict, or suspension); the
  // observable success state is simply the absence of the failure band and its Retry button.
  test("7.10 a successfully-synced meeting shows no failure state", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "GCal Synced Meeting", googleSyncStatus: "synced" });
    await page.goto("/");
    await page.getByText("GCal Synced Meeting", { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "GCal Synced Meeting" })).toBeVisible();
    await expect(page.getByText("Failed to sync")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry sync" })).toHaveCount(0);
  });
});
