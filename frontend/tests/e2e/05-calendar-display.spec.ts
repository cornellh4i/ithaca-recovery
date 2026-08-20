import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";
import { selectView } from "./support/formHelpers";

// Manual script §5 (Calendar Display). §5.9 (2+ overlapping meetings sharing space
// with a "+N more" indicator) is DayColumn-specific behavior — DayView lays
// meetings out by absolute time position with no overlap-avoidance, so that case
// belongs to 12-weekly-view.spec.ts, which owns the "+N" mechanism.

test.describe("calendar display", () => {
  test("5.1 Day view loads and shows only today's meetings", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Today Meeting" });
    await page.goto("/");
    await expect(page.getByText("Today Meeting")).toBeVisible();
  });

  test("5.2 Week view shows the full week with every room checked by default", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Week View Meeting", room: "Serenity Room" });
    await page.goto("/");
    await selectView(page, "Week");
    await expect(page.getByText("Week View Meeting")).toBeVisible();
  });

  test("5.3 next/previous navigation changes the displayed date", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 2 });
    const initialLabel = await heading.textContent();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(heading).not.toHaveText(initialLabel ?? "");

    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(heading).toHaveText(initialLabel ?? "");
  });

  test("5.4 clicking a meeting block opens its details", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Clickable Meeting" });
    await page.goto("/");
    await page.getByText("Clickable Meeting", { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Clickable Meeting" })).toBeVisible();
  });

  test("5.5 a day with no meetings renders with no ghost data", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await expect(page.getByTestId(/^meeting-card-/)).toHaveCount(0);
  });

  test("5.6 multiple non-overlapping meetings in a room are all visible", async ({ adminPage }) => {
    const { page } = adminPage;
    const etDate = formatETDateString(new Date());
    await seedMeeting({
      title: "Morning Meeting",
      room: "Unity Room",
      startDateTime: new Date(convertETToUTC(`${etDate}T09:00:00`)),
      endDateTime: new Date(convertETToUTC(`${etDate}T10:00:00`)),
    });
    await seedMeeting({
      title: "Evening Meeting",
      room: "Unity Room",
      startDateTime: new Date(convertETToUTC(`${etDate}T20:00:00`)),
      endDateTime: new Date(convertETToUTC(`${etDate}T21:00:00`)),
    });
    await page.goto("/");
    await expect(page.getByText("Morning Meeting")).toBeVisible();
    await expect(page.getByText("Evening Meeting")).toBeVisible();
  });

  // Regression test for #350: the view-toggle icon and the unauthenticated "View only" pill
  // stayed a fixed pixel size while the rest of the header row scaled continuously with its
  // own container width (container queries, not viewport-based breakpoints). The pill in
  // particular couldn't scale at all -- it rendered as a DOM sibling of the container-query
  // root, not a descendant, so cqi units had no ancestor to resolve against.
  //
  // Since the sidebar started yielding before the calendar scrolls (SIDEBAR_YIELD_BREAKPOINT),
  // the narrow measurement runs with a compact sidebar, which *widens* the header row: the
  // smallest desktop-mode container is now ~640px, past the pill's own clamp cap (2cqi caps
  // 14px at ~524px) -- so the pill asserts at-cap at both widths, and continuous scaling is
  // observed on the view-toggle icon, whose clamp caps later (~824px container). The narrow
  // width sits below the yield edge, the wide one above the expand edge, and the measurement
  // waits for the full sidebar's cross-fade unmount instead of racing it.
  test("calendar header: view-toggle icon and 'View only' pill scale continuously with the header row's own width", async ({ page }) => {
    await page.goto("/");
    const viewToggleIcon = page.locator('[data-icon-name="view-timeline"]');
    const pillText = page.getByText("View only - sign in as Admin to manage meetings");
    const pillIcon = page.locator('[data-icon-name="lock"]');
    // "Clear all" only exists in the full sidebar's filter headers -- the compact variant's
    // icon strip (and its tooltips, which still say "Location") has no such text.
    const fullSidebarMarker = page.getByText("Clear all").first();

    await page.setViewportSize({ width: 1500, height: 900 });
    await expect(viewToggleIcon).toBeVisible();
    await expect(fullSidebarMarker).toBeVisible();
    const wideIconWidth = await viewToggleIcon.evaluate((el) => el.getBoundingClientRect().width);
    const widePillFontSize = parseFloat(await pillText.evaluate((el) => window.getComputedStyle(el).fontSize));
    const widePillIconWidth = await pillIcon.evaluate((el) => el.getBoundingClientRect().width);

    await page.setViewportSize({ width: 900, height: 900 });
    // The sidebar auto-collapses below SIDEBAR_YIELD_BREAKPOINT; wait for the full variant's
    // filter headings to unmount so the row is measured at its settled (compact-sidebar) width.
    await expect(fullSidebarMarker).toBeHidden();
    const narrowIconWidth = await viewToggleIcon.evaluate((el) => el.getBoundingClientRect().width);
    const narrowPillFontSize = parseFloat(await pillText.evaluate((el) => window.getComputedStyle(el).fontSize));
    const narrowPillIconWidth = await pillIcon.evaluate((el) => el.getBoundingClientRect().width);

    expect(narrowIconWidth).toBeLessThan(wideIconWidth);
    // Desktop mode can no longer reach the pill's sub-cap range -- both widths sit at the
    // clamp max, which is the "it scales with the container, not frozen mid-range" contract
    // #350 actually cares about.
    expect(narrowPillFontSize).toBe(14);
    expect(widePillFontSize).toBe(14);
    expect(narrowPillIconWidth).toBe(14);
    expect(widePillIconWidth).toBe(14);
  });
});
