import { test } from "./support/fixtures";

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

  // [PROVISIONAL:xlsx-import] was removed here — XLSX Import was canceled (not shipped),
  // and ImportTab.tsx along with its mock-results stub were deleted entirely.
});
