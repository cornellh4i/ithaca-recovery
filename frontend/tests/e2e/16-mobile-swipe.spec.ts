import { test, expect } from "./support/fixtures";
import { formatETDateString } from "../../util/timeUtils";

// Mobile-portrait viewport for this whole file -- no mobile Playwright project is configured
// (config/playwright.config.ts only has "chromium" desktop), so it's set per-file here.
// hasTouch/isMobile so framer-motion's drag="x" gesture recognition (Pointer Events under the
// hood) behaves the same as it would on a real phone.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Real mouse-drag sequences (down/move/up), not page.touchscreen (which is tap-only in
// Playwright) -- framer-motion's drag gesture is Pointer-Events-based and responds to a
// dragged mouse the same way it responds to a dragged finger in a real browser (unlike
// jsdom, which can't simulate this at all -- see WeekStrip.test.tsx's comment).
const dragHorizontally = async (page: import("@playwright/test").Page, x0: number, x1: number, y: number) => {
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, y, { steps: 5 });
  await page.mouse.move(x1, y, { steps: 5 });
  await page.mouse.up();
};

const addETDays = (date: Date, days: number): string => {
  const etDateStr = formatETDateString(date);
  const [y, m, d] = etDateStr.split("-").map(Number);
  return formatETDateString(new Date(Date.UTC(y, m - 1, d + days, 16, 0)));
};

test.describe("mobile swipe transitions", () => {
  test("16.1 swiping the day column left advances the selected day", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    // WeekStrip's aria-pressed is only set once React has hydrated (it's not present in the
    // static SSR HTML) -- waiting for it before the first gesture avoids a race where a drag
    // fires before framer-motion's pointer listeners have actually attached.
    await page.getByRole("button", { pressed: true }).waitFor({ state: "visible" });

    const todayEtDateStr = formatETDateString(new Date());
    const tomorrowEtDateStr = addETDays(new Date(), 1);

    // Swipe left on the day column (right side of the viewport, avoiding the WeekStrip up top).
    await dragHorizontally(page, 320, 60, 500);

    // The WeekStrip's now-selected day button reflects the new date.
    await expect(page.getByRole("button", { pressed: true })).toContainText(
      tomorrowEtDateStr.split("-")[2].replace(/^0/, "")
    );
    // Sanity: it actually moved off the original day.
    expect(tomorrowEtDateStr).not.toBe(todayEtDateStr);
  });

  test("16.2 swiping the day column right moves the selected day back", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    // WeekStrip's aria-pressed is only set once React has hydrated (it's not present in the
    // static SSR HTML) -- waiting for it before the first gesture avoids a race where a drag
    // fires before framer-motion's pointer listeners have actually attached.
    await page.getByRole("button", { pressed: true }).waitFor({ state: "visible" });

    // Move forward one day first so there's somewhere to swipe back from.
    await dragHorizontally(page, 320, 60, 500);
    const todayEtDateStr = formatETDateString(new Date());
    const tomorrowEtDateStr = addETDays(new Date(), 1);
    // Waits for the forward swipe to actually commit (its tween resolves before the date
    // changes) so the swipe back below starts from a settled state, not an overlapping one.
    await expect(page.getByRole("button", { pressed: true })).toContainText(
      tomorrowEtDateStr.split("-")[2].replace(/^0/, "")
    );

    // Swipe right back to today.
    await dragHorizontally(page, 60, 320, 500);

    await expect(page.getByRole("button", { pressed: true })).toContainText(
      todayEtDateStr.split("-")[2].replace(/^0/, "")
    );
  });

  test("16.3 swiping the week strip moves the selected day by 7 days", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    // WeekStrip's aria-pressed is only set once React has hydrated (it's not present in the
    // static SSR HTML) -- waiting for it before the first gesture avoids a race where a drag
    // fires before framer-motion's pointer listeners have actually attached.
    await page.getByRole("button", { pressed: true }).waitFor({ state: "visible" });

    const nextWeekEtDateStr = addETDays(new Date(), 7);

    // The week strip sits in the top ~90px of the mobile view (below the 48px navbar).
    await dragHorizontally(page, 320, 60, 60);

    await expect(page.getByRole("button", { pressed: true })).toContainText(
      nextWeekEtDateStr.split("-")[2].replace(/^0/, "")
    );
  });

  test("16.4 picking a date from the mini calendar bottom sheet updates the selected day", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    // WeekStrip's aria-pressed is only set once React has hydrated (it's not present in the
    // static SSR HTML) -- waiting for it before the first gesture avoids a race where a drag
    // fires before framer-motion's pointer listeners have actually attached.
    await page.getByRole("button", { pressed: true }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Navigate to a day" }).click();
    await expect(page.getByRole("dialog", { name: "Navigate to this day" })).toBeVisible();

    // The 15th is always inside the currently-displayed month (MiniCalendar defaults to the
    // month containing selectedDate) and never today (today is the 30th per this suite's
    // fixed test-run date) -- avoids the last-cell-in-grid trap of accidentally landing on a
    // leading/trailing "outside" day, which MiniCalendar's onSelect deliberately ignores.
    await page.locator('[class*="rdp-day_button"]', { hasText: "15" }).click();

    await expect(page.getByRole("dialog", { name: "Navigate to this day" })).not.toBeVisible();
    await expect(page.getByRole("button", { pressed: true })).toContainText("15");
  });
});
