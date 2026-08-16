import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { seedAdmin } from "../factories/admin";
import { loginAs } from "./support/auth";
import { Role } from "@prisma/client";

// Manual script §11 (Admin Panel — Roles & Tabs).

test.describe("admin panel", () => {
  test("11.2 SUPER_ADMIN sees all four tabs accessible", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    for (const key of ["diagnostics", "signage", "users", "export"]) {
      await expect(page.getByTestId(`admin-tab-${key}`)).toBeEnabled();
    }
    await expect(page.getByTestId("admin-tab-import")).toHaveCount(0);
  });

  test("11.2b /admin redirects to the default tab and tab clicks update the URL", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/diagnostics$/);

    await page.getByTestId("admin-tab-users").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  });

  test("11.2c deep-linking /admin/export opens the Export tab directly", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin/export");
    await expect(page.getByRole("button", { name: "Export Meetings" })).toBeVisible();
  });

  test("11.2d an unknown tab slug redirects to the default tab", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin/nonsense");
    await expect(page).toHaveURL(/\/admin\/diagnostics$/);
  });

  test("11.3 Diagnostics tab shows system status and meeting counts matching real data", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await seedMeeting({ title: "Diag Meeting 1", calType: ["AA"] });
    await seedMeeting({ title: "Diag Meeting 2", calType: ["AA"] });
    await page.goto("/admin");

    await expect(page.getByText("Database")).toBeVisible();
    await expect(page.getByText("Google Calendar", { exact: true })).toBeVisible();
    await expect(page.getByText("Zoom", { exact: true })).toBeVisible();
    await expect(page.getByText("AA: 2")).toBeVisible();
  });

  test("11.4 double-booked meetings in the same room are flagged as conflicts", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    // computeConflicts deliberately excludes occurrences that have already ended (nothing to
    // flag about a booking that's over) — seedMeeting's default "today, fixed ET hour" window
    // is fine most of the day but goes stale once CI runs past that hour, which reads as "no
    // conflict" instead of a failure in conflict detection itself. An hour-from-now window is
    // never in the past, regardless of what time CI happens to run.
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await seedMeeting({ title: "Double Book A", room: "Serenity Room", startDateTime: start, endDateTime: end });
    await seedMeeting({ title: "Double Book B", room: "Serenity Room", startDateTime: start, endDateTime: end });
    await page.goto("/admin");

    const panel = page.getByTestId("diagnostics-conflicts-panel");
    await expect(panel.getByText("Conflicts (1)")).toBeVisible();
    await expect(panel.getByText("Double Book A", { exact: false })).toBeVisible();
    await expect(panel.getByText("Double Book B", { exact: false })).toBeVisible();
  });

  test("11.4b meetings in different rooms are not flagged as conflicts", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await seedMeeting({ title: "No Conflict A", room: "Serenity Room", startDateTime: start, endDateTime: end });
    await seedMeeting({ title: "No Conflict B", room: "Unity Room", startDateTime: start, endDateTime: end });
    await page.goto("/admin");

    await expect(page.getByTestId("diagnostics-conflicts-panel").getByText("No conflicts detected.")).toBeVisible();
  });

  test("11.5 a Suspended meeting appears in the Suspended panel", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await seedMeeting({ title: "Suspended Meeting", status: "Suspended" });
    await page.goto("/admin");

    await expect(page.getByTestId("diagnostics-suspended-panel").getByText("Suspended Meeting")).toBeVisible();
  });

  test("11.6 inviting a user adds them to the table immediately", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    await page.getByTestId("admin-tab-users").click();

    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByPlaceholder("Email address").fill("invitee@test.icr");
    const writeResponse = page.waitForResponse((r) => r.url().includes("/api/write/admin"));
    await page.getByRole("button", { name: "Send Invite" }).click();
    await writeResponse;

    await expect(page.getByText("invitee@test.icr")).toBeVisible();
  });

  test("11.7 the sole SUPER_ADMIN's role and Remove option are disabled", async ({ page, context }) => {
    const solo = await seedAdmin(Role.SUPER_ADMIN);
    await loginAs(context, solo.email);
    await page.goto("/admin");
    await page.getByTestId("admin-tab-users").click();

    const row = page.locator("tr", { hasText: solo.email });
    await row.getByLabel("User options").click();
    // The kebab menu itself is portaled to document.body (so it isn't clipped by the table's
    // horizontal scroll at phone width) -- no longer a DOM descendant of `row`, so these query
    // from `page`, not `row`.
    await expect(page.getByRole("button", { name: "Remove User" })).toBeDisabled();

    await page.getByRole("button", { name: "Edit Role" }).click();
    await expect(page.getByText("Can't change the last Super Admin's role.")).toBeVisible();
  });

  test("11.8b the Signage tab shows the signage URL generator, unlocked for a non-super Admin", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/admin");
    await page.getByTestId("admin-tab-signage").click();
    await expect(page.getByText("Generate Signage URL")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Link" })).toBeVisible();
  });

  test("11.9 exporting meetings downloads a real file", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await seedMeeting({ title: "Export Me" });
    await page.goto("/admin");
    await page.getByTestId("admin-tab-export").click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Meetings" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/ithaca-recovery-meetings-.*\.xlsx/);
  });
});
