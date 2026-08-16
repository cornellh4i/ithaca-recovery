import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/auth";

// Backups admin tab (see ithaca-recovery-backups-admin-tab-plan.md). UI-only in this PR --
// mock-data-driven, gated to non-production builds via AdminShell's NODE_ENV guard (`yarn dev`
// runs with NODE_ENV=development, which is what CI's e2e pass exercises). The component test
// carries case-by-case detail (freshness thresholds, verified/replica edge cases, runbook
// command); this spec only covers visibility and the one write action.

test.describe("backups tab", () => {
  test("Super Admin sees the Backups tab in dev, with all four cards", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    await expect(page.getByTestId("admin-tab-backups")).toBeEnabled();
    await page.getByTestId("admin-tab-backups").click();

    await expect(page.getByText("Backup Health")).toBeVisible();
    await expect(page.getByText(/^Snapshots \(\d+\)$/)).toBeVisible();
    await expect(page.getByText("Restore Runbook")).toBeVisible();
    await expect(page.getByTestId("backups-recent-activity-panel").getByText("Recent Activity")).toBeVisible();
  });

  // Matches the shell's established superAdminOnly treatment (see 1.8: Users/Export):
  // the tab renders visible-but-locked for a plain Admin, not absent.
  test("a plain Admin sees the Backups tab locked", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/admin");
    await expect(page.getByTestId("admin-tab-backups")).toBeDisabled();
  });

  test("an unauthenticated visitor does not see the Backups tab (redirected off /admin entirely)", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("admin-tab-backups")).toHaveCount(0);
  });

  test("a signed-in non-admin does not see the Backups tab", async ({ page, context }) => {
    await loginAs(context, "not-an-admin@test.icr");
    await page.goto("/admin");
    await expect(page.getByTestId("admin-tab-backups")).toHaveCount(0);
  });

  test("Back Up Now dispatches and shows its toast", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    await page.getByTestId("admin-tab-backups").click();

    const backUpButton = page.getByRole("button", { name: "Back Up Now" });
    await backUpButton.click();

    await expect(backUpButton).toBeDisabled();
    await expect(page.getByText("Backup dispatched — runs appear in Recent Activity")).toBeVisible();
  });
});
