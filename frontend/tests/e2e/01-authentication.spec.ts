import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/auth";
import { seedMeeting } from "../factories/meeting";

// Manual script §1 (Authentication — Google SSO Login). Real Google OAuth
// itself (1.4 redirect to Google, 1.5/1.8 actual sign-in outcomes) can't be
// driven headlessly without real credentials — those stay manual-only. What's
// covered here is everything downstream of a session existing (or not), which
// is what the app's own logic controls.

const VIEW_ONLY_PILL_TEXT = "View only - sign in as Admin to manage meetings";

test("1.4 unauthenticated visitor sees the calendar and a Sign In link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
});

test("1.5 unauthenticated visitor has no meeting creation controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("New Meeting")).toHaveCount(0);
});

test("1.5b unauthenticated visitor still sees the mini calendar and room/zoom filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator('label:has-text("Serenity Room")').first()).toBeVisible();
});

test("1.5c unauthenticated visitor sees the 'View only' pill in the navbar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(VIEW_ONLY_PILL_TEXT)).toBeVisible();
});

test("1.5d a signed-in non-admin user has no meeting creation controls and sees the 'View only' pill", async ({
  page,
  context,
}) => {
  // No seeded Admin row for this email -- a real session, but role never resolves to
  // ADMIN/SUPER_ADMIN (same setup as 1.10's "not-an-admin" case).
  await loginAs(context, "not-an-admin@test.icr");
  await page.goto("/");
  await expect(page.getByText("New Meeting")).toHaveCount(0);
  await expect(page.getByText(VIEW_ONLY_PILL_TEXT)).toBeVisible();
});

test("1.5e an Admin sees meeting creation controls and no 'View only' pill", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/");
  await expect(page.getByText("New Meeting")).toBeVisible();
  await expect(page.getByText(VIEW_ONLY_PILL_TEXT)).toHaveCount(0);
});

test("1.5f unauthenticated visitor viewing a meeting sees no email, Zoom host, or Edit/Delete controls", async ({
  page,
}) => {
  await seedMeeting({ title: "Guest View Meeting", email: "hidden@test.icr", zoomHost: "host@test.icr" });
  await page.goto("/");
  await page.getByText("Guest View Meeting", { exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Guest View Meeting" })).toBeVisible();
  await expect(page.getByText("hidden@test.icr")).toHaveCount(0);
  await expect(page.getByText("Host:")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Meeting options" })).toHaveCount(0);
});

test("1.5g a signed-in non-admin user viewing a meeting sees no email, Zoom host, or Edit/Delete controls", async ({
  page,
  context,
}) => {
  await seedMeeting({ title: "Non-Admin View Meeting", email: "hidden2@test.icr", zoomHost: "host@test.icr" });
  await loginAs(context, "not-an-admin@test.icr");
  await page.goto("/");
  await page.getByText("Non-Admin View Meeting", { exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Non-Admin View Meeting" })).toBeVisible();
  await expect(page.getByText("hidden2@test.icr")).toHaveCount(0);
  await expect(page.getByText("Host:")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Meeting options" })).toHaveCount(0);
});

test("1.5h an Admin viewing a meeting sees the email row, Zoom host row, and Edit/Delete kebab", async ({
  adminPage,
}) => {
  const { page } = adminPage;
  await seedMeeting({ title: "Admin View Meeting", email: "visible@test.icr", zoomHost: "host@test.icr" });
  await page.goto("/");
  await page.getByText("Admin View Meeting", { exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Admin View Meeting" })).toBeVisible();
  await expect(page.getByText("visible@test.icr")).toBeVisible();
  await expect(page.getByText("Host:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Meeting options" })).toBeVisible();
});

test("1.5i a non-admin visiting an edit deep link (?mid=&edit=1) does not see the Edit Meeting form", async ({
  page,
  context,
}) => {
  // Deep link support (see page.tsx's ?mid=&edit=1 handling) is meant for the Admin
  // Diagnostics panel's "Edit" button -- a non-admin who ends up with the same URL (e.g. a
  // forwarded link) should still land on the ordinary read-only sidebar, not the edit form.
  const meeting = await seedMeeting({ title: "Deep Link Meeting" });
  await loginAs(context, "not-an-admin@test.icr");
  await page.goto(`/?mid=${meeting.mid}&edit=1`);

  await expect(page.getByRole("heading", { name: "Edit Meeting" })).toHaveCount(0);
  await expect(page.getByText("New Meeting")).toHaveCount(0);
});

test("1.5j an Admin visiting an edit deep link (?mid=&edit=1) sees the Edit Meeting form", async ({ adminPage }) => {
  const { page } = adminPage;
  const meeting = await seedMeeting({ title: "Deep Link Meeting Admin" });
  await page.goto(`/?mid=${meeting.mid}&edit=1`);

  await expect(page.getByRole("heading", { name: "Edit Meeting" })).toBeVisible();
});

test("1.5k guests and non-admins viewing a meeting with a sync error cannot see or trigger Retry sync", async ({
  page,
  context,
}) => {
  // BUG-022: the whole status band (not just the Retry button) is admin-only -- it
  // references admin-only actions/pages (Retry sync, Admin Diagnostics) a guest/non-admin
  // can't use anyway, so neither the "Failed to sync" summary nor its details should render.
  await seedMeeting({ title: "Guest Sync Error Meeting", googleSyncStatus: "error" });
  await page.goto("/");
  await page.getByText("Guest Sync Error Meeting", { exact: true }).click();
  await expect(page.getByText("Failed to sync")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry sync" })).toHaveCount(0);

  await seedMeeting({ title: "Non-Admin Sync Error Meeting", googleSyncStatus: "error" });
  await loginAs(context, "not-an-admin@test.icr");
  await page.goto("/");
  await page.getByText("Non-Admin Sync Error Meeting", { exact: true }).click();
  await expect(page.getByText("Failed to sync")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry sync" })).toHaveCount(0);
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
  
  // 1. Click the user profile avatar button to open the flyout
  await expect(page.getByRole("button", { name: "User menu" })).toBeVisible();
  await page.getByRole("button", { name: "User menu" }).click();

  // 2. Click the "Sign Out" button inside the opened flyout
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign Out" }).click();

  // 3. Verify it reverts to the signed-out view
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
});

test("1.8 ADMIN (non-super) sees Diagnostics unlocked but Users/Export locked", async ({ adminPage }) => {
  const { page } = adminPage;
  await page.goto("/admin");
  await expect(page.getByTestId("admin-tab-diagnostics")).toBeEnabled();
  await expect(page.getByTestId("admin-tab-users")).toBeDisabled();
  await expect(page.getByTestId("admin-tab-export")).toBeDisabled();
  // Tooltip text is CSS hover-only (visible on :hover/:focus-within) — assert it's
  // present in the DOM rather than requiring an actual hover interaction.
  await expect(page.getByText("Requires super admin").first()).toBeAttached();
});

test("1.9 SUPER_ADMIN sees all three admin tabs unlocked", async ({ superAdminPage }) => {
  const { page } = superAdminPage;
  await page.goto("/admin");
  for (const key of ["diagnostics", "users", "export"]) {
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
