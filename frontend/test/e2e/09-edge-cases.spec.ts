import { test, expect } from "./support/fixtures";
import { fillTimeRange, selectFromDropdown, toggleCalType } from "./support/formHelpers";
import { getTestPrismaClient } from "../factories/db";

// Manual script §9 (Edge Cases and Error Handling). These are mostly "note what
// happens" observational cases in the manual script rather than pass/fail — §9.3
// (cross-tab conflict), §9.4 (network loss), and §9.6 (tablet responsiveness) need
// real multi-context/offline/viewport conditions that don't add much value faked in
// an automated run, so they stay manual-only.

test.describe("edge cases", () => {
  test("9.1 submitting a past date/time is silently allowed, not blocked", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Past Meeting");
    await page.getByRole("button", { name: "In Person" }).click();

    // A date in the past (still MM/DD/YYYY — matches the DatePicker's real contract).
    const pastInput = page.getByPlaceholder("MM/DD/YYYY");
    await pastInput.fill("01/01/2020");
    await pastInput.blur();
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("past@test.icr");

    const dialogPromise = page.waitForEvent("dialog");
    await page.getByRole("button", { name: "Create Meeting" }).click();
    const dialog = await dialogPromise;
    // No past-date-specific wording — same success alert as any other creation.
    expect(dialog.message()).toContain("Meeting created successfully");
    await dialog.accept();

    const prisma = getTestPrismaClient();
    const created = await prisma.meeting.findFirst({ where: { title: "Past Meeting" } });
    expect(created).not.toBeNull();
  });

  test("9.2 an extremely long title is accepted with no character limit or warning", async ({ adminPage }) => {
    const { page } = adminPage;
    const longTitle = "A".repeat(500);
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill(longTitle);
    await expect(page.getByPlaceholder("Meeting title")).toHaveValue(longTitle);
  });

  // [CURRENT BEHAVIOR, NOT THE MANUAL SCRIPT'S EXPECTATION] The manual script expects
  // rapid clicks to produce only one meeting; NewMeeting.tsx's createMeeting() has no
  // submit debounce or disable-while-submitting guard, so each click fires its own
  // POST. Documents the real (undesirable) behavior rather than asserting the
  // aspirational one — update this test if a submit guard gets added.
  test("9.5 [CURRENT BEHAVIOR] rapidly clicking Create Meeting creates one meeting per click", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Rapid Click Meeting");
    await page.getByRole("button", { name: "In Person" }).click();
    const dateInput = page.getByPlaceholder("MM/DD/YYYY");
    await dateInput.fill("12/31/2026");
    await dateInput.blur();
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("rapid@test.icr");

    page.on("dialog", (dialog) => dialog.accept());
    const button = page.getByRole("button", { name: "Create Meeting" });
    await Promise.all([button.click(), button.click(), button.click()]);
    await page.waitForTimeout(1000);

    const prisma = getTestPrismaClient();
    const created = await prisma.meeting.findMany({ where: { title: "Rapid Click Meeting" } });
    expect(created).toHaveLength(3);
  });
});
