# Export Data

Go to **Admin → Export**. Two exports are available, both Super-Admin-only.

## Export Meetings (XLSX)

Click **"Export Meetings"** to download an `.xlsx` file with every meeting (recurring and
one-time) — room, mode, contact, schedule, and Google Calendar/Zoom sync IDs. Useful as a full
data backup or for auditing. Which optional columns are included can be configured via the
export's own settings (the **Configure** button on the card).

## Export PandaDocs Lease (CSV)

ICR uses annual lease agreements for each group renting space (lease year: July 1 – June 30 of
the following year by default). This export generates a CSV for PandaDoc's Bulk Send feature.

> [!IMPORTANT]
> The export covers every meeting that hasn't been deleted — **including suspended ones**, since a
> lease is a legal obligation that doesn't end just because a meeting is temporarily hidden from
> the calendar.

1. Click **"Export Lease CSV."**
2. A file named `[year] - [year+1] Bulk Send Lease.csv` downloads.
3. Log into [PandaDoc](https://www.pandadoc.com).
4. Go to **Bulk Send** → upload the CSV → select the ICR lease template → send.

### Configuring lease settings

Click **Configure** on the lease card to set:

- Lease period (start/end date)
- Per-room rate and unit (`/hr` or `/month`)
- Rental agent contact (name, title, email, phone, address)
- The email message template (supports a `{group}` placeholder for the group's name)

Until someone saves settings here, the export uses ICR's default rates (Serenity Room $15/hr; all
other rooms $10/hr; Zoom-only $10/month flat) and a default rental-agent contact. Settings persist
once saved — no code change needed to update rates going forward.

### How the rate is calculated

Each meeting's "Rent Charge" in the CSV depends on its room's configured rate/unit and how the
meeting itself is set up:

- **A `/hr`-rate room:** `4 × the meeting's own hours × the hourly rate`. E.g. a 1-hour meeting in
  a $15/hr room charges $60/month. The `4` is a fixed multiplier, not recalculated per month,
  so the charge stays the same $60 every month.
- **A `/month`-rate room:** just that flat monthly rate, regardless of the meeting's actual
  duration.
- **Remote meetings (no physical room):** billed at the flat rate configured for the "Zoom Only"
  entry in the rooms list, regardless of duration — same as a `/month` room, just always applied
  to Remote meetings specifically.

"The meeting's own hours" means that one meeting's start-to-end duration, not a sum across its
whole recurrence — a weekly 1-hour meeting is still just "1 hour" for this calculation, not "1
hour × however many weeks are in the lease."

## Recurring-series edge cases

Editing "this and following" or "this" occurrence of a recurring meeting can split one series
into multiple database rows that share the same lease/rental history. Both exports handle this,
but differently:

- **Lease CSV:** a split or detached row never gets its own line. All rows descended from the
  same original series are combined into **one billing row**, using whichever row's own schedule
  starts latest as the representative for rate, room, and time columns — that's the series'
  current shape. A cancelled single occurrence (delete "this") does **not** reduce the rent
  charge — the `4×` monthly multiplier is a fixed flat rate per "the meeting's own hours" above,
  not a per-occurrence count, so removing one date from a recurring series doesn't lower what's
  billed.
- **Meetings XLSX:** every row stays a separate row, one per distinct schedule, so a split series
  shows up as multiple rows. Two optional columns make the relationship legible: **Series End**
  (the row's own recurrence end date, blank if open-ended or one-time) and **Split From** (the
  originating series' meeting ID, blank if the row isn't part of a split).

> [!NOTE]
> The suspended-meetings behavior above still applies per lineage: if any row in a split lineage
> is suspended rather than deleted, it's still billed in the Lease CSV.
