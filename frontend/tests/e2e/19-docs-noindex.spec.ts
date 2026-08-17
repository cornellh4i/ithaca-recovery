import { test, expect } from "./support/fixtures";

// Handoff and development docs are publicly reachable but noindexed (they name real
// people/emails and the infra layout); the user guide stays indexable. Asserted via the
// X-Robots-Tag response header -- unlike the meta tag, it can't be deferred by Next's
// streaming metadata, so it holds regardless of hydration timing.

test.describe("docs robots headers", () => {
  test("a handoff doc responds with a noindex X-Robots-Tag header", async ({ page }) => {
    const response = await page.goto("/docs/02-handoff/support-process");
    expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/);
  });

  test("a development doc responds with a noindex X-Robots-Tag header", async ({ page }) => {
    const response = await page.goto("/docs/03-development/docs-site");
    expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/);
  });

  test("a user-guide doc is not noindexed", async ({ page }) => {
    const response = await page.goto("/docs/01-user-guide/reference/troubleshooting");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(response?.headers()["x-robots-tag"]).toBeUndefined();
  });
});
