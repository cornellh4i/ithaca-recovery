import { test, expect } from "./support/fixtures";

// Handoff and development docs are publicly reachable but noindexed (they name real
// people/emails and the infra layout); the user guide stays indexable. Asserted via the
// X-Robots-Tag response header -- unlike the meta tag, it can't be deferred by Next's
// streaming metadata, so it holds regardless of hydration timing.

test.describe("docs robots headers", () => {
  test("a handoff doc responds with a noindex X-Robots-Tag header", async ({ page }) => {
    const response = await page.goto("/docs/02-handoff/support-process");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("a development doc responds with a noindex X-Robots-Tag header", async ({ page }) => {
    const response = await page.goto("/docs/03-development/docs-site");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  // Also the only e2e proving /docs renders at all -- the generated docs-content module is
  // gitignored, and CI's fresh checkout serves 500s if the e2e server boots without generating
  // it (the gap that hid exactly that bug).
  test("a user-guide doc renders and is not noindexed", async ({ page }) => {
    const response = await page.goto("/docs/01-user-guide/reference/troubleshooting");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBeUndefined();
  });

  // The negative case asserts against "/" rather than a user-guide doc page: the header rule
  // is path-scoped next.config, so any non-docs route proves it isn't applied globally -- and
  // "/" is compiled/exercised by every other spec, so this can't flake on the dev server's
  // on-demand compile of a docs route the way a docs-page assertion did on CI.
  test("routes outside the noindexed sections carry no X-Robots-Tag", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    expect(response?.headers()["x-robots-tag"]).toBeUndefined();
  });
});
