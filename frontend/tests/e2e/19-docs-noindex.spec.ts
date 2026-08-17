import { test, expect } from "./support/fixtures";

// Handoff and development docs are publicly reachable but noindexed (they name real
// people/emails and the infra layout); the user guide stays indexable.

test.describe("docs robots metadata", () => {
  test("a handoff doc carries a noindex robots meta tag", async ({ page }) => {
    await page.goto("/docs/02-handoff/support-process");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("a development doc carries a noindex robots meta tag", async ({ page }) => {
    await page.goto("/docs/03-development/docs-site");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("a user-guide doc is not noindexed", async ({ page }) => {
    await page.goto("/docs/01-user-guide/reference/troubleshooting");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });
});
