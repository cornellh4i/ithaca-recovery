# Calendar View Behavior

## Overlapping Meetings

- **Display:** Overlapping room bookings appear side-by-side, up to a limit that depends on screen
  layout — 2 on desktop, 3 on mobile portrait, 1 on mobile landscape. Additional overlaps beyond
  that fold into a `+N more` indicator.
- **Month view:** a month's day cells are too small for meeting blocks, so overlaps aren't laid
  out there at all — each meeting is one dot, and the day's popover lists them all.
- **Double-booking warning:** Side-by-side rendering is purely visual. Overbooking still triggers a warning that admins must explicitly confirm when saving (see [Create, Edit, and Delete Meetings](../how-to/create-edit-delete-meetings.md)).

## Auto-Refresh Policy

The calendar polls for updates every **30 seconds** so changes from other users appear automatically without manual page reloads. Because this uses polling rather than a live push stream, updates may take up to 30 seconds to reflect across devices.
