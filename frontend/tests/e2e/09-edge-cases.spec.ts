import { test, expect } from "./support/fixtures";
import { fillTimeRange, selectFromDropdown, toggleCalType } from "./support/formHelpers";
import { getTestPrismaClient } from "../factories/db";

// Manual script §9 (Edge Cases and Error Handling). These are mostly "note what
// happens" observational cases in the manual script rather than pass/fail — §9.3
// (cross-tab conflict), §9.4 (network loss), and §9.6 (tablet responsiveness) need
// real multi-context/offline/viewport conditions that don't add much value faked in
// an automated run, so they stay manual-only.

test.describe("edge cases", () => {
  test("9.4 submitting a past date/time is silently allowed, not blocked", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Past Meeting");
    await page.getByRole("button", { name: "In Person", exact: true }).click();

    // A date in the past (still MM/DD/YYYY — matches the DatePicker's real contract).
    const pastInput = page.getByPlaceholder("MM/DD/YYYY");
    await pastInput.fill("01/01/2020");
    await pastInput.blur();
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("past@test.icr");

    await page.getByRole("button", { name: "Create Meeting" }).click();
    // No past-date-specific wording — same success toast as any other creation.
    await expect(page.getByText("Meeting created successfully")).toBeVisible();

    const prisma = getTestPrismaClient();
    const created = await prisma.meeting.findFirst({ where: { title: "Past Meeting" } });
    expect(created).not.toBeNull();
  });

  test("9.5 an extremely long title is accepted with no character limit or warning", async ({ adminPage }) => {
    const { page } = adminPage;
    const longTitle = "A".repeat(500);
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill(longTitle);
    await expect(page.getByPlaceholder("Meeting title")).toHaveValue(longTitle);
  });

  test("9.6 rapidly clicking Create Meeting only creates one meeting", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Rapid Click Meeting");
    await page.getByRole("button", { name: "In Person", exact: true }).click();
    const dateInput = page.getByPlaceholder("MM/DD/YYYY");
    await dateInput.fill("12/31/2026");
    await dateInput.blur();
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("rapid@test.icr");

    // By CSS class, not accessible name — the button's own text flips to
    // "Creating…" as soon as the first click lands (that's the fix), which
    // would otherwise make a by-name locator stop resolving for the rest.
    const button = page.locator('[class*="createMeetingButton"]');
    // dispatchEvent bypasses Playwright's actionability waiting (which would
    // otherwise just wait for the button to re-enable between clicks) — firing
    // all three as near-simultaneously as possible is what actually exercises
    // the isSubmitting guard in NewMeeting.tsx's createMeeting().
    await Promise.all([
      button.dispatchEvent("click"),
      button.dispatchEvent("click"),
      button.dispatchEvent("click"),
    ]);
    const prisma = getTestPrismaClient();
    await expect
      .poll(async () => {
        const created = await prisma.meeting.findMany({ where: { title: "Rapid Click Meeting" } });
        return created.length;
      })
      .toBe(1);
  });
});
