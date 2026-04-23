# [Template] ICR Scheduling Platform — Manual QA Test Script

**Version:** 0.1
**Date:** April 2026
**Prepared by:** Cornell Hack4Impact

> **How to use this document:** Work through each test case in order. Mark each step as ✅ Pass, ❌ Fail, or ⚠️ Partial. If a step fails, note the actual behavior in the "Notes" column. Screenshots are encouraged for any failures.

> **Run tests here:** [Google Sheet](link) <!-- [TODO: Attach link when make one]  -->— duplicate a tab for each test run.

> This markdown file is the source of truth. Update it when features change, then sync the Sheet.
---

## Test Environment Setup <!-- [TODO] -->

- **URL:** [https://ithaca-recovery-deployment.vercel.app/](https://ithaca-recovery-deployment.vercel.app/) <!-- [TODO: Replace with real URL after migration.] -->
- **Browser:** Chrome (latest), also verify in Firefox and Safari
- **Test Account:** [Google test account email] <!-- [TODO: Fill in info from Sophie] -->
- **Zoom Accounts:** See `.env` file
- **Tester Name:** _______________
- **Date Tested:** _______________

---

## 1. Authentication — Google SSO Login

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1.1 | Navigate to the platform URL without signing in | Dashboard loads with calendar view visible and "Sign In" button on top right | | |
| 1.2 | View meetings in daily/weekly view and apply filters without signing in | Meetings are visible and filters work normally | | |
| 1.3 | Without signing in, attempt to create/edit/delete a meeting | Create/edit/delete controls are hidden or disabled; no way to modify data | | |
| 1.4 | Click "Sign In" | Redirected to Google login page | | |
| 1.5 | Enter valid ICR Google credentials | Successfully authenticated, redirected to dashboard with full admin controls visible | | |
| 1.6 | Refresh the page after login | Session persists, still logged in | | |
| 1.7 | Click "Log Out" | Session cleared, reverts to public view | | <!-- [TODO: Implementing "Log Out"]  --> |
| 1.8 | Sign in with a non-ICR Google account | Access denied with clear error message | | |

---

## 2. Meeting Creation

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 2.1 | From the dashboard, click "Create Meeting" | Meeting creation panel opens | | |
| 2.2 | Fill in all required fields: title, date, time, meeting type (in-person), meeting room, contact email, Zoom account, description | All fields accept input, no errors | | |
| 2.3 | Submit the form | Success confirmation shown, modal closes | | |
| 2.4 | Verify the new meeting appears in the database | Meeting is visible with correct details | | |
| 2.5 | Verify the new meeting appears on the calendar view | Meeting block shows on the correct date/time | | <!-- [TODO: refresh?]  -->|
| 2.6 | Try submitting the form with a missing required field (e.g., no title) | Validation error shown, form does not submit | | |
| 2.7 | Create a meeting with type "hybrid" | Zoom link is automatically generated and attached | | |
| 2.8 | Create a meeting with type "virtual" | Zoom link is automatically generated and attached | | |
| 2.9 | Create a meeting at the same time as an existing meeting | System prevents it | | |

---

## 3. Meeting Editing

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 3.1 | Click on an existing meeting to view its details | Meeting details panel opens with correct info | | |
| 3.2 | Click "Edit" on the meeting | Edit form opens, pre-populated with current values | | |
| 3.3 | Change the meeting title | Field updates, no errors | | |
| 3.4 | Change the meeting date and time | Field updates, no errors | | |
| 3.5 | Change the meeting type from "in-person" to "hybrid" | Zoom link is generated upon save | | |
| 3.6 | Change the meeting type from "hybrid" to "in-person" | Zoom link is removed upon save | | |
| 3.7 | Save the edited meeting | Success confirmation, changes persist | | |
| 3.8 | Verify changes appear in the database | Updated details shown | | |
| 3.9 | Verify changes appear on the calendar view | Calendar block reflects new date/time | | |
| 3.10 | Refresh the page and recheck | Edits persist after page reload | | |

---

## 4. Meeting Deletion

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 4.1 | Select an existing meeting | Meeting details are visible | | |
| 4.2 | Click "Delete" | Confirmation dialog appears ("Are you sure?") | | |
| 4.3 | Cancel the deletion | Meeting is NOT deleted, dialog closes | | |
| 4.4 | Click "Delete" again, then confirm | Meeting is removed | | |
| 4.5 | Verify the meeting no longer appears in the list | Meeting is gone | | |
| 4.6 | Verify the meeting no longer appears on the calendar | Calendar block is removed | | |
| 4.7 | Refresh the page | Deletion persists | | |

---

## 5. Calendar Display

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 5.1 | Navigate to the calendar view | Calendar loads without errors | | |
| 5.2 | Switch to daily view | Shows only today's meetings, correctly placed by time | | |
| 5.3 | Switch to weekly view | Shows the full week with meetings on correct days | | |
| 5.4 | Navigate to the next week/day | Calendar updates to show future dates | | |
| 5.5 | Navigate to the previous week/day | Calendar updates to show past dates | | |
| 5.6 | Click on a meeting block in the calendar | Meeting details open | | |
| 5.7 | Verify a day with no meetings | Displays as empty (no ghost data or errors) | | |
| 5.8 | Verify a day with multiple meetings | All meetings visible, no overlapping or cut-off blocks | | |

---

## 6. Zoom Integration

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 6.1 | Create a new hybrid meeting | Zoom link is auto-generated and visible in meeting details | | |
| 6.2 | Click the generated Zoom link | Opens a valid Zoom meeting page | | |
| 6.3 | Create a virtual meeting | Zoom link is auto-generated | | |
| 6.4 | Edit a hybrid meeting's time | Zoom link remains attached | | |
| 6.5 | Delete a meeting with a Zoom link | Zoom meeting is also cleaned up (verify in Zoom dashboard if possible) | | |
| 6.6 | Switch between Zoom accounts (if rotation is available) | Confirm the platform uses the correct/next available account | | |
| 6.7 | Create two overlapping virtual meetings | System prevents it| | |

---

## 7. Google Calendar Sync (One-Way) [TODO: Update to two-ways]

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 7.1 | Create a meeting on the platform | Meeting appears in ICR's shared Google calendar | | |
| 7.2 | Edit a meeting on the platform | Changes reflect in the Google calendar | | |
| 7.3 | Delete a meeting on the platform | Meeting is removed from the Google calendar | | |
| 7.4 | Check sync timing | Note how long it takes for changes to appear in Outlook (immediate? minutes?) | | |

---

## 8. Room and Meeting Filters

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 8.1 | Apply a room filter on the meeting list or calendar | Only meetings in the selected room are shown | | |
| 8.2 | Apply a meeting type filter (e.g., "virtual only") | Only virtual meetings are shown | | |
| 8.3 | Clear all filters | Full meeting list/calendar is restored | | |
| 8.4 | Apply multiple filters at once | Results reflect the combined filter criteria | | |

---

## 9. Edge Cases and Error Handling

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 9.1 | Submit a meeting with a past date/time | System warns the user | | <!-- [TODO: Implement said warning...]  -->|
| 9.2 | Enter extremely long text in the title field | Character limit warning below title field | | <!-- [TODO: Check if our platform will past this] -->|
| 9.3 | Open the platform in two tabs, edit the same meeting in both | No data corruption; last save wins or conflict is flagged | | <!-- [TODO: Can our platform do this...Need to double check]  -->|
| 9.4 | Lose internet connection while creating a meeting | Error message shown, data is not silently lost | | <!-- [TODO: Check this]  -->|
| 9.5 | Rapidly click "Submit" multiple times | Only one meeting is created (no duplicates) | | <!-- [TODO: Check this]  -->|
| 9.6 | Access the platform on a tablet-sized screen | Layout is usable (note any issues for mobile responsiveness backlog) | | |

---

## 10. Recurring Meetings <!-- [TODO: Expand on this after done with logic] -->

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 10.1 | Create a recurring meeting (e.g., weekly on Tuesdays) | Recurrence options are available in the form | | |
| 10.2 | Verify that multiple instances are generated | Future meeting instances appear on the calendar | | |
| 10.3 | Edit a single instance of a recurring meeting | Only that instance changes (or document if all instances change) | | |
| 10.4 | Delete a single instance | Only that instance is removed | | |
| 10.5 | Delete the entire recurring series | All instances are removed | | |

---

## Test Summary

| Section | Total Tests | Passed | Failed | Partial | Notes |
|---------|-------------|--------|--------|---------|-------|
| 1. Authentication | 8 | | | | |
| 2. Meeting Creation | 9 | | | | |
| 3. Meeting Editing | 10 | | | | |
| 4. Meeting Deletion | 7 | | | | |
| 5. Calendar Display | 8 | | | | |
| 6. Zoom Integration | 7 | | | | |
| 7. Calendar Sync | 4 | | | | |
| 8. Filters | 4 | | | | |
| 9. Edge Cases | 6 | | | | |
| 10. Recurring Meetings | 5 | | | | |
| **Total** | **68** | | | | |

**Overall Assessment:** ☐ Ready for launch &nbsp; ☐ Needs fixes before launch &nbsp; ☐ Major issues found

**Tested by:** _______________ **Date:** _______________

**Key Issues Found:**

1. _______________
2. _______________
3. _______________