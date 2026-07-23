import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";
import { seedAdmin } from "../factories/admin";
import { loginAs } from "./support/auth";
import { Role } from "@prisma/client";

// Manual script §11 (Admin Panel — Roles & Tabs). XLSX import (11.8) is still a known-gap
// stub, covered in more detail by provisional.spec.ts — this file just confirms the panel
// renders its current stub state until that lands too.

test.describe("admin panel", () => {
  test("11.2 SUPER_ADMIN sees all four tabs accessible", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    for (const key of ["diagnostics", "users", "import", "export"]) {
      await expect(page.getByTestId(`admin-tab-${key}`)).toBeEnabled();
    }
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
    await seedMeeting({ title: "Double Book A", room: "Serenity Room" });
    await seedMeeting({ title: "Double Book B", room: "Serenity Room" });
    await page.goto("/admin");

    const panel = page.getByTestId("diagnostics-conflicts-panel");
    await expect(panel.getByText("⚠ Conflicts (1)")).toBeVisible();
    await expect(panel.getByText("Double Book A", { exact: false })).toBeVisible();
    await expect(panel.getByText("Double Book B", { exact: false })).toBeVisible();
  });

  test("11.4b meetings in different rooms are not flagged as conflicts", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await seedMeeting({ title: "No Conflict A", room: "Serenity Room" });
    await seedMeeting({ title: "No Conflict B", room: "Unity Room" });
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

    await page.getByPlaceholder("Email address").fill("invitee@test.icr");
    const writeResponse = page.waitForResponse((r) => r.url().includes("/api/write/admin"));
    await page.getByRole("button", { name: "Send Invite" }).click();
    await writeResponse;

    await expect(page.getByText("invitee@test.icr")).toBeVisible();
  });

  test("11.7 the sole SUPER_ADMIN's role and Remove button are disabled", async ({ page, context }) => {
    const solo = await seedAdmin(Role.SUPER_ADMIN);
    await loginAs(context, solo.email);
    await page.goto("/admin");
    await page.getByTestId("admin-tab-users").click();

    const row = page.locator("tr", { hasText: solo.email });
    await expect(row.locator("select")).toBeDisabled();
    await expect(row.getByRole("button", { name: "Remove" })).toBeDisabled();
    await expect(page.getByText("Can't change the last Super Admin's role.")).toBeVisible();
  });

  test("11.8 Import tab shows hardcoded mock results, not a real parse", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    await page.goto("/admin");
    await page.getByTestId("admin-tab-import").click();

    await page.getByTestId("import-file-input").setInputFiles({
      name: "meetings.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("not a real spreadsheet"),
    });
    await page.getByTestId("import-upload-button").click();

    await expect(page.getByTestId("import-results-table")).toBeVisible();
    // MOCK_RESULTS in ImportTab.tsx — same regardless of the file's actual content.
    await expect(page.getByText("Serenity Fellowship")).toBeVisible();
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
