# Icon and Badge Legend

What each icon and badge on the calendar means, and where you'll see it.

**Admin-only:** every icon on this page except the mode icons only appears for signed-in admins.
Conflict, sync-failure, and suspension data isn't fetched for public viewers, so a board member
browsing without an admin account never sees any of it — not "hidden," just never loaded.

**Screenshot freshness:** the app's icon set was migrated from custom SVG assets to
`@mui/icons-material` glyphs. The mode-icon screenshot below was recaptured against the new
icons; every other screenshot on this page (conflict, sync-failure, suspend, diagnostics-panel,
overlap-modal) still shows the pre-migration glyphs and needs re-capturing by an admin — the
icons themselves are correct, just these specific images are stale.

| Icon | Meaning | Where you'll see it |
|---|---|---|
| Co-present (mode tag) | Meeting is **Hybrid** | Mode picker, calendar tags, detail panel |
| Amber triangle | Room/Zoom room/Zoom host **conflict** | Calendar block (top-left), detail panel, overlap modal |
| "+N" pill (block corner) | Cluster hides N more **overlapping** meetings | Day/Week view, when 2+ meetings share a slot |
| Red broken-ring + "!" | Google Calendar/Zoom **sync failed** | Calendar block (top-right), detail panel |
| Pause (⏸) | Meeting is **suspended** | Suspend dialog, Admin Diagnostics |
| Video icon + room name | Zoom room doesn't match the physical room's default pairing | Calendar block (top-right) |

## Mode icons

![The co-present icon in a "Hybrid" tag on a calendar block](../assets/icon-legend-co-present-icon-hybrid-tag.png)

Meeting mode has three icons: a location pin for **In Person**, a video camera for **Remote**, and
this "co-present" icon — a person inside a presentation-frame outline — for **Hybrid**. The same
icon is reused in the mode picker on the New Meeting form and in the meeting detail panel.

## Conflict warning

A meeting shares a room, Zoom room, or Zoom host with another meeting at an overlapping time.
Saving isn't blocked — you can save a conflicting meeting anyway — but the warning stays visible
to admins everywhere that meeting appears until the overlap is resolved.

![An amber warning triangle in the top-left corner of a calendar block](../assets/icon-legend-conflict-warning-calendar-block.png)

On the calendar, it's a small triangle in the block's **top-left** corner — the sync-error icon
below sits in the opposite corner, so a meeting with both problems shows one in each corner rather
than overlapping.

![A "Conflicts with 2 other meetings" banner in the meeting detail panel, linking to the Admin Diagnostics page](../assets/icon-legend-conflict-warning-viewmeeting-banner.png)

Opening the meeting shows a banner naming how many other meetings it conflicts with, with a link
to **Admin → Diagnostics** for the full list.

![A "Scheduling conflict" confirmation dialog with an info icon](../assets/icon-legend-conflict-override-modal-icon.png)

If you try to save a meeting that conflicts with an existing one, this dialog appears first,
letting you save it anyway or go back and change the room, Zoom room, host, or schedule.

## Overlapping meetings and the "+N" pill

This is a separate mechanism from the conflict warning above: it's about layout, not detection.
Meetings **cluster** whenever they overlap in time within the same room/column on the calendar
grid. Clustering and conflict often coincide, since overlapping in the same physical room is
itself a conflict — but they're not the same thing. Two meetings that only share a Zoom host or
Zoom room, with different physical rooms, conflict without ever clustering: they never land in the
same column, so there's nothing to fold.

When more meetings overlap in a slot than the view can show at full width, the extras fold behind
the visible ones — shown meetings render **narrower**, not full-size, to share the column — and a
**"+N" pill** appears in the block's corner for the rest. How many render before folding depends on
the view: 2 on desktop Day/Week, 3 on mobile portrait, 1 on mobile landscape.

![The Unity Room row on the calendar: a cluster of two offset, narrowed blocks with a "+1" overflow pill on the left, next to a normal full-width single block later in the same row for comparison](../assets/icon-legend-cluster-overflow-pill.png)

Compare the cluster on the left to the ordinary "Spiritual Foundation" block later in the same
row — a clustered meeting renders narrower and offset behind its neighbor, while a normal block
takes the full row width.

Only the **pill itself** opens the list below — clicking any of the visible clustered blocks opens
that one meeting's own detail panel instead, same as clicking any other block. If a cluster has few
enough meetings that nothing folds, there's no pill and no list to open; each meeting is just its
own block.

![A dialog listing 3 overlapping meetings, two of them marked with the conflict warning icon](../assets/icon-legend-overlap-meetings-modal.png)

Each meeting in the list carries its own conflict or sync-error icon if it has one — clustering
together doesn't mean they share a status.

Don't confuse this with the unrelated "+N" that can appear **inside** a calendar block's tag row:
that one summarizes tags that didn't fit the card (e.g. `AA +2`), not folded meetings. The cluster
pill sits in the block's outer corner; the tag pill sits inline with the other tags.

## Sync failure

![A "Failed to sync" banner in the meeting detail panel, with a Retry sync button and a details toggle](../assets/sync-error-detail-panel.png)

Google Calendar and/or Zoom sync failed for that meeting. The icon is two curved arrows forming a
broken ring around an exclamation mark, red — other pages in this guide call it a "⚠ badge," which
is this icon, **not** the amber conflict triangle above; the two can appear on the same meeting at
once, in opposite corners. See [Retry a Failed Sync](../how-to/retry-a-failed-sync.md) for what to
do about it.

The small circular button next to "Retry sync" (screenshot above) expands or collapses a detailed
breakdown of which service — Google Calendar, Zoom, or both — failed and why.

![A sync-error icon on a calendar block](../assets/sync-error-badge.png)

## Suspended meeting

![A pause icon in a "Suspend this meeting?" confirmation dialog](../assets/icon-legend-suspend-modal-icon.png)

The pause icon marks a meeting that's suspended, or scheduled to become suspended on a future
date. Suspending pauses and hides a meeting from the live calendar without deleting it — nothing is
lost. Reactivate it either from the meeting's own kebab menu (**Reactivate**, or **Cancel scheduled
suspension** if it hasn't started yet) or from Admin → Diagnostics. See
[Suspend and Resume a Meeting](../how-to/suspend-and-resume-a-meeting.md).

![A "Not sure? Suspend instead" nudge in the Delete confirmation dialog](../assets/icon-legend-delete-modal-suspend-nudge.png)

Because deleting is permanent and suspending isn't, the Delete confirmation dialog nudges you
toward suspending instead — for both recurring and non-recurring meetings — unless the meeting is
already suspended or has a suspension scheduled, in which case the nudge is hidden (a second
suspension isn't allowed, so offering it there would just lead to an error).

## Zoom room mismatch

![A video-camera badge with a Zoom room name on a calendar block](../assets/icon-legend-zoom-mismatch-badge.png)

A Hybrid meeting's Zoom room field doesn't match the default Zoom room normally paired with its
physical room. This isn't an error — some meetings legitimately use a different Zoom room — but the
badge calls it out so it's not mistaken for a data-entry mistake at a glance.

## Admin Diagnostics panel icons

Three of Admin → Diagnostics' five summary cards reuse the icons above as headers — Sync Issues,
Conflicts, and Suspended. (The other two, System Status and Meeting Counts, use unrelated icons.)
Each card lists every meeting currently in that state, with a link to edit or resolve it. Sync
Issues covers both outright failures and meetings still waiting on a Zoom host to become available.

![The Sync Issues, Conflicts, and Suspended panel headers on the Admin Diagnostics page, each showing a non-zero count](../assets/icon-legend-diagnostics-panel-icons.png)
