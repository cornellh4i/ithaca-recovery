# ICR Scheduling Platform — Manual Release Checklist

**Version:** 0.3
**Last Update**: July 20, 2026
**Prepared by:** Cornell Hack4Impact

> **What this is now:** Originally a full 96-case manual QA script for every feature. Now that
> `frontend/tests/e2e/`, `frontend/tests/integration/`, and `frontend/tests/unit/` cover the
> application logic in CI on every push (see [`docs/03-development/testing/README.md`](README.md) for how that
> suite works), this doc only keeps what CI structurally can't check: cases that need **live**
> Zoom/Google Calendar credentials, a **real** Google OAuth login, **cross-browser/responsive**
> rendering, or **real-time** behavior across minutes. Manual cases are numbered X.1, X.2... per
> section; automated cases (tracked in the combined test sheet, not here) continue the numbering
> from there. Treat this as the pre-release sign-off checklist, not the primary QA process.

> **How to use this document:** Work through each case in order. Mark each step as ✅ Pass,
> ❌ Fail, or ⚠️ Partial. If a step fails, note the actual behavior in the "Notes" column.
> Screenshots are encouraged for any failures.

> **Run tests here:** [Google Sheet](https://docs.google.com/spreadsheets/d/1VadUnV-l7nPgKRCIYrZr_NUcC7w41Qd6lDWg7-zMR50/edit?gid=1420783858#gid=1420783858) — duplicate a tab for each test run.

> This markdown file is the source of truth. Update it when features change, then sync the Sheet.
---

## Test Environment Setup

- **URL:** [https://ithaca-recovery.vercel.app/](https://ithaca-recovery.vercel.app/)
- **Browser:** Chrome (latest), also verify in Firefox and Safari — CI's Playwright suite only runs Chromium
- **Test Accounts:** at least one Google account added as `ADMIN`, and one added as `SUPER_ADMIN` (see [user-guide.md, Section 12](../../01-user-guide/user-guide.md#12-admin-user-management)) — several tests require both roles
- **Tester Name:** _______________
- **Date Tested:** _______________

---

## 1. Authentication — Google SSO Login

> **Automated (minted-session cases):** `frontend/tests/e2e/01-authentication.spec.ts` — the cases
> below need a *real* Google OAuth round-trip, which the automated suite deliberately doesn't do.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1.1 | Click "Sign In" | Redirected to Google's login page | | |
| 1.2 | Sign in with a Google account that's already been added as an Admin | Successfully authenticated, redirected to dashboard with admin controls visible | | |
| 1.3 | Sign in with a Google account that has **not** been added as an Admin | Sign-in is rejected — lands on a generic NextAuth error page (not a friendly in-app message; this is expected current behavior, not a bug) | | |

---

## 2. Meeting Creation

> **Automated (fail-soft path):** `frontend/tests/e2e/02-meeting-creation.spec.ts` — the case below
> needs live Zoom credentials to verify the real success path.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 2.1 | Create a meeting with mode Hybrid or Remote and select a Zoom Room | A real Zoom meeting is created and its join link is shown on the meeting — see Section 6 for detailed Zoom checks | | |

---

## 3. Meeting Editing

> **Automated (fail-soft path):** `frontend/tests/e2e/03-meeting-editing.spec.ts` — the cases below
> need live Zoom credentials to verify the real success/teardown path.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 3.1 | Change the mode from In Person to Hybrid and pick a Zoom Room | A Zoom meeting is created and its join link appears on the meeting (see Section 6) | | |
| 3.2 | Change the mode from Hybrid back to In Person | Zoom Room field/value is cleared, and the underlying Zoom meeting + its room-calendar event are deleted | | |

---

## 6. Zoom Room Integration

> **Automated (fail-soft path + auto-pairing logic):** `frontend/tests/e2e/06-zoom-integration.spec.ts`
> — most cases below require live Zoom/Google credentials to verify against the real services.
> 6.10 (conflicts) doesn't — it's covered by
> `frontend/tests/e2e/11-admin-panel.spec.ts`'s conflict-detection cases with zero real network calls.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 6.1 | Create a meeting with a Zoom Room set, then open its detail panel | A real Zoom join link is shown, and the panel shows "Synced to Zoom ✓" | | |
| 6.2 | Open the join link | Zoom launches/joins the meeting | | |
| 6.3 | Check that room's own Google Calendar (not the AA/Al-Anon/Other calendars) | A matching event exists, with the join link in its `location` field | | |
| 6.4 | Edit a meeting's Zoom Room to a different room | The old room's Zoom meeting and calendar event are removed; the new room gets a fresh Zoom meeting and calendar event | | |
| 6.5 | Delete a non-recurring meeting that has a Zoom Room set | The Zoom meeting and its room-calendar event are both removed | | |
| 6.6 | Delete a single occurrence ("This event") from a recurring meeting with a Zoom Room set | The Zoom meeting is untouched — it's one stable meeting shared by the whole series; only "All events" removes it | | |
| 6.7 | On `/admin` → Diagnostics, check the Zoom status row | Shows account reachability, a per-room Zoom Calendar breakdown, and a separate per-host breakdown of the shared host pool (resolves + whether Licensed) | | |
| 6.8 | Temporarily remove one email from `ZOOM_HOSTS`, reload Diagnostics | That host no longer appears in the pool breakdown and the "N/M pooled hosts OK" count drops by one; other hosts/rooms are unaffected | | |
| 6.9 | Force a Zoom sync failure (e.g. temporarily use an invalid `ZOOM_CLIENT_SECRET`) | Meeting shows a Zoom-specific ⚠ status separate from the Google Calendar one; Diagnostics' Meeting Counts card shows a nonzero Zoom sync-error count; **Retry sync** clears both once credentials are fixed | | |
| 6.10 | Create two meetings in the same room (or same Zoom Room) at overlapping times, then check Diagnostics' Conflicts panel | Both meetings appear together in a conflict row, grouped by the shared room/Zoom Room; meetings in different rooms or non-overlapping times are not flagged | | |
| 6.11 | Set `ZOOM_HOSTS` to a single email, then create two Zoom-enabled meetings at overlapping times (different rooms) | The first gets a real Zoom meeting; the second is still created but shows "Zoom sync failed ⚠: No Zoom host available…" with a working **Retry sync** button | | |

---

## 7. Google Calendar Sync (One-Way, per category)

> **Not automated** — every case here needs live Google Calendar access to verify against the real
> calendars. The automated suite (`07-google-calendar-sync.spec.ts`) only covers the fail-soft
> "sync attempted but no credentials configured" path.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 7.1 | Create a meeting with Meeting Type "AA" | Meeting appears on ICR's AA Google Calendar | | |
| 7.2 | Create a meeting with two Meeting Types checked (e.g. AA and Other) | An event appears on **both** calendars | | |
| 7.3 | Edit a meeting on the platform | Changes reflect on the corresponding Google Calendar(s) | | |
| 7.4 | Delete a meeting on the platform | Event is removed from the Google Calendar(s) it was published to | | |
| 7.5 | Check sync timing | Note how long it takes for changes to appear in Google Calendar (immediate? minutes?) | | |
| 7.6 | Force a sync failure (e.g. revoke calendar access, or check a meeting created while the signed-in admin's token was stale) | Meeting shows a ⚠ badge; clicking **Retry sync** in the meeting detail panel re-attempts and clears the badge on success | | |

---

## 9. Edge Cases and Error Handling

> **Automated:** `frontend/tests/e2e/09-edge-cases.spec.ts` — the cases below are either exploratory
> (no fixed pass/fail expectation) or environmental/visual, which don't fit a deterministic
> automated assertion.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 9.1 | Open the platform in two tabs, edit the same meeting in both | Note whether the last save wins silently or a conflict is flagged | | |
| 9.2 | Lose internet connection while creating a meeting | Error message shown, data is not silently lost | | |
| 9.3 | Access the platform on a tablet-sized screen | Layout is usable (note any issues for a mobile-responsiveness backlog) | | |

---

## 11. Admin Panel — Roles & Tabs

> **Automated:** `frontend/tests/e2e/11-admin-panel.spec.ts` — the case below needs live Zoom/Google
> reachability checks against the real services.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 11.1 | Diagnostics tab | System Status card shows DB latency, Google Calendar reachability per category (AA/Al-Anon/Other), and Zoom account reachability + per-room calendar status + per-host pool status | | |

---

## 13. Digital Signage

> **Automated:** `frontend/tests/e2e/13-digital-signage.spec.ts` — the cases below play out over
> real minutes/hours, which isn't practical to assert deterministically in CI.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 13.1 | Leave the signage page open across midnight (Eastern Time) | The displayed date rolls over automatically, with no manual refresh | | |
| 13.2 | Create or edit a meeting elsewhere while the signage page is open | The signage page picks up the change automatically within ~2 minutes | | |

---

## Test Summary

| Section | Total Tests | Passed | Failed | Partial | Notes |
|---------|-------------|--------|--------|---------|-------|
| 1. Authentication | 3 | | | | |
| 2. Meeting Creation | 1 | | | | |
| 3. Meeting Editing | 2 | | | | |
| 6. Zoom Room Integration | 11 | | | | |
| 7. Google Calendar Sync | 6 | | | | |
| 9. Edge Cases | 3 | | | | |
| 11. Admin Panel | 1 | | | | |
| 13. Digital Signage | 2 | | | | |
| **Total** | **29** | | | | |

**Overall Assessment:** ☐ Ready for launch &nbsp; ☐ Needs fixes before launch &nbsp; ☐ Major issues found

**Tested by:** _______________ **Date:** _______________

**Key Issues Found:**

1. _______________
2. _______________
3. _______________
