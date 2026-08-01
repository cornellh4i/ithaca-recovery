import { test, expect } from "./support/fixtures";

// Provisional tests: lock in the *current* stub/absent behavior of features that
// aren't fully implemented yet, so whoever ships the real feature finds these
// immediately (grep "[PROVISIONAL:") and knows exactly what to replace. Each test
// cites the exact source line backing the stub. Do not treat a failure here as a
// regression to revert — it means the real feature landed; delete/rewrite the test.

test.describe("provisional — unimplemented features", () => {
  // [PROVISIONAL:conflict-detection] was removed here — the feature landed (see
  // test/e2e/11-admin-panel.spec.ts's 11.4, which now asserts the real behavior instead of
  // the old stub).

  // [PROVISIONAL:suspend-workflow] was removed here — the feature landed (see
  // test/e2e/14-meeting-suspension.spec.ts, which asserts the real suspend/resume UI loop
  // instead of the old "only reachable via direct DB write" stub).

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
});
