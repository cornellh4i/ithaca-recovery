import { test, expect } from "./support/fixtures";
import { seedSuspendedMeeting } from "../factories/meeting";

// Provisional tests: lock in the *current* stub/absent behavior of features that
// aren't fully implemented yet, so whoever ships the real feature finds these
// immediately (grep "[PROVISIONAL:") and knows exactly what to replace. Each test
// cites the exact source line backing the stub. Do not treat a failure here as a
// regression to revert — it means the real feature landed; delete/rewrite the test.

test.describe("provisional — unimplemented features", () => {
  // [PROVISIONAL:conflict-detection] was removed here — the feature landed (see
  // test/e2e/11-admin-panel.spec.ts's 11.4, which now asserts the real behavior instead of
  // the old stub).

  test("[PROVISIONAL:xlsx-import] Import always returns the same hardcoded mock results", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    // ImportTab.tsx's handleImport() has a `// TODO (Import XLSX): replace this
    // timeout with a real POST /api/import/meetings call` — MOCK_RESULTS is
    // returned unconditionally after an 800ms setTimeout, regardless of what (or
    // whether) a file was actually uploaded. No app/api/import/ route exists.
    await page.goto("/admin");
    await page.getByTestId("admin-tab-import").click();
    await page.getByTestId("import-file-input").setInputFiles({
      name: "anything.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("this content is never read"),
    });
    await page.getByTestId("import-upload-button").click();

    await expect(page.getByText("Results: 7 rows processed")).toBeVisible();
    await expect(page.getByText("Serenity Fellowship")).toBeVisible();
    await expect(page.getByText("⚠ Created with conflict (1)")).toBeVisible();
  });

  test("[PROVISIONAL:suspend-workflow] a Suspended meeting is only reachable via direct DB write, never through the UI", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    // The backend half of this ticket has landed: app/api/update/meeting/{suspend,resume}/
    // route.ts are real routes, Diagnostics derives its suspended panel/count from real
    // SuspensionPeriod date ranges (app/api/admin/diagnostics/route.ts), and
    // util/meetingOccurrences.ts's getMeetingsForDate now genuinely hides a currently-suspended
    // meeting from the live calendar. What's still missing, and what this test now documents,
    // is the UI half: no component anywhere calls those routes — seedSuspendedMeeting()
    // (tests/factories/meeting.ts) is a direct Prisma write standing in for a UI action
    // (ViewMeeting's kebab menu, per the ticket) that doesn't exist yet.
    await seedSuspendedMeeting({ title: "Suspended Stub Meeting" });
    await page.goto("/admin");

    await expect(
      page.getByTestId("diagnostics-suspended-panel").getByText("Suspended Stub Meeting"),
    ).toBeVisible();

    // Real behavior now, not a stub: a currently-suspended meeting is hidden from the live
    // Day view.
    const dayResponse = page.waitForResponse((r) => r.url().includes("/api/retrieve/meeting/day"));
    await page.goto("/");
    await dayResponse;
    await expect(page.getByText("Suspended Stub Meeting")).not.toBeVisible();
  });
});
