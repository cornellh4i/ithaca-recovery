import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";

// Manual script §13 (Digital Signage). §13.4 (midnight ET rollover) and §13.5
// (picking up changes within ~2 minutes) depend on real elapsed time or clock
// mocking that isn't worth the complexity/runtime cost here — both are simple
// `setInterval` polls in signage/page.tsx, readable directly from the source, and
// stay manual-only per the plan.

test.describe("digital signage", () => {
  test("13.1 /signage renders fully while signed out, with no sign-in prompt", async ({ page }) => {
    await seedMeeting({ title: "Signage Meeting" });
    await page.goto("/signage");
    await expect(page.getByText("Signage Meeting")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toHaveCount(0);
  });

  test("13.2 clicking a meeting block on signage does nothing — it's read-only", async ({ page }) => {
    await seedMeeting({ title: "Read Only Meeting" });
    await page.goto("/signage");
    await page.getByText("Read Only Meeting", { exact: true }).click();
    // No detail panel exists on this page at all — clicking just doesn't error out,
    // and the meeting card is still the only thing on screen.
    await expect(page.getByText("Read Only Meeting")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  });

  test("13.3 a filtered signage URL only shows the selected room", async ({ page }) => {
    await seedMeeting({ title: "Serenity Signage Meeting", room: "Serenity Room" });
    await seedMeeting({ title: "Unity Signage Meeting", room: "Unity Room" });
    await page.goto("/signage?rooms=Serenity&view=day");
    await expect(page.getByText("Serenity Signage Meeting")).toBeVisible();
    await expect(page.getByText("Unity Signage Meeting")).toHaveCount(0);
  });
});
