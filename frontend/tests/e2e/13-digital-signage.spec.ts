import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { getCurrentETMinutesSinceMidnight } from "../../util/date/timeUtils";

// Mirrors WeekView.tsx's own scrollToCurrentTime formula exactly -- used to compute the
// expected scrollTop rather than asserting a blind ">0", which would be a false negative in
// the near-midnight window (first ~100 ET minutes) where the real formula also clamps to 0.
const expectedWeekScrollTop = (): number => {
  const dayHeaderOffset = 40;
  const scrollOffset = dayHeaderOffset + getCurrentETMinutesSinceMidnight() * (120 / 60) - 240;
  return Math.max(0, scrollOffset);
};

// Manual script §13 (Digital Signage). §13.4 (midnight ET rollover) and §13.5
// (picking up changes within ~2 minutes) depend on real elapsed time or clock
// mocking that isn't worth the complexity/runtime cost here — both are simple
// `setInterval` polls in signage/page.tsx, readable directly from the source, and
// stay manual-only per the plan.

test.describe("digital signage", () => {
  test("13.3 /signage renders fully while signed out, with no sign-in prompt", async ({ page }) => {
    await seedMeeting({ title: "Signage Meeting" });
    await page.goto("/signage");
    await expect(page.getByText("Signage Meeting")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toHaveCount(0);
  });

  test("13.4 clicking a meeting block on signage does nothing — it's read-only", async ({ page }) => {
    await seedMeeting({ title: "Read Only Meeting" });
    await page.goto("/signage");
    await page.getByText("Read Only Meeting", { exact: true }).click();
    // No detail panel exists on this page at all — clicking just doesn't error out,
    // and the meeting card is still the only thing on screen.
    await expect(page.getByText("Read Only Meeting")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  });

  test("13.5 a filtered signage URL only shows the selected room", async ({ page }) => {
    await seedMeeting({ title: "Serenity Signage Meeting", room: "Serenity Room" });
    await seedMeeting({ title: "Unity Signage Meeting", room: "Unity Room" });
    await page.goto("/signage?rooms=Serenity&view=day");
    await expect(page.getByText("Serenity Signage Meeting")).toBeVisible();
    await expect(page.getByText("Unity Signage Meeting")).toHaveCount(0);
  });

  // Regression test: CalendarNavbar used to own selectedView as its own local state, always
  // initialized to "Day" regardless of what a caller wanted rendered -- /signage?view=week
  // seeded WeekView from this URL param, but the navbar still believed it was in Day view (its
  // own dropdown/heading showed Day-formatted text, and its arrows stepped by 1 day instead of
  // 7). selectedView is now a controlled prop threaded from this page's own `view` state.
  test("13.7 /signage?view=week renders the week view and the navbar agrees", async ({ page }) => {
    await seedMeeting({ title: "Week View Signage Meeting" });
    await page.goto("/signage?view=week");
    await expect(page.getByText("Week View Signage Meeting")).toBeVisible();
    // The navbar's own view dropdown must read "Week", not the "Day" it would show if it were
    // still tracking view as disconnected local state defaulting to "Day".
    await expect(page.getByRole("button", { name: "Week" })).toBeVisible();
  });

  // Regression test for #348: the auto-fit scale calculation used to be gated on a plain
  // useRef, which isn't reactive -- on a fresh direct navigation (not a click-through from an
  // already-scaled state) the effect fired before the content div ever mounted and never
  // re-ran, leaving the page stuck at scale(1) until something else (a view switch) happened
  // to force a re-run. Deliberately does a fresh page.goto (not reusing a warmed-up page) to
  // match the bug's actual repro path.
  test("13.6 /signage rescales to fit the viewport on first direct navigation, without a view switch", async ({ page }) => {
    await seedMeeting({ title: "Direct Nav Signage Meeting" });
    await page.goto("/signage");
    await expect(page.getByText("Direct Nav Signage Meeting")).toBeVisible();

    const contentDiv = page.locator('div[style*="transform"]').first();
    const transform = await contentDiv.evaluate((el) => window.getComputedStyle(el).transform);
    // scale(1) resolves to the identity matrix -- if the auto-fit calculation never ran, this
    // is exactly what a fresh, unscaled render would still show.
    expect(transform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  });

  // Extends 13.6 to Week -- 13.6 alone is Day-only, so a Week-specific scale regression (the
  // width-based branch, or the bounded-height wrapping added for the scroll fix below) could
  // silently reintroduce scale(1) without tripping any existing test.
  test("13.6b /signage?view=week rescales to fit the viewport, plain and filtered", async ({ page }) => {
    await seedMeeting({ title: "Week Scale Signage Meeting" });
    await page.goto("/signage?view=week");
    await expect(page.getByText("Week Scale Signage Meeting")).toBeVisible();

    const contentDiv = page.locator('div[style*="transform"]').first();
    const transform = await contentDiv.evaluate((el) => window.getComputedStyle(el).transform);
    expect(transform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");

    await seedMeeting({ title: "Week Scale Filtered Meeting", room: "Serenity Room" });
    await page.goto("/signage?view=week&rooms=Serenity");
    await expect(page.getByText("Week Scale Filtered Meeting")).toBeVisible();

    const filteredContentDiv = page.locator('div[style*="transform"]').first();
    const filteredTransform = await filteredContentDiv.evaluate((el) => window.getComputedStyle(el).transform);
    expect(filteredTransform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  });

  // Regression test for #448: WeekView's internal scroll container (.viewContainer) needs a
  // bounded flex-column ancestor to actually overflow -- signage's contentEl used to be an
  // unbounded plain div, so scrollHeight === clientHeight and scrollToCurrentTime's scrollTop
  // assignment silently no-opped (the page's own overflow:auto wrapper scrolled instead, or
  // -- once that was also removed -- nothing scrolled at all).
  test("13.8 /signage?view=week scrolls its internal grid to the current time", async ({ page }) => {
    await seedMeeting({ title: "Week Scroll Signage Meeting" });
    await page.goto("/signage?view=week");
    const container = page.getByTestId("week-view-scroll-container");
    await expect(container).toBeVisible();

    const expected = expectedWeekScrollTop();
    const scrollTop = await container.evaluate((el) => el.scrollTop);
    if (expected > 0) {
      expect(scrollTop).toBeGreaterThan(0);
    } else {
      expect(scrollTop).toBe(0);
    }
  });

  // Same assertion as 13.8, filtered -- the filtered-navbar symptom reported alongside the
  // scroll bug suggested the filtered path might diverge from the plain one.
  test("13.9 a filtered /signage?view=week URL still scrolls its internal grid to the current time", async ({ page }) => {
    await seedMeeting({ title: "Week Scroll Filtered Meeting", room: "Serenity Room" });
    await page.goto("/signage?view=week&rooms=Serenity");
    const container = page.getByTestId("week-view-scroll-container");
    await expect(container).toBeVisible();

    const expected = expectedWeekScrollTop();
    const scrollTop = await container.evaluate((el) => el.scrollTop);
    if (expected > 0) {
      expect(scrollTop).toBeGreaterThan(0);
    } else {
      expect(scrollTop).toBe(0);
    }
  });
});
