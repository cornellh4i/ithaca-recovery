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
10. [Exporting Data (Admin → Export)](#10-exporting-data-admin--export)
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

1. Navigate to the URL above and click **Sign In** in the top-right corner.
2. Sign in with your Google account.
3. After a successful login, you're taken to the main calendar dashboard.

> **First time?** Your email address must be added to the platform by a Super Admin before you can sign in — see [Section 12](#12-admin-user-management). This doesn't send you an automatic email, so the Super Admin who added you should let you know separately.

> If you try to sign in before your email has been added, you'll land on a generic error page rather than a helpful message — that means you haven't been added yet, not that something is broken.

### Troubleshooting Login

| Problem | Fix |
|---|---|
| Google sign-in fails or bounces to an error page | Your email hasn't been added as an admin yet — contact a Super Admin to be added |
| "Admin" link in the top nav is locked/greyed out | You're signed in but your role doesn't have admin access, or your account needs Super Admin to reach certain tabs |
| Page won't load at all | Check your internet connection; try a different browser |

---

## 2. Dashboard Overview

The dashboard has three areas:

```
┌────────────────────────────────────────────────────────────────┐
│  [Top nav: Main Calendar · Signage · Admin · Sign Out]         │
├─────────────────┬────────────────────────────────────────────────┤
│                 │  [Calendar Navbar: date, Day/Week, Today]     │
│  Left Sidebar   ├────────────────────────────────────────────────┤
│                 │                                                │
│  • New Meeting  │          Main Calendar View                   │
│  • Mini cal     │       (Day or Week layout)                    │
│  • Filters      │                                                │
│                 │                                                │
└─────────────────┴────────────────────────────────────────────────┘
```

**Top nav** — "Main Calendar" (the live scheduling view), "Signage" (read-only calendar for the lobby display), and "Admin" (visible but locked unless you're signed in with admin access). Shows "Welcome, {your name}" and a Sign Out link when signed in.

**Left Sidebar** — where you create meetings, navigate dates, and filter what's shown on the calendar. When you select a meeting, this area switches to show that meeting's details.

**Calendar Navbar** — shows the current date range, a Day/Week dropdown, a "Today" link, and forward/back arrows.

**Main Calendar View** — shows meetings as time blocks on the selected day or week. Click any meeting block to view its details.

The calendar **auto-refreshes every 30 seconds**, so you don't need to reload the page to see changes made by other board members.

---

## 3. Creating a Meeting

1. In the left sidebar, click the **"+ New Meeting"** button.

2. The sidebar switches to a meeting creation form. Fill in the following fields:

   **Meeting title** — the name of the group (e.g., "AA Thursday Evening Group").

   **Mode** — choose one of three buttons:
   - **Hybrid** — in-person at ICR *and* via Zoom. Shows both the Room and Zoom Room selectors.
   - **In Person** — in-person only. Shows the Room selector; no Zoom needed.
   - **Remote** — Zoom only. Shows the Zoom Room selector; no room required.

   **Date** — click the calendar icon to pick the meeting date.

   **Time** — click the clock icon to set the start and end time. All times are Eastern Time (ET).
   > If a meeting runs past midnight (e.g., 10:00 PM – 2:00 AM), the end date automatically advances to the next day.

   **This meeting is recurring** — check this box if the meeting repeats. See [Section 9](#9-recurring-meetings) for details.

   **Select Room** *(Hybrid and In Person only)* — the physical room at 518 W Seneca St:

   | Room |
   |---|
   | Serenity Room |
   | Seeds of Hope Room |
   | Unity Room |
   | Room for Improvement |
   | Room for Acceptance |
   | Room for Gratitude |

   **Meeting Type** — check all calendars this meeting belongs to (a meeting can belong to more than one):
   - AA
   - Al-Anon
   - Other

   **Select Zoom Room** *(Hybrid and Remote only)* — one of five named Zoom rooms: the four physical rooms' matching Zoom room, plus Children's Room @ 518. Picking a physical room auto-selects its matching Zoom room; you can change it if the meeting needs a different one.

   **Email** — the contact email for the group organizer. Used for lease document generation.

   **Description** *(optional)* — additional notes about the meeting.

3. Click **"Create Meeting"**.

4. A confirmation alert appears — it currently reads "Meeting created successfully! Please check the Meeting collection on MongoDB," which is stale wording left over from earlier development, but the meeting has in fact been saved and is visible on the calendar immediately.

> **Calendar sync:** The meeting is published to Google Calendar automatically, on the calendar(s) matching its Meeting Type (AA / Al-Anon / Other). If a meeting shows a ⚠ badge, sync failed for at least one calendar — open the meeting and use the **Retry sync** button (see [Section 4](#4-viewing-a-meeting)).

---

## 4. Viewing a Meeting

1. Click any meeting block in the calendar view.
2. The left sidebar switches to a meeting detail panel showing:
   - Meeting name and mode (Hybrid / In Person / Remote)
   - Date and time range (Eastern Time)
   - Recurrence summary, if recurring (e.g., "Weekly · M, W, F")
   - Email
   - Meeting Mode
   - Calendar (which of AA / Al-Anon / Other it's published to)
   - Sync status — "Synced to Google Calendar ✓", or "Google Calendar sync failed ⚠" with a **Retry sync** button
   - Location
   - **Zoom Account** and a clickable Zoom join link, if applicable *(same field as "Zoom Room" on the create/edit form — the detail view hasn't been relabeled to match yet)*
   - Description
3. To go back to the main sidebar, click the **← back arrow** at the top of the detail panel.

---

## 5. Editing a Meeting

1. Click a meeting in the calendar to open its detail panel (see [Section 4](#4-viewing-a-meeting)).
2. Click the **⋮** (three-dot menu) in the top-right of the detail panel.
3. Select **"Edit Meeting"**.
4. The sidebar switches to an edit form pre-filled with the meeting's current values.
5. Make your changes and click **"Update Meeting"**.

All fields can be edited: title, mode, date, time, room, meeting type, Zoom room, email, description, and recurrence pattern.

> **Recurring meetings:** Editing a recurring meeting updates the entire series — there's no way to edit just one occurrence. If only one date needs different details, delete that single occurrence (see [Section 6](#6-deleting-a-meeting)) and create a separate one-time meeting for it.

---

## 6. Deleting a Meeting

1. Click a meeting in the calendar to open its detail panel.
2. Click **⋮** → **"Delete Meeting"**.

**For non-recurring meetings:** The meeting is deleted immediately, with **no confirmation prompt** — double-check you have the right meeting open before clicking Delete.

**For recurring meetings:** A "Delete recurring event" dialog appears with three options:

| Option | What it does |
|---|---|
| This event | Deletes only this occurrence; future occurrences are unaffected |
| This and following events | Deletes this occurrence and everything after it; earlier occurrences are unaffected |
| All events | Deletes the entire series |

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

**Overlapping meetings:** In Week view, meetings that overlap in the same room share space side-by-side (up to 2 at once, with a "+N more" indicator beyond that) rather than hiding each other.

---

## 8. Filtering the Calendar

The **Filters** section in the left sidebar lets you show or hide meetings by category. Unchecking a box hides that category immediately.

- **Day view** starts with every filter checked (all shown).
- **Week view** starts with all room filters *unchecked* (nothing shown until you opt in) — this is intentional, not a bug, since a full week of every room at once is hard to read.

**Location** (6 physical rooms, color-coded on the calendar):
Serenity Room, Seeds of Hope Room, Unity Room, Room for Improvement, Room for Acceptance, Room for Gratitude.

**Zoom Rooms** (5, shown in gray):
Serenity Room - Zoom, Seeds of Hope Room - Zoom, Unity Room - Zoom, Room for Improvement - Zoom, Children's Room @ 518 - Zoom.

**Calendar:**
AA, Al-Anon, Other.

**Mode:**
In Person, Hybrid, Remote.

---

## 9. Recurring Meetings

When creating or editing a meeting, check **"This meeting is recurring"** to expand the recurrence options, then choose **Weekly** or **Monthly** from the "Repeats" dropdown.

**Weekly:**
- "Every N week(s)" — set the interval (1 = every week, 2 = biweekly).
- Day buttons (S M T W T F S) — select which days the meeting occurs. The day matching your selected start date is pre-checked automatically.

**Monthly:**
- "Monthly on day N" — same numeric day every month.
- "Monthly on the 1st/2nd/3rd/4th {Weekday}" — e.g. the 2nd Tuesday of every month.
- "Monthly on the last {Weekday}" — the final occurrence of that weekday each month.

**Ends** — when the series stops:
- **Never** — repeats indefinitely.
- **On** — pick a specific end date.
- **After** — specify a number of total occurrences.

**Example — weekly AA meeting every Monday and Wednesday for 6 months:**
1. Check "This meeting is recurring."
2. Leave "Repeats" on "Weekly," set "Every 1 week(s)."
3. Click **M** and **W** in the day buttons.
4. Set "Ends" to "On" and pick the date 6 months out.

> Editing or deleting a single occurrence within a recurring series works the same as any other meeting — see [Sections 5](#5-editing-a-meeting) and [6](#6-deleting-a-meeting).

---

## 10. Exporting Data (Admin → Export)

Go to **Admin → Export**. Two exports are available, both Super-Admin-only:

### Export Meetings (full XLSX backup)

Click **"Export Meetings"** to download an `.xlsx` file with every meeting (recurring and one-time) — room, mode, contact, schedule, and Google Calendar/Zoom sync IDs. Useful as a full data backup or for auditing.

### Export Lease CSV (PandaDocs bulk send)

ICR uses annual lease agreements for each group renting space (lease year: July 1 – June 30 of the following year by default). This export generates a CSV for PandaDocs's Bulk Send feature, covering every meeting with `status: Active`.

1. Click **"Export Lease CSV"**.
2. A file named `[year] - [year+1] Bulk Send Lease.csv` downloads.
3. Log into [PandaDocs](https://www.pandadoc.com).
4. Go to **Bulk Send** → upload the CSV → select the ICR lease template → send.

**Configuring lease settings:** click the **⋮** on the Export Lease CSV card → **"Configure export…"** to open the "Configure PandaDocs lease export" modal, where you can set:
- Lease period (start/end date)
- Per-room rate and unit (`/hr` or `/month`)
- Rental agent contact (name, title, email, phone, address)
- The email message template (supports a `{group}` placeholder for the group's name)

Until someone saves settings here, the export uses ICR's default rates (Serenity Room $15/hr; all other rooms $10/hr; Zoom-only $10/month flat) and a default rental-agent contact. Settings persist in the database once saved — no code change needed to update rates going forward.

---

## 11. Digital Signage

A read-only calendar view at `/signage`, meant for a physical display board at the ICR facility (518 W Seneca St) showing community members the current day's or week's meetings without requiring a phone or computer.

- Auto-refreshes every 2 minutes, and automatically rolls over to the next day at midnight (Eastern Time) without a page reload.
- Uses the same Day/Week toggle as the main calendar; which rooms, calendars, and modes it shows can be pre-configured via URL query parameters (`rooms`, `zoom`, `types`, `modes`, `view`) — generate one from **Admin → Export → Generate Signage URL**.
- Fully read-only: clicking a meeting does nothing, and no sign-in is required to view it.

---

## 12. Admin User Management

Go to **Admin → Users** (Super-Admin-only).

**Table:** lists every admin's Name, Email, and Role, with a role dropdown (Super Admin / Admin / User) and a **Remove** button per row.

**Inviting a new admin:** under "Invite User," enter their email and pick a role, then click **"Send Invite."** This adds them to the platform immediately — it does **not** send them an email, so let them know directly that they can now sign in with that Google account.

**Changing or removing access:** use the row's role dropdown to promote/demote, or **Remove** to take someone off the platform entirely. To prevent the platform being locked with no one able to manage it, the last remaining Super Admin's role dropdown and Remove button are both disabled, with a caption explaining why.

**Best practices for board transitions:**
- Invite the incoming board member before removing the outgoing member's access.
- Before a board member leaves, confirm all active recurring meetings have correct Zoom rooms assigned.
- Run an Export Meetings backup (see [Section 10](#10-exporting-data-admin--export)) before any large-scale changes.

---

## 13. Common Scenarios & FAQs

**"I need to schedule a weekly meeting for the next 6 months."**

Create the meeting with recurrence enabled. Set frequency to "Every 1 week(s)," select the days, and set "Ends" to "On [date 6 months out]." See [Section 9](#9-recurring-meetings).

---

**"Someone called asking about tonight's meeting."**

1. Click **"Today"** in the navbar to go to today's Day view.
2. Find the meeting in the time grid and click it.
3. The detail panel shows date, time, room, and Zoom link.

---

**"The Zoom link isn't working."**

1. Click the meeting and check that a Zoom link is shown. If the link field is blank, try editing and re-saving the meeting.
2. Test the link in a private/incognito browser window to rule out a login conflict.
3. If problems persist, contact `[TODO: H4I support contact]`.

---

**"I accidentally deleted a meeting."**

Deleted meetings cannot be restored. Recreate the meeting manually with the same details. For a recurring series, recreate the full series (unless only a single occurrence was deleted — see [Section 6](#6-deleting-a-meeting), which only removes that one date).

---

**"A group changed their meeting day or time."**

Edit the meeting (see [Section 5](#5-editing-a-meeting)). For a recurring series, editing updates the entire series. If only one occurrence changed temporarily, delete that single occurrence and create a separate one-time meeting with the new details.

---

**"Which room is free at a given time?"**

Go to the Day view for the relevant date. In the Filters sidebar, uncheck all rooms except the one you want to check. Any open time blocks on the calendar are available. Repeat for each room you're considering.

---

## 14. Troubleshooting

| Problem | What to try |
|---|---|
| Can't sign in | Confirm you're using the Google account whose email a Super Admin has added — see [Section 12](#12-admin-user-management) |
| "Admin" link is locked | Your account needs admin access; ask a Super Admin to check your role |
| Calendar shows no meetings | In Week view, room filters default off — check the boxes you need. Click "Today" to reset the date. |
| Meeting not visible after creating it | Wait 30 seconds for the auto-refresh, or reload the page |
| Zoom link is blank on a meeting | Edit the meeting and re-save. If it persists, delete and recreate |
| A meeting shows a ⚠ badge | Google Calendar sync failed for that meeting — open it and click **Retry sync** |
| "Export Lease CSV" fails with no active meetings | Confirm meetings with `status: Active` exist for the configured lease period |
| Page behaves unexpectedly | Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). Or try a different browser |

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

**Login:** Sign in with the Google account a Super Admin has added for you.

---

**Create a meeting**
1. Click **"+ New Meeting"** in the left sidebar
2. Fill in: title, mode, date, time, room and/or Zoom room, meeting type, email
3. Click **"Create Meeting"**

**View a meeting**
1. Click any meeting block on the calendar
2. Details appear in the left sidebar

**Edit a meeting**
1. Click meeting → click **⋮** → **"Edit Meeting"**
2. Change fields → click **"Update Meeting"**

**Delete a meeting**
1. Click meeting → click **⋮** → **"Delete Meeting"**
2. Non-recurring: deletes immediately, no confirmation — double-check first
3. Recurring: choose "This event" / "This and following events" / "All events" in the dialog

**Export data** *(Admin → Export, Super Admin only)*
1. "Export Meetings" → full XLSX backup
2. "Export Lease CSV" → PandaDocs Bulk Send, once per year in early July

---

**Key contacts**

| Role | Contact |
|---|---|
| Technical support | `[TODO]` |
