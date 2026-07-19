# [Template] ICR Scheduling Platform — Manual QA Test Script

**Version:** 0.2
**Prepared by:** Cornell Hack4Impact

> **How to use this document:** Work through each test case in order. Mark each step as ✅ Pass, ❌ Fail, or ⚠️ Partial. If a step fails, note the actual behavior in the "Notes" column. Screenshots are encouraged for any failures.

> **Run tests here:** [Google Sheet](link) <!-- [TODO: Attach link when make one] --> — duplicate a tab for each test run.

> This markdown file is the source of truth. Update it when features change, then sync the Sheet.
---

## Test Environment Setup

- **URL:** [https://ithaca-recovery.vercel.app/](https://ithaca-recovery.vercel.app/)
- **Browser:** Chrome (latest), also verify in Firefox and Safari
- **Test Accounts:** at least one Google account added as `ADMIN`, and one added as `SUPER_ADMIN` (see [user-guide.md, Section 12](../handoff/user-guide.md#12-admin-user-management)) — several tests require both roles
- **Tester Name:** _______________
- **Date Tested:** _______________

---

## 1. Authentication — Google SSO Login

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1.1 | Navigate to the platform URL without signing in | Dashboard loads with calendar view visible and "Sign In" button in the top nav | | |
| 1.2 | View meetings in daily/weekly view and apply filters without signing in | Meetings are visible and filters work normally | | |
| 1.3 | Without signing in, attempt to create/edit/delete a meeting | Create/edit/delete controls are hidden or disabled; no way to modify data | | |
| 1.4 | Click "Sign In" | Redirected to Google's login page | | |
| 1.5 | Sign in with a Google account that's already been added as an Admin | Successfully authenticated, redirected to dashboard with admin controls visible | | |
| 1.6 | Refresh the page after login | Session persists, still logged in | | |
| 1.7 | Click "Sign Out" | Session cleared, reverts to public/signed-out view | | |
| 1.8 | Sign in with a Google account that has **not** been added as an Admin | Sign-in is rejected — lands on a generic NextAuth error page (not a friendly in-app message; this is expected current behavior, not a bug) | | |
| 1.9 | Sign in as an `ADMIN` (not `SUPER_ADMIN`) and open the "Admin" nav link | Diagnostics tab is accessible; Users, Import, and Export tabs are visible but locked with a "Requires super admin" tooltip | | |

---

## 2. Meeting Creation

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 2.1 | From the dashboard sidebar, click "+ New Meeting" | Meeting creation form opens in the sidebar | | |
| 2.2 | Fill in all fields: title, mode (In Person/Hybrid/Remote), date, time, room, Meeting Type (check one or more of AA/Al-Anon/Other), Zoom Room (Hybrid/Remote only), email, description | All fields accept input, no errors | | |
| 2.3 | Click "Create Meeting" | A confirmation alert appears (currently reads "…Please check the Meeting collection on MongoDB" — known stale wording, not a failure) and the sidebar closes | | |
| 2.4 | Verify the new meeting appears on the calendar view | Meeting block shows on the correct date/time within 30 seconds (auto-refresh) or after a manual reload | | |
| 2.5 | Try submitting the form with a missing required field (e.g., no title) | Validation error shown, form does not submit | | |
| 2.6 | Check multiple Meeting Type boxes (e.g., AA and Other) on one meeting | Meeting saves with both categories; it's published to both categories' Google Calendars | | |
| 2.7 | Create a meeting with mode Hybrid or Remote and select a Zoom Room | A real Zoom meeting is created and its join link is shown on the meeting — see Section 6 for detailed Zoom checks | | |
| 2.8 | Create a meeting in a room/time slot that's already booked by another meeting | No warning or block — double-booking detection is not yet implemented (Ticket B.5) | | |

---

## 3. Meeting Editing

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 3.1 | Click on an existing meeting to view its details | Meeting details panel opens with correct info | | |
| 3.2 | Click **⋮** → "Edit Meeting" | Edit form opens, pre-populated with current values | | |
| 3.3 | Change the meeting title | Field updates, no errors | | |
| 3.4 | Change the meeting date and time | Field updates, no errors | | |
| 3.5 | Change the mode from In Person to Hybrid and pick a Zoom Room | A Zoom meeting is created and its join link appears on the meeting (see Section 6) | | |
| 3.6 | Change the mode from Hybrid back to In Person | Zoom Room field/value is cleared, and the underlying Zoom meeting + its room-calendar event are deleted | | |
| 3.7 | Click "Update Meeting" | Success confirmation, changes persist | | |
| 3.8 | Verify changes appear on the calendar view | Calendar block reflects new date/time | | |
| 3.9 | Refresh the page and recheck | Edits persist after page reload | | |
| 3.10 | Edit a recurring meeting and save | The entire series updates — there's no way to edit only a single occurrence (see Section 10) | | |

---

## 4. Meeting Deletion

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 4.1 | Select a **non-recurring** meeting, click **⋮** → "Delete Meeting" | Meeting is deleted **immediately, with no confirmation prompt** — verify this is in fact what happens, since it's an easy-to-miss risk for admins | | |
| 4.2 | Select a **recurring** meeting, click **⋮** → "Delete Meeting" | A "Delete recurring event" dialog appears with three options: "This event," "This and following events," "All events" | | |
| 4.3 | Choose "This event" | Only that single occurrence is removed; earlier and later occurrences are unaffected | | |
| 4.4 | Choose "This and following events" (on a different meeting) | That occurrence and everything after it is removed; earlier occurrences remain | | |
| 4.5 | Choose "All events" (on a different meeting) | The entire series is removed | | |
| 4.6 | Verify deleted meetings no longer appear on the calendar | Calendar block(s) removed | | |
| 4.7 | Refresh the page | Deletion(s) persist | | |

---

## 5. Calendar Display

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 5.1 | Navigate to the calendar view | Calendar loads without errors | | |
| 5.2 | Switch to Day view | Shows only the selected day's meetings, correctly placed by time | | |
| 5.3 | Switch to Week view | Shows the full week (Sunday–Saturday) with meetings on correct days, once room filters are checked (see Section 8) | | |
| 5.4 | Navigate to the next week/day | Calendar updates to show future dates | | |
| 5.5 | Navigate to the previous week/day | Calendar updates to show past dates | | |
| 5.6 | Click on a meeting block in the calendar | Meeting details open | | |
| 5.7 | Verify a day with no meetings | Displays as empty (no ghost data or errors) | | |
| 5.8 | Verify a day/room with multiple meetings, none overlapping | All meetings visible, no cut-off blocks | | |
| 5.9 | Verify a day/room with 2+ overlapping meetings | Overlapping meetings share space side-by-side (up to 2 cards), with a "+N more" indicator if there are more | | |

---

## 6. Zoom Room Integration

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 6.1 | Create a Hybrid meeting and pick a physical room | The matching Zoom Room (e.g. "Serenity Room - Zoom") is auto-selected | | |
| 6.2 | Change the auto-selected Zoom Room to a different one | The meeting card/detail view shows a Zoom-mismatch indicator, since it no longer matches the physical room's default pairing | | |
| 6.3 | Create a meeting with a Zoom Room set, then open its detail panel | A real Zoom join link is shown, and the panel shows "Synced to Zoom ✓" | | |
| 6.4 | Open the join link | Zoom launches/joins the meeting | | |
| 6.5 | Check that room's own Google Calendar (not the AA/Al-Anon/Other calendars) | A matching event exists, with the join link in its `location` field | | |
| 6.6 | Edit a meeting's Zoom Room to a different room | The old room's Zoom meeting and calendar event are removed; the new room gets a fresh Zoom meeting and calendar event | | |
| 6.7 | Delete a non-recurring meeting that has a Zoom Room set | The Zoom meeting and its room-calendar event are both removed | | |
| 6.8 | Delete a single occurrence ("This event") from a recurring meeting with a Zoom Room set | The Zoom meeting is untouched — it's one stable meeting shared by the whole series; only "All events" removes it | | |
| 6.9 | On `/admin` → Diagnostics, check the Zoom status row | Shows account reachability plus a per-room breakdown of which Zoom Room calendars are reachable | | |
| 6.10 | Force a Zoom sync failure (e.g. temporarily use an invalid `ZOOM_CLIENT_SECRET`) | Meeting shows a Zoom-specific ⚠ status separate from the Google Calendar one; Diagnostics' Meeting Counts card shows a nonzero Zoom sync-error count; **Retry sync** clears both once credentials are fixed | | |

---

## 7. Google Calendar Sync (One-Way, per category)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 7.1 | Create a meeting with Meeting Type "AA" | Meeting appears on ICR's AA Google Calendar | | |
| 7.2 | Create a meeting with two Meeting Types checked (e.g. AA and Other) | An event appears on **both** calendars | | |
| 7.3 | Edit a meeting on the platform | Changes reflect on the corresponding Google Calendar(s) | | |
| 7.4 | Delete a meeting on the platform | Event is removed from the Google Calendar(s) it was published to | | |
| 7.5 | Check sync timing | Note how long it takes for changes to appear in Google Calendar (immediate? minutes?) | | |
| 7.6 | Force a sync failure (e.g. revoke calendar access, or check a meeting created while the signed-in admin's token was stale) | Meeting shows a ⚠ badge; clicking **Retry sync** in the meeting detail panel re-attempts and clears the badge on success | | |

---

## 8. Room and Meeting Filters

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 8.1 | Open Day view | All room, Zoom Room, Calendar, and Mode filters start checked | | |
| 8.2 | Open Week view | All **room** filters start unchecked (intentional, opt-in) — no meetings shown until you check at least one | | |
| 8.3 | Apply a room filter | Only meetings in the selected room are shown | | |
| 8.4 | Apply a Calendar filter (e.g., "AA" only) | Only AA meetings are shown | | |
| 8.5 | Apply multiple filters at once | Results reflect the combined filter criteria | | |

---

## 9. Edge Cases and Error Handling

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 9.1 | Submit a meeting with a past date/time | Note whether the system warns the user or silently allows it | | |
| 9.2 | Enter extremely long text in the title field | Note whether there's a character limit or warning | | |
| 9.3 | Open the platform in two tabs, edit the same meeting in both | Note whether the last save wins silently or a conflict is flagged | | |
| 9.4 | Lose internet connection while creating a meeting | Error message shown, data is not silently lost | | |
| 9.5 | Rapidly click "Create Meeting" multiple times | Only one meeting is created (no duplicates) | | |
| 9.6 | Access the platform on a tablet-sized screen | Layout is usable (note any issues for a mobile-responsiveness backlog) | | |

---

## 10. Recurring Meetings

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 10.1 | Create a weekly recurring meeting (e.g., every Tuesday) | Recurrence options appear in the form; series is created | | |
| 10.2 | Create a monthly recurring meeting (e.g., "2nd Tuesday of every month") | Series is created on the correct monthly cadence | | |
| 10.3 | Verify future instances appear on the calendar | Future occurrences show correctly, matching the recurrence pattern | | |
| 10.4 | Edit any field on a recurring meeting | The **entire series** updates — editing a single occurrence is not supported | | |
| 10.5 | Delete a single instance ("This event") | Only that instance is removed; the rest of the series is unaffected (see Section 4) | | |
| 10.6 | Delete the entire recurring series ("All events") | All instances are removed | | |

---

## 11. Admin Panel — Roles & Tabs

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 11.1 | Sign in as `SUPER_ADMIN`, open `/admin` | All four tabs (Diagnostics, Users, Import, Export) are accessible | | |
| 11.2 | Diagnostics tab | System Status card shows DB latency, Google Calendar reachability per category (AA/Al-Anon/Other), and Zoom account + per-room calendar reachability; Meeting Counts card shows totals matching the actual data (active/suspended, by category, recurring vs. one-time, sync-error counts) | | |
| 11.3 | Diagnostics tab, with two meetings intentionally double-booked in the same room | The Conflicts panel does **not** flag them — conflict detection isn't implemented yet (Ticket B.5); this is a known gap, not a bug | | |
| 11.4 | Diagnostics tab, with a `Suspended` meeting present | It appears in the Suspended panel | | |
| 11.5 | Users tab → "Invite User" → enter an email and role → "Send Invite" | The person is added to the table immediately; confirm **no email is actually sent** — you must tell them separately | | |
| 11.6 | Users tab, with only one `SUPER_ADMIN` on the platform | That row's role dropdown and "Remove" button are both disabled, with an explanatory caption | | |
| 11.7 | Import tab → upload any file → "Upload & Import" | Results shown are currently hardcoded mock data, not a real parse — there is no backing import route yet (Ticket B); this is a known gap, not a bug | | |
| 11.8 | Export tab → "Export Meetings" and "Export Lease CSV" | Both downloads succeed and contain real data | | |
| 11.9 | Export tab → **⋮** → "Configure export…" → change a room rate → save → re-run "Export Lease CSV" | The new rate appears in the exported CSV | | |

---

## 12. Weekly View

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 12.1 | Switch to Week view | 7-day grid (Sunday–Saturday); no meetings shown until a room filter is checked (see 8.2) | | |
| 12.2 | Check a room filter | Meetings in that room appear, correctly positioned and color-coded | | |
| 12.3 | Verify a recurring meeting spanning multiple weekdays | It appears on every matching day across the week | | |
| 12.4 | View a room/time with 2+ overlapping meetings | They share space side-by-side, with a "+N more" indicator beyond 2 (see 5.9) | | |
| 12.5 | View a meeting whose Zoom Room doesn't match its physical room's default pairing | Card shows a mismatch indicator | | |

---

## 13. Digital Signage

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 13.1 | Navigate to `/signage` while signed out | Calendar renders fully with no sign-in prompt required | | |
| 13.2 | Click a meeting block on the signage page | Nothing happens — the view is read-only | | |
| 13.3 | In Admin → Export → "Generate Signage URL," pick specific rooms/types/modes/view, open the generated URL | Only the selected filters are shown on the signage page | | |
| 13.4 | Leave the signage page open across midnight (Eastern Time) | The displayed date rolls over automatically, with no manual refresh | | |
| 13.5 | Create or edit a meeting elsewhere while the signage page is open | The signage page picks up the change automatically within ~2 minutes | | |

---

## Test Summary

| Section | Total Tests | Passed | Failed | Partial | Notes |
|---------|-------------|--------|--------|---------|-------|
| 1. Authentication | 9 | | | | |
| 2. Meeting Creation | 8 | | | | |
| 3. Meeting Editing | 10 | | | | |
| 4. Meeting Deletion | 7 | | | | |
| 5. Calendar Display | 9 | | | | |
| 6. Zoom Room Integration | 10 | | | | |
| 7. Google Calendar Sync | 6 | | | | |
| 8. Filters | 5 | | | | |
| 9. Edge Cases | 6 | | | | |
| 10. Recurring Meetings | 6 | | | | |
| 11. Admin Panel | 9 | | | | |
| 12. Weekly View | 5 | | | | |
| 13. Digital Signage | 5 | | | | |
| **Total** | **95** | | | | |

**Overall Assessment:** ☐ Ready for launch &nbsp; ☐ Needs fixes before launch &nbsp; ☐ Major issues found

**Tested by:** _______________ **Date:** _______________

**Key Issues Found:**

1. _______________
2. _______________
3. _______________
