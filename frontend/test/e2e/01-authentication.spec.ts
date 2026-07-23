import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/auth";

// Manual script §1 (Authentication — Google SSO Login). Real Google OAuth
// itself (1.4 redirect to Google, 1.5/1.8 actual sign-in outcomes) can't be
// driven headlessly without real credentials — those stay manual-only. What's
// covered here is everything downstream of a session existing (or not), which
// is what the app's own logic controls.

test("1.4 unauthenticated visitor sees the calendar and a Sign In link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
});

test("1.5 unauthenticated visitor has no meeting creation controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("New Meeting")).toHaveCount(0);
});

test("1.6 session persists across a page reload", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/");
  await page.reload();
  const status = await page.evaluate(() => fetch("/api/auth/status").then((r) => r.json()));
  expect(status.isAuthenticated).toBe(true);
});

test("1.7 Sign Out clears the session and reverts to the signed-out view", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
});

test("1.8 ADMIN (non-super) sees Diagnostics unlocked but Users/Import/Export locked", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/admin");
  await expect(page.getByTestId("admin-tab-diagnostics")).toBeEnabled();
  await expect(page.getByTestId("admin-tab-users")).toBeDisabled();
  await expect(page.getByTestId("admin-tab-import")).toBeDisabled();
  await expect(page.getByTestId("admin-tab-export")).toBeDisabled();
  // Tooltip text is CSS hover-only (visible on :hover/:focus-within) — assert it's
  // present in the DOM rather than requiring an actual hover interaction.
  await expect(page.getByText("Requires super admin").first()).toBeAttached();
});

test("1.9 SUPER_ADMIN sees all four admin tabs unlocked", async ({ superAdminPage }) => {
  const { page } = superAdminPage;
  await page.goto("/admin");
  for (const key of ["diagnostics", "users", "import", "export"]) {
    await expect(page.getByTestId(`admin-tab-${key}`)).toBeEnabled();
  }
});

test("1.10 a signed-in user who is not a seeded Admin is redirected away from /admin", async ({ page, context }) => {
  // Simulates 1.8's downstream effect: a valid session whose email never made
  // it into the Admin table (requireRole() rejects it), rather than the
  // Google-side rejection itself.
  await loginAs(context, "not-an-admin@test.icr");
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
});

test("1.11 non-admin (no session) is redirected away from /admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/login");
});
