import { test, expect } from "./support/fixtures";
import { fillDatePicker, fillTimeRange, selectFromDropdown, selectView, toggleCalType, toggleFilter, todayMMDDYYYY } from "./support/formHelpers";
import { seedMeeting } from "../factories/meeting";
import { seedAdmin } from "../factories/admin";
import { getTestPrismaClient } from "../factories/db";
import { loginAs } from "./support/auth";
import { FAKE_ACCESS_TOKEN } from "./support/sync-fixtures";
import { Role } from "@prisma/client";

// Manual script §6 (Zoom Room Integration). The test env deliberately has no Zoom
// credentials configured (see support/sync-fixtures.ts), so any real sync attempt
// deterministically produces zoomSyncStatus: 'error' with zero network calls — that's
// what "sync attempted" cases below assert. §6.4/6.5/6.9/6.10 (opening a real Zoom
// link, checking a real Google Calendar, and Diagnostics' live reachability checks)
// need real external accounts and stay manual-only.

test.describe("zoom integration", () => {
  test("6.10 picking a Hybrid meeting's room auto-selects the matching Zoom Room", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByRole("button", { name: "Hybrid", exact: true }).click();
    await selectFromDropdown(page, "Select Room", "Serenity Room");

    await expect(page.getByRole("button", { name: "Serenity Room - Zoom" })).toBeVisible();
  });

  test("6.11 changing the auto-selected Zoom Room to a mismatched one flags it on the card", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({
      title: "Mismatched Zoom Meeting",
      modeType: "Hybrid",
      room: "Serenity Room",
      zoomRoom: "Unity Room - Zoom",
    });
    await page.goto("/");
    // The zoomTag mismatch badge (util/rooms.ts isZoomRoomMismatched) renders in both
    // Day view (DailyViewRow) and Week view (DayColumn) -- Day view used to silently
    // drop it (DayView.tsx never carried zoomRoom through its room/zoomRoom-bucketing,
    // and DailyViewRow never passed a zoomTag prop at all), so check both here rather
    // than only the view that happened to already work.
    await toggleFilter(page, "Serenity Room");
    await expect(page.getByTitle("Zoom room: Unity Room")).toBeVisible();

    await selectView(page, "Week");
    await expect(page.getByTitle("Zoom room: Unity Room")).toBeVisible();
  });

  test("6.12 a meeting with a Zoom Room set attempts a sync and surfaces the resulting status", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Zoom Sync Attempt");
    await page.getByRole("button", { name: "Hybrid", exact: true }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("zoom@test.icr");

    const writeResponse = page.waitForResponse((r) => r.url().includes("/api/write/meeting"));
    await page.getByRole("button", { name: "Create Meeting" }).click();
    await writeResponse;

    // No ZOOM_CLIENT_ID/SECRET/ACCOUNT_ID in the test env — getZoomAccessToken()
    // early-returns null, so the sync deterministically fails with zero network calls.
    // Sync runs in the background after the response (waitUntil), so poll rather than
    // reading the DB once immediately after writeResponse.
    const prisma = getTestPrismaClient();
    await expect.poll(async () => {
      const created = await prisma.meeting.findFirst({ where: { title: "Zoom Sync Attempt" } });
      return created?.zoomSyncStatus;
    }).toBe("error");
  });

  test("6.13 a meeting already synced to Zoom shows the success state and a real join link", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({
      title: "Synced Zoom Meeting",
      modeType: "Hybrid",
      zoomRoom: "Serenity Room - Zoom",
      zoomSyncStatus: "synced",
      zid: "1234567890",
      zoomLink: "https://zoom.us/j/1234567890",
    });
    await page.goto("/");
    // Hybrid meetings legitimately render twice (physical room column + Zoom room
    // column) — .first() picks either, they're the same underlying meeting.
    await page.getByText("Synced Zoom Meeting", { exact: true }).first().click();
    await expect(page.getByText("Synced", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Join Zoom Meeting" })).toHaveAttribute(
      "href",
      "https://zoom.us/j/1234567890",
    );
  });

  test("6.14 a failed Zoom sync shows a retry control that re-attempts on click", async ({ page, context }) => {
    // The retry-sync route 401s without a session accessToken (unlike create/update,
    // it doesn't fail soft) — the default adminPage fixture mints one without an
    // accessToken on purpose (see sync-fixtures.ts), so this test mints its own
    // session with the documented fake-but-truthy token to actually exercise retry.
    const admin = await seedAdmin(Role.ADMIN);
    await loginAs(context, admin.email, { accessToken: FAKE_ACCESS_TOKEN });

    await seedMeeting({
      title: "Zoom Retry Meeting",
      modeType: "Hybrid",
      zoomRoom: "Serenity Room - Zoom",
      zoomSyncStatus: "error",
    });
    await page.goto("/");
    await page.getByText("Zoom Retry Meeting", { exact: true }).first().click();
    await expect(page.locator("span", { hasText: /^Failed to sync$/ })).toBeVisible();

    const retryResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting/sync"));
    await page.getByRole("button", { name: "Retry sync" }).click();
    await retryResponse;
    // Credentials are still unset in the test env, so the retry deterministically
    // fails again — the point here is that the retry control fires the request.
    await expect(page.locator("span", { hasText: /^Failed to sync$/ })).toBeVisible();
  });

  test("6.15 Remote mode shows only the Zoom Host field, hiding Room and Zoom Room", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByRole("button", { name: "Remote", exact: true }).click();

    await expect(page.getByRole("button", { name: "Select Room" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Select Zoom Room" })).not.toBeVisible();
    // ZoomHostField defaults its Dropdown's value to "Automatic assignment", so (unlike
    // Room/Zoom Room, which start unselected) it never shows the "name" placeholder text.
    await expect(page.getByRole("button", { name: "Automatic assignment" })).toBeVisible();
  });

  test("6.16 In Person mode shows neither Zoom Room nor Zoom Host", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByRole("button", { name: "In Person", exact: true }).click();

    await expect(page.getByRole("button", { name: "Select Room" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select Zoom Room" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Automatic assignment" })).not.toBeVisible();
  });
});
