# Manual Release Checklist

> [!NOTE]
> **What this is:** `frontend/tests/e2e/`, `frontend/tests/integration/`, `frontend/tests/unit/`,
> and `frontend/tests/component/` cover application logic on every push (see
> [Testing](README.md) for how). This checklist keeps only what that suite structurally
> cannot verify: **live** Zoom/Google Calendar behavior, a **real** Google OAuth login,
> **cross-browser** rendering, and **real-time** behavior playing out over actual minutes/hours.
> Everything else already has an automated test — don't duplicate that here.
>
> **When to run this:** before a major release, or every few months as a sanity check — not a
> per-PR ritual. A checklist nobody runs is worse than no checklist; keep this short enough that
> it actually gets run. If a case here starts failing routinely, that's a sign it should become an
> automated test instead (with live credentials in a controlled test environment), not a sign to
> add more manual cases.
>
> **How to use it:** work through each case. If something fails, note it in the Notes column and
> file it as an issue — don't just leave it unaddressed here.

> [!IMPORTANT]
> This page renders as read-only markdown on `/docs` — there's nowhere here to actually check a
> box or type a result. Before a real run, copy this checklist into a new GitHub issue (or
> duplicate this file locally) and fill in your copy there, not this page, since that also leaves a
> permanent per-release record instead of a blank template nobody could save state into.

---

## Test Environment

- **URL:** [https://ithaca-recovery.vercel.app/](https://ithaca-recovery.vercel.app/) (or a preview deployment for pre-merge verification)
- **Browsers:** Chrome (primary), spot-check Firefox and Safari — CI's Playwright suite only runs Chromium
- **Test accounts:** at least one Google account added as `ADMIN`
- **Date tested:** `[TODO]`

---

## Checklist

| # | Case | Expected Result | Result | Notes |
|---|------|-----------------|--------|-------|
| 1 | Sign in with a real Google account already added as an Admin | Redirected through Google's real OAuth consent flow, lands on the dashboard with admin controls visible | | |
| 2 | Create a meeting with mode Hybrid or Remote and a Zoom Room selected | A real Zoom meeting is created; the join link works and opens the meeting | | |
| 3 | Check that room's own Google Calendar (not the AA/Al-Anon/Other calendars) | A matching event exists, with the join link in its `location` field — this is what the physical Zoom Room hardware reads | | |
| 4 | Create a meeting with two Meeting Types checked (e.g. AA and Other) | A real event appears on **both** category Google Calendars | | |
| 5 | Force a sync failure (e.g. temporarily use an invalid `ZOOM_CLIENT_SECRET` or revoke calendar access), then click **Retry sync** once fixed | The ⚠ badge clears; the meeting shows as synced | | |
| 6 | Suspend a meeting with a Zoom Room set, then resume it | Suspend removes the live Google Calendar event without deleting the Zoom meeting; resume republishes it correctly | | |
| 7 | Leave the signage page (`/signage`) open across midnight (Eastern Time) | The displayed date rolls over automatically, no manual refresh | | |
| 8 | Create or edit a meeting elsewhere while the signage page is open | The signage page picks up the change automatically within ~2 minutes | | |
| 9 | Load the main calendar on a tablet/phone-sized screen, and in Firefox/Safari | Layout is usable; no cross-browser rendering breakage | | |

---

**Overall:**
- [ ] Ready for release
- [ ] Needs fixes first
- [ ] Major issues found

**Tested by:** `[TODO]`

**Issues found (file as GitHub issues, link them here):**

1. `[TODO]`
2. `[TODO]`
