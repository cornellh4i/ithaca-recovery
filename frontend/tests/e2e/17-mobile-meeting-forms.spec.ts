import { test, expect } from "./support/fixtures";
import type { Page } from "@playwright/test";
import { fillDatePicker, fillTimeRange, selectFromDropdown, toggleCalType, todayMMDDYYYY } from "./support/formHelpers";
import { seedMeeting } from "../factories/meeting";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

// Mobile-portrait viewport for this whole file -- no mobile Playwright project is configured
// (config/playwright.config.ts only has "chromium" desktop), so it's set per-file here.
test.use({ viewport: { width: 390, height: 844 } });

// Two real races, not one -- both need to settle before interacting:
// 1. isAdmin starts null (not false) until /api/auth/status resolves, and ViewMeeting's kebab
//    menu (Meeting options) is gated on isAdmin being truthy -- null && (...) is falsy too, so
//    a click that races ahead of this fetch finds no kebab at all, not just a hidden one.
// 2. useIsPhone() starts false to match the server-rendered HTML, then corrects itself in a
//    layout effect on an actual phone -- but next dev's on-demand compile can still stretch
//    that window enough for an early interaction to land against the still-mounted desktop
//    DayView instead. WeekStrip only exists once the mobile branch has actually rendered,
//    so waiting for it is a real signal for this, not a proxy.
async function gotoAndWaitForMobileReady(page: Page): Promise<void> {
  const authResponse = page.waitForResponse((r) => r.url().includes("/api/auth/status"));
  await page.goto("/");
  await authResponse;
  await page.getByRole("button", { pressed: true }).waitFor({ state: "visible" });
}

test.describe("mobile meeting interactions", () => {
  test("17.1 tapping a meeting opens ViewMeeting in a bottom sheet", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Mobile Sheet Meeting", room: "Serenity Room" });
    await gotoAndWaitForMobileReady(page);

    await page.getByText("Mobile Sheet Meeting", { exact: true }).click();

    const sheet = page.getByRole("dialog", { name: "Mobile Sheet Meeting" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Serenity Room")).toBeVisible();
  });

  test("17.2 the FAB opens New Meeting full-screen, and submitting it creates the meeting", async ({ adminPage }) => {
    const { page } = adminPage;
    await gotoAndWaitForMobileReady(page);

    await page.getByRole("button", { name: "New meeting" }).click();
    await expect(page.getByRole("heading", { name: "New Meeting" })).toBeVisible();

    await page.getByPlaceholder("Meeting title").fill("Mobile FAB Meeting");
    await page.getByRole("button", { name: "In Person" }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("mobile-fab@test.icr");

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Meeting created successfully")).toBeVisible();

    // Full-screen form closes back down, the new meeting is now visible on the calendar.
    await expect(page.getByRole("heading", { name: "New Meeting" })).not.toBeVisible();
    await expect(page.getByText("Mobile FAB Meeting", { exact: true })).toBeVisible();
  });

  test("17.3 editing from within the ViewMeeting sheet opens Edit full-screen", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Mobile Edit Meeting", room: "Serenity Room" });
    await gotoAndWaitForMobileReady(page);

    await page.getByText("Mobile Edit Meeting", { exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Mobile Edit Meeting" })).toBeVisible();
    await page.getByRole("button", { name: "Meeting options" }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await expect(page.getByPlaceholder("Meeting title")).toHaveValue("Mobile Edit Meeting");
    // ViewMeeting's bottom sheet is gone -- Edit fully replaces it, not stacked on top.
    await expect(page.getByRole("dialog", { name: "Mobile Edit Meeting" })).not.toBeVisible();
  });

  test("17.4 an overlapping-meetings '+N' popup still renders as a centered modal, not a sheet", async ({ adminPage }) => {
    const { page } = adminPage;
    // formatETDateString/convertETToUTC (not new Date().toISOString()) -- the suite runs
    // with timezoneId: "UTC" (config/playwright.config.ts), so a plain UTC date slice can
    // land on the wrong calendar day relative to ET near ET's midnight boundary.
    const etDate = formatETDateString(new Date());
    const start = new Date(convertETToUTC(`${etDate}T18:00:00`));
    const end = new Date(convertETToUTC(`${etDate}T19:00:00`));
    // Mobile shows up to MOBILE_MAX_VISIBLE_OVERLAP (4, see DayPortraitView.tsx) side by
    // side before folding -- 5 is the first count that actually triggers a "+N" pill.
    for (const title of ["Overlap Mobile A", "Overlap Mobile B", "Overlap Mobile C", "Overlap Mobile D", "Overlap Mobile E"]) {
      await seedMeeting({ title, room: "Serenity Room", startDateTime: start, endDateTime: end });
    }
    await gotoAndWaitForMobileReady(page);

    await page.getByRole("button", { name: /more meetings at this time/ }).click();

    // OverlapMeetingsModal has no role="dialog" and no drag grabber (unlike BottomSheet) --
    // confirms it stayed a plain centered modal rather than getting swept into the bottom-
    // sheet treatment.
    const modal = page.locator('[class*="modalContent"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[class*="grabber"]')).toHaveCount(0);
  });
});
