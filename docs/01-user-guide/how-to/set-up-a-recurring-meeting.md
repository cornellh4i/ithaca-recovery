# Set Up a Recurring Meeting

When creating or editing a meeting, check **"This meeting is recurring"** to expand the recurrence
options, then choose **Weekly** or **Monthly** from the "Repeats" dropdown.

## Weekly

- **"Every N week(s)"** — the interval (1 = every week, 2 = biweekly).
- **Day buttons (S M T W T F S)** — which days it occurs. The day matching your selected start
  date is pre-checked automatically.

## Monthly

- **"Monthly on day N"** — the same numeric day every month.
- **"Monthly on the 1st/2nd/3rd/4th {Weekday}"** — e.g. the 2nd Tuesday of every month.
- **"Monthly on the last {Weekday}"** — the final occurrence of that weekday each month.

## Ends

- **Never** — repeats indefinitely.
- **On** — pick a specific end date.
- **After** — a specific number of total occurrences.

## Example: weekly AA meeting every Monday and Wednesday for 6 months

1. Check "This meeting is recurring."
2. Leave "Repeats" on "Weekly," set "Every 1 week(s)."
3. Click **M** and **W** in the day buttons.
4. Set "Ends" to "On" and pick the date 6 months out.

## A second mode on other days ("linked schedules")

For a group that meets one way on some days and another way on others — Hybrid Monday-Friday and
Zoom Only on Saturday, say — add a **linked schedule** instead of creating a second meeting. Both
schedules are one meeting sharing one Zoom link (see
[How Calendar and Zoom Sync Work](../explanation/how-sync-works.md)).

1. Fill in the recurrence options above for the meeting's main schedule, then click **Done** — it
   collapses into a summary card.
2. Click **"Add another mode for other days."**
3. Pick the second schedule's **Mode** and **days**. The mode the meeting already uses and the days
   it already meets on are greyed out — the two schedules must differ in mode and never share a day.
4. Fill in whichever of Room / Zoom room the new mode needs. It uses the meeting's existing Zoom
   host and join link, so there's nothing to pick there.
5. Save the meeting as usual. Both schedules are written together.

The time, length, repeat interval and end date always come from the meeting's main schedule — Zoom
holds both as a single schedule, so they can't differ.

A meeting can run **two** schedules at most, so the trigger disappears once a second one exists.
After saving, the second schedule shows at the top of the meeting's form as a card with a
**Remove** button and a link to open it as a meeting of its own — that's where its mode, days, room
and host are changed. On the edit form, adding a schedule is a save of its own: save any other
changes to the meeting first.

## Editing or deleting one occurrence

Works the same as any other meeting — see
[Create, Edit, and Delete Meetings](create-edit-delete-meetings.md). Editing always applies to the
whole series; deleting can target just one occurrence, one occurrence and everything after it, or
the whole series.
