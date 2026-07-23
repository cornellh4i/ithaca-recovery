import { test, expect } from "./support/fixtures";
import { seedMeeting } from "../factories/meeting";

// Provisional tests: lock in the *current* stub/absent behavior of features that
// aren't fully implemented yet, so whoever ships the real feature finds these
// immediately (grep "[PROVISIONAL:") and knows exactly what to replace. Each test
// cites the exact source line backing the stub. Do not treat a failure here as a
// regression to revert — it means the real feature landed; delete/rewrite the test.

test.describe("provisional — unimplemented features", () => {
  // [PROVISIONAL:conflict-detection] and [PROVISIONAL:xlsx-import] were removed here —
  // both features landed (see test/e2e/11-admin-panel.spec.ts's 11.4 and 11.8, which now
  // assert the real behavior instead of the old stubs).

  test("[PROVISIONAL:suspend-workflow] a Suspended meeting is only reachable via direct DB write, never through the UI", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    // No component anywhere calls PUT /api/update/meeting with status: 'Suspended'
    // — seedMeeting({ status: 'Suspended' }) (test/factories/meeting.ts) is a
    // direct Prisma write standing in for a UI action that doesn't exist. This
    // test both documents the gap and confirms Diagnostics' read side (which does
    // exist) still surfaces a meeting suspended that way.
    await seedMeeting({ title: "Suspended Stub Meeting", status: "Suspended" });
    await page.goto("/admin");

    await expect(
      page.getByTestId("diagnostics-suspended-panel").getByText("Suspended Stub Meeting"),
    ).toBeVisible();

    // No suspend/unsuspend control exists on the meeting detail panel. And
    // suspension isn't a visibility toggle within the app itself — status is never
    // filtered on in util/meetingOccurrences.ts's getMeetingsForDate(), so the
    // meeting still renders on the live calendar identically to an Active one; the
    // Diagnostics subhead's "hidden from Google Calendar" is specifically about the
    // one-way external sync (write/meeting/route.ts skips both GCal/Zoom sync when
    // status === 'Suspended'), not about the calendar view.
    const dayResponse = page.waitForResponse((r) => r.url().includes("/api/retrieve/meeting/day"));
    await page.goto("/");
    await dayResponse;
    await expect(page.getByText("Suspended Stub Meeting")).toBeVisible();
  });
});
