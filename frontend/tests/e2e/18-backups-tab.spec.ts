import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/auth";

// Backups admin tab (see ithaca-recovery-backups-admin-tab-plan.md). The tab is a plain
// always-present superAdminOnly tab now -- the `/api/admin/backups*` routes serve deterministic
// mock fixtures (mode "mock") in CI, since no backup credentials are configured there, so the
// cards below render the same fixture shapes the component test covers in more detail. The
// component test carries case-by-case detail (freshness thresholds, verified/replica edge
// cases, runbook command, unconfigured/error states); this spec only covers visibility, routing,
// and the one write action.

test.describe("backups tab", () => {
  test("Super Admin sees the Backups tab, with all four cards", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin/backups");

    await expect(page.getByText("Backup Health")).toBeVisible();
    await expect(page.getByText("Snapshots", { exact: true })).toBeVisible();
    await expect(page.getByText("Restore Runbook")).toBeVisible();
    await expect(page.getByTestId("backups-recent-activity-panel").getByText("Notable Activity")).toBeVisible();
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

  test("shows the mock-mode badge in CI, where no backup credentials are configured", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin/backups");
    await expect(page.getByText("Sample data — backup credentials not configured")).toBeVisible();
  });

  test("Back Up Now dispatches and shows its toast", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin/backups");

    const backUpButton = page.getByRole("button", { name: "Back Up Now" });
    await backUpButton.click();

    // Toast first: it outlives the mock lock's short settle window, whereas asserting the
    // disabled state first can miss it entirely on a slow runner.
    await expect(page.getByText("Backup dispatched — runs appear in Recent Activity")).toBeVisible();

    // Mock mode's dispatch response short-circuits the lock instead of polling the full 90s
    // window -- mock activity fixtures never grow, so polling would never see a new run.
    await expect(backUpButton).toBeEnabled({ timeout: 5000 });
  });
});
