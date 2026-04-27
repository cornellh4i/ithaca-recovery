# User Guide
### ICR Admin Scheduling Platform

A step-by-step guide for ICR board members on how to use the scheduling platform.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Creating a Meeting](#3-creating-a-meeting)
4. [Viewing a Meeting](#4-viewing-a-meeting)
5. [Editing a Meeting](#5-editing-a-meeting)
6. [Deleting a Meeting](#6-deleting-a-meeting)
7. [Navigating the Calendar](#7-navigating-the-calendar)
8. [Filtering the Calendar](#8-filtering-the-calendar)
9. [Recurring Meetings](#9-recurring-meetings)
10. [Exporting Lease Documents (PandaDocs CSV)](#10-exporting-lease-documents-pandadocs-csv)
11. [Digital Signage](#11-digital-signage)
12. [Admin User Management](#12-admin-user-management)
13. [Common Scenarios & FAQs](#13-common-scenarios--faqs)
14. [Troubleshooting](#14-troubleshooting)
15. [Contact & Support](#15-contact--support)
16. [Quick Reference Card](#16-quick-reference-card)

---

## 1. Getting Started

### Accessing the Platform

Open a web browser and go to:

**`https://ithaca-recovery-deployment.vercel.app`**

The platform works in any modern browser (Chrome, Firefox, Edge, Safari). No app installation is required.

### Logging In

1. Navigate to the URL above.
2. You will be automatically redirected to the Microsoft login page.
3. Sign in using your **ICR Microsoft organizational email and password**.
4. After a successful login, you will be taken back to the main calendar dashboard.

> **First time?** Your account needs to be added as an admin by an existing board member before you can log in. Contact `[TODO: name/email of ICR admin contact]` to be added.

> **TODO (dev team):** Update login instructions once the transition to Google Auth is complete. The sign-in button will use Google accounts instead of Microsoft.

### Troubleshooting Login

| Problem | Fix |
|---|---|
| Redirected to Microsoft but can't sign in | Make sure you're using your ICR organizational email, not a personal account |
| Page loads but sidebar is missing | Your account may not have been added as an admin — contact `[TODO: ICR admin contact]` |
| Page won't load at all | Check your internet connection; try a different browser |

---

## 2. Dashboard Overview

`[TODO: Add annotated screenshot of the full dashboard]`

The dashboard has three areas:

```
┌─────────────────┬──────────────────────────────────────────────┐
│                 │  [Navbar: date, view selector, Export CSV]   │
│  Left Sidebar   ├──────────────────────────────────────────────┤
│                 │                                              │
│  • New Meeting  │          Main Calendar View                  │
│  • Mini cal     │       (Day or Week layout)                   │
│  • Filters      │                                              │
│                 │                                              │
└─────────────────┴──────────────────────────────────────────────┘
```

**Left Sidebar** — where you create meetings, navigate dates, and filter what's shown on the calendar. When you select a meeting, this area switches to show that meeting's details.

**Calendar Navbar** — shows the current date range, lets you switch between Day and Week views, jump to Today, navigate forward/back, and export the lease CSV.

**Main Calendar View** — shows meetings as time blocks on the selected day or week. Click any meeting block to view its details.

The calendar **auto-refreshes every 30 seconds**, so you don't need to reload the page to see changes made by other board members.

---

## 3. Creating a Meeting

1. In the left sidebar, click the **"+ New Meeting"** button.

2. The sidebar switches to a meeting creation form. Fill in the following fields:

   **Meeting Title** — the name of the group (e.g., "AA Thursday Evening Group").

   **Mode** — choose one of three buttons:
   - **Hybrid** — in-person at ICR *and* via Zoom. Shows both Room and Zoom Account selectors.
   - **In Person** — in-person only. Shows the Room selector; no Zoom needed.
   - **Remote** — Zoom only. Shows the Zoom Account selector; no room required.

   **Date** — click the calendar icon to pick the meeting date.

   **Time** — click the clock icon to set the start and end time. All times are Eastern Time (ET).
   > If a meeting runs past midnight (e.g., 10:00 PM – 2:00 AM), the end date automatically advances to the next day.

   **Recurring** — check "This meeting is recurring" if the meeting repeats. See [Section 9](#9-recurring-meetings) for details.

   **Room** *(Hybrid and In Person only)* — select the physical room at 518 W Seneca St:

   | Room | Location |
   |---|---|
   | Serenity Room | Main floor |
   | Seeds of Hope | Upstairs |
   | Unity Room | Basement |
   | Room for Improvement | `[TODO: confirm floor]` |
   | Small but Powerful – Left | `[TODO: confirm floor]` |
   | Small but Powerful – Right | `[TODO: confirm floor]` |

   **Meeting Type** — select the calendar the meeting belongs to:
   - AA
   - Al-Anon
   - Other

   **Zoom Account** *(Hybrid and Remote only)* — select which ICR Zoom account to use (Zoom Email 1–4). Each account can only host one meeting at a time, so pick an account that is not already in use at that time.
   > `[TODO: Update once account rotation is automated — the platform will eventually select a free account automatically.]`

   **Email** — the contact email for the group organizer. Used for lease document generation.

   **Description** *(optional)* — additional notes about the meeting.

3. Click **"Create Meeting"**.

4. A confirmation message appears and the meeting becomes visible on the calendar immediately.

> **Note:** After creating a meeting you will see a browser alert saying "Please check the Meeting collection on MongoDB." This is a placeholder confirmation — the meeting has been saved successfully. `[TODO: dev team to replace with a proper in-app notification.]`

> **Calendar sync:** The meeting is saved in the ICR database. Sync to Google Calendar is not yet active — that is a summer deliverable. `[TODO: Remove this note once sync is live.]`

---

## 4. Viewing a Meeting

1. Click any meeting block in the calendar view.
2. The left sidebar switches to a meeting detail panel showing:
   - Meeting name and mode type (Hybrid / In Person / Remote)
   - Date and time (Eastern Time)
   - Recurrence summary, if recurring (e.g., "Repeats weekly on Monday, Wednesday")
   - Contact email
   - Room location
   - Zoom account and clickable Zoom join link (if applicable)
   - Description
3. To go back to the main sidebar, click the **← back arrow** at the top of the detail panel.

---

## 5. Editing a Meeting

1. Click a meeting in the calendar to open its detail panel (see [Section 4](#4-viewing-a-meeting)).
2. Click the **⋮** (three-dot menu) in the top-right of the detail panel.
3. Select **"Edit Meeting"**.
4. The sidebar switches to an edit form pre-filled with the meeting's current values.
5. Make your changes and click **"Update Meeting"**.

All fields can be edited: title, mode, date, time, room, meeting type, Zoom account, email, description, and recurrence pattern.

> **Recurring meetings:** Editing a recurring meeting updates the entire series. Editing only a single occurrence within the series is not yet supported.

---

## 6. Deleting a Meeting

1. Click a meeting in the calendar to open its detail panel.
2. Click **⋮** → **"Delete Meeting"**.

**For non-recurring meetings:** The meeting is deleted immediately.

**For recurring meetings:** A modal dialog appears with three options:

| Option | What it does |
|---|---|
| This event | Deletes only this occurrence |
| This and following events | Deletes this and all future occurrences |
| All events | Deletes the entire series |

> **Known limitation:** "This event" and "This and following events" are not yet fully implemented — they currently delete the full series, the same as "All events." Use caution when deleting recurring meetings. This is a known gap targeted for a future update.

> **Deleted meetings cannot be recovered** through the platform. If you accidentally delete a meeting, recreate it manually.

---

## 7. Navigating the Calendar

**Switching views:**
Use the **Day / Week** dropdown in the navbar to switch between a single-day layout and a 7-day week view (Sunday–Saturday).

**Moving forward and back:**
- Click the **← left arrow** to go to the previous day or week.
- Click the **→ right arrow** to go to the next day or week.

**Jumping to today:**
Click **"Today"** in the navbar to return to the current date in Day view.

**Selecting a specific date:**
Use the **mini calendar** in the left sidebar — click any date to jump to it.

---

## 8. Filtering the Calendar

The **Filters** section in the left sidebar lets you show or hide meetings by category. All filters are on by default. Uncheck any box to hide that category; the calendar updates immediately.

**Location** (color-coded on the calendar):
- Serenity Room (green)
- Seeds of Hope (yellow)
- Unity Room (blue)
- Room for Improvement (orange)
- Small but Powerful – Right (purple)
- Small but Powerful – Left (pink)
- Zoom Account 1–4 (gray)

**Calendar type:**
- AA
- Al-Anon
- Other

**Mode:**
- In Person
- Hybrid
- Remote

---

## 9. Recurring Meetings

When creating or editing a meeting, check **"This meeting is recurring"** to expand the recurrence options.

**Frequency** — how often the meeting repeats:
- Use the number input to set the interval. "Every 1 week" = weekly, "Every 2 weeks" = biweekly.

**Days of week** — click the day buttons (S M T W T F S) to select which days the meeting occurs. The day matching your selected start date is pre-checked automatically.

**Ends** — when the series stops:
- **Never** — repeats indefinitely.
- **On** — pick a specific end date.
- **After** — specify a number of total occurrences.

**Example — weekly AA meeting every Monday and Wednesday for 6 months:**
1. Check "This meeting is recurring."
2. Set frequency to "Every 1 week."
3. Click **M** and **W** in the day buttons.
4. Set "Ends" to "On" and pick the date 6 months out.

> **Known limitation:** Editing or deleting a single occurrence within a recurring series is not yet fully supported. See [Section 6](#6-deleting-a-meeting).

---

## 10. Exporting Lease Documents (PandaDocs CSV)

ICR uses annual lease agreements for each group renting space (lease year: July 1 – June 30 of the following year). The platform generates a CSV that you upload to PandaDocs for bulk sending.

### When to run this

Once per year, in late June or early July, after the new lease year's schedule is finalized.

### Steps

1. Make sure all meetings for the **first week of July** are entered in the platform — the export reads the July 1–7 schedule to determine each group's booking.

2. In the calendar navbar, click **"Export CSV"**.

3. A file named `[year] - [year+1] Bulk Send Lease.csv` downloads to your computer (e.g., `2025 - 2026 Bulk Send Lease.csv`).

4. Log into [PandaDocs](https://www.pandadoc.com).

5. Go to **Bulk Send** → upload the CSV → select the ICR lease template → send.

PandaDocs sends each group their lease document pre-filled with their meeting details, room, rate, and contact email.

### Room rates used in the export

| Room | Rate |
|---|---|
| Serenity Room | $15/hr |
| Seeds of Hope | $10/hr |
| Unity Room | $10/hr |
| Room for Improvement | $10/hr |
| Small but Powerful – Left | $10/hr |
| Small but Powerful – Right | $10/hr |
| Zoom Only | $10/month (flat) |

> If ICR changes room rates, a developer needs to update the `roomRates` object in `frontend/app/components/molecules/PandaDocButton.tsx`.

---

## 11. Digital Signage

`[TODO: This feature is not yet deployed. Complete this section once the digital signage system is live.]`

The digital signage is a physical display board at the ICR facility (518 W Seneca St) that shows community members the current day's meetings — room, time, and meeting name — without requiring a phone or computer.

**Planned behavior:**
- Automatically pulls today's meetings from the platform database.
- Updates on a regular interval (exact timing TBD).
- Displays meeting name, start/end time, and room.

**If the signage isn't working:** `[TODO: Add troubleshooting steps once deployed.]`

---

## 12. Admin User Management

`[TODO: An admin management UI is not yet built. Until it is, adding or removing admins requires developer access.]`

**To add a new admin (current workaround — requires developer):**

Provide a developer with:
- Full name
- Email address (the one they'll sign in with)
- Microsoft/Google account UID

The developer will add the record to the database.

**Best practices for board transitions:**
- Add the incoming board member as an admin *before* the outgoing member's access is removed.
- Before a board member leaves, confirm all active recurring meetings have correct Zoom accounts assigned.
- Export the current schedule (or take screenshots) before any large-scale changes.

---

## 13. Common Scenarios & FAQs

**"I need to schedule a weekly meeting for the next 6 months."**

Create the meeting with recurrence enabled. Set frequency to "Every 1 week," select the days, and set "Ends" to "On [date 6 months out]." See [Section 9](#9-recurring-meetings).

---

**"Someone called asking about tonight's meeting."**

1. Click **"Today"** in the navbar to go to today's Day view.
2. Find the meeting in the time grid and click it.
3. The detail panel shows date, time, room, and Zoom link.

---

**"The Zoom link isn't working."**

1. Click the meeting and check that a Zoom link is shown. If the link field is blank, try editing and re-saving the meeting.
2. Test the link in a private/incognito browser window to rule out a login conflict.
3. If still broken, delete the meeting and recreate it — a new Zoom meeting will be generated.
4. If problems persist, contact `[TODO: H4I support contact]`.

---

**"I accidentally deleted a meeting."**

Deleted meetings cannot be restored. Recreate the meeting manually with the same details. For a recurring series, recreate the full series.

---

**"A group changed their meeting day or time."**

Edit the meeting (see [Section 5](#5-editing-a-meeting)). For a recurring series, editing updates the entire series. If only one occurrence changed temporarily, you'll need to delete that occurrence and create a separate one-time meeting for the new details — editing a single occurrence is not yet supported.

---

**"Which room is free at a given time?"**

Go to the Day view for the relevant date. In the Filters sidebar, uncheck all rooms except the one you want to check. Any open time blocks on the calendar are available. Repeat for each room you're considering.

---

## 14. Troubleshooting

| Problem | What to try |
|---|---|
| Can't log in | Confirm you're using your ICR org email. Check with `[TODO: ICR admin]` that your account has been added. |
| Calendar shows no meetings | Make sure all filters are checked in the sidebar. Click "Today" to reset the date. |
| Meeting not visible after creating it | Wait 30 seconds for the auto-refresh, or reload the page. |
| Zoom link is blank on a meeting | Edit the meeting and re-save. If it persists, delete and recreate. |
| "Export CSV" downloads an empty file | Confirm meetings are scheduled in the first week of July — the export only reads July 1–7. |
| Digital signage not updating | `[TODO: Add once signage is deployed.]` |
| Calendar not syncing | Google Calendar sync is not yet live — it is a planned feature. `[TODO: Remove once live.]` |
| Page behaves unexpectedly | Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). Or try a different browser. |

---

## 15. Contact & Support

**For technical issues with the platform:**
- Email: `[TODO: H4I handoff support email]`
- Expected response time: `[TODO]`

---

## 16. Quick Reference Card

*Print this page and keep it at the ICR office.*

---

**Platform URL:** `https://ithaca-recovery-deployment.vercel.app`

**Login:** Use your ICR Microsoft email *(→ Google email once migration is complete)*

---

**Create a meeting**
1. Click **"+ New Meeting"** in the left sidebar
2. Fill in: title, mode, date, time, room and/or Zoom account, meeting type, email
3. Click **"Create Meeting"**

**View a meeting**
1. Click any meeting block on the calendar
2. Details appear in the left sidebar

**Edit a meeting**
1. Click meeting → click **⋮** → **"Edit Meeting"**
2. Change fields → click **"Update Meeting"**

**Delete a meeting**
1. Click meeting → click **⋮** → **"Delete Meeting"**
2. For recurring meetings: read the modal carefully before confirming *(partial deletion not yet fully working — "All events" is safest)*

**Export lease CSV** *(once per year, early July)*
1. Click **"Export CSV"** in the top navbar
2. Upload the downloaded file to PandaDocs → Bulk Send

---

**Key contacts**

| Role | Contact |
|---|---|
| Technical support | `[TODO]` |
