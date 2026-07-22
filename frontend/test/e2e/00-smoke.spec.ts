import { test, expect } from "./support/fixtures";

// Validates the whole infra chain end-to-end before relying on it in the real
// suite: in-memory Mongo replica set, prisma db push, seeded Admin row, minted
// session cookie, and the real Next.js server all working together.
test("unauthenticated visitor sees the public calendar with no admin nav", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByRole("link", { name: /admin/i })).toHaveCount(0);
});

test("signed-in admin sees an authenticated session", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/");
  const status = await page.evaluate(() => fetch("/api/auth/status").then((r) => r.json()));
  expect(status.isAuthenticated).toBe(true);
});

test("signed-in admin can load /admin", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByTestId("admin-tab-diagnostics")).toBeVisible();
});

test("non-admin (no session) is redirected away from /admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
});
