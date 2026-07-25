import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { toggleFilter, selectView } from "./support/formHelpers";

// Manual script §8 (Room and Meeting Filters).

test.describe("filters", () => {
  test("8.1 Day view starts with every filter checked", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    // .first() — "Serenity Room" is also a substring of "Serenity Room - Zoom"'s label.
    const serenityCheckbox = page.locator('label:has-text("Serenity Room")').first().locator('input[type="checkbox"]');
    await expect(serenityCheckbox).toBeChecked();
    const aaCheckbox = page.locator('label:has-text("AA")').locator('input[type="checkbox"]');
    await expect(aaCheckbox).toBeChecked();
  });

  test("8.2 Week view starts with room filters unchecked", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await selectView(page, "Week");
    const serenityCheckbox = page.locator('label:has-text("Serenity Room")').first().locator('input[type="checkbox"]');
    await expect(serenityCheckbox).not.toBeChecked();
  });

  test("8.3 applying a room filter shows only that room's meetings", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Serenity Meeting", room: "Serenity Room" });
    await seedMeeting({ title: "Unity Meeting", room: "Unity Room" });
    await page.goto("/");

    // Day view starts fully open — uncheck Unity to isolate Serenity.
    await toggleFilter(page, "Unity Room");
    await expect(page.getByText("Serenity Meeting")).toBeVisible();
    await expect(page.getByText("Unity Meeting")).toHaveCount(0);
  });

  test("8.4 applying a Calendar filter shows only that category", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "AA Meeting", calType: ["AA"] });
    await seedMeeting({ title: "Other Meeting", calType: ["Other"] });
    await page.goto("/");

    await toggleFilter(page, "Other");
    await expect(page.getByText("AA Meeting")).toBeVisible();
    await expect(page.getByText("Other Meeting")).toHaveCount(0);
  });

  test("8.5 multiple filters combine", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Serenity AA", room: "Serenity Room", calType: ["AA"] });
    await seedMeeting({ title: "Serenity Other", room: "Serenity Room", calType: ["Other"] });
    await seedMeeting({ title: "Unity AA", room: "Unity Room", calType: ["AA"] });
    await page.goto("/");

    await toggleFilter(page, "Unity Room"); // uncheck Unity
    await toggleFilter(page, "Other"); // uncheck Other
    await expect(page.getByText("Serenity AA")).toBeVisible();
    await expect(page.getByText("Serenity Other")).toHaveCount(0);
    await expect(page.getByText("Unity AA")).toHaveCount(0);
  });
});
