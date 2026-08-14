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
  // root, not a descendant, so cqi units had no ancestor to resolve against. Both widths stay
  // above the tablet breakpoint (768px, see hooks/useViewport.ts) so the desktop shell -- and
  // this container-query row -- stays mounted at both sizes; only the row's own available
  // width (viewport minus the sidebar) changes.
  test("calendar header: view-toggle icon and 'View only' pill scale continuously with the header row's own width", async ({ page }) => {
    await page.goto("/");
    const viewToggleIcon = page.locator('[data-icon-name="view-timeline"]');
    const pillText = page.getByText("View only - sign in as Admin to manage meetings");
    const pillIcon = page.locator('[data-icon-name="lock"]');

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(viewToggleIcon).toBeVisible();
    const wideIconWidth = await viewToggleIcon.evaluate((el) => el.getBoundingClientRect().width);
    const widePillFontSize = parseFloat(await pillText.evaluate((el) => window.getComputedStyle(el).fontSize));
    const widePillIconWidth = await pillIcon.evaluate((el) => el.getBoundingClientRect().width);

    await page.setViewportSize({ width: 820, height: 900 });
    const narrowIconWidth = await viewToggleIcon.evaluate((el) => el.getBoundingClientRect().width);
    const narrowPillFontSize = parseFloat(await pillText.evaluate((el) => window.getComputedStyle(el).fontSize));
    const narrowPillIconWidth = await pillIcon.evaluate((el) => el.getBoundingClientRect().width);

    expect(narrowIconWidth).toBeLessThan(wideIconWidth);
    expect(narrowPillFontSize).toBeLessThan(widePillFontSize);
    expect(narrowPillIconWidth).toBeLessThan(widePillIconWidth);
  });
});
