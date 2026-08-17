# Check Backups and Run One

Go to **Admin → Backups**. Super-Admin-only.

This tab shows the health of the platform's automatic database backups, lets you trigger an
extra one, and gives a break-glass runbook for restoring in an emergency. For how the backup
system itself is built, see [Backups and Recovery](../../02-handoff/backups-and-recovery.md) —
this page is just about using the tab.

## Reading the Backup Health card

The top card shows four numbers at a glance: when the last backup succeeded, when the next one
is scheduled, how many snapshots are retained, and when a restore was last verified. Below that,
a **Replicas** panel shows whether all three storage copies have the latest snapshot, plus how
much free-tier storage is left.

A banner appears above these numbers when something needs attention:

- **"No restore has ever been verified"** — backups are running, but nobody has proven one can
  actually be restored yet. Not an emergency, just a reminder that the quarterly drill is
  pending.
- **"Last verified restore was N months ago — run the quarterly drill"** — the same reminder,
  but for a drill that's gone stale (roughly 100 days since the last one).

Either banner links to the restore drill runbook section in Backups and Recovery. Who actually
runs the drill — an H4I Maintenance Lead or ICR key holder — is covered there; this tab only
shows whether it's due.

If the "Last successful backup" number turns orange or red, a scheduled backup is overdue or
failed — see [Troubleshooting](../reference/troubleshooting.md#backups-tab).

## Running a backup on demand

Click **Back Up Now** at the top of the tab. A toast confirms the run was dispatched, and it
appears under **Notable Activity** within about a minute. The button is disabled while a run is
already in progress — the platform only allows one backup at a time.

## Downloading a snapshot

In the **Snapshots** table, click the download icon on any row. This downloads the raw encrypted
backup file — it is **not readable on its own**. Opening it requires a private decryption key
held only by the H4I Maintenance Lead or ICR's President (see the two-key rule in
[Backups and Recovery](../../02-handoff/backups-and-recovery.md#the-two-key-rule)). In practice,
only download a snapshot if one of those key holders has asked you to, as part of a restore.

Use the **Verified** column (hover the ⓘ next to the header for the legend) to see whether a
snapshot has actually been proven restorable — prefer a Verified one if you're ever asked to hand
one over. The **Replicas** column shows how many of the three storage copies hold that snapshot;
hover it for the per-copy breakdown. Filter chips above the table (All / Daily / Monthly /
Permanent / Unverified) narrow the list.

## Restoring a backup

Restoring is a deliberate, hands-on-keyboard operation performed by a key holder — never a
button in this app. Selecting a snapshot row fills in a copy-pasteable command in the **Restore
Runbook** card below, but running it requires an `age` private key and direct database access
that only the Maintenance Lead or ICR President have.

If you suspect data loss or corruption, don't try to fix it yourself — contact the Maintenance
Lead (see [Support Process](../../02-handoff/support-process.md)). Full restore steps live in
[Backups and Recovery](../../02-handoff/backups-and-recovery.md#the-break-glass-restore-runbook).

## The quarterly restore drill

Separately from the button above, a key holder periodically test-restores a real backup to prove
the pipeline actually works, not just that files exist. This tab shows when that last happened
(see the health card banners above); it doesn't run the drill for you. Who's responsible for it
is covered in [Backups and Recovery](../../02-handoff/backups-and-recovery.md#verification-restore-drills).
