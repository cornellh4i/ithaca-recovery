# Export Data

Go to **Admin → Export**. Two exports are available, both Super-Admin-only.

## Export Meetings (full XLSX backup)

Click **"Export Meetings"** to download an `.xlsx` file with every meeting (recurring and
one-time) — room, mode, contact, schedule, and Google Calendar/Zoom sync IDs. Useful as a full
data backup or for auditing. Which optional columns are included can be configured via the
export's own settings (⋮ on the card → configure fields).

## Export Lease CSV (PandaDoc bulk send)

ICR uses annual lease agreements for each group renting space (lease year: July 1 – June 30 of
the following year by default). This export generates a CSV for PandaDoc's Bulk Send feature,
covering every meeting that hasn't been deleted — including suspended ones, since a lease is a
legal obligation that doesn't end just because a meeting is temporarily hidden from the calendar.

1. Click **"Export Lease CSV."**
2. A file named `[year] - [year+1] Bulk Send Lease.csv` downloads.
3. Log into [PandaDoc](https://www.pandadoc.com).
4. Go to **Bulk Send** → upload the CSV → select the ICR lease template → send.

### Configuring lease settings

Click the **⋮** on the Export Lease CSV card → **"Configure export…"** to set:

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
  a $15/hr room charges $60/month. The `4` is a flat, deliberately round weeks-per-month — it's
  not recalculated per month, so the charge stays the same $60 every month regardless of how many
  times that specific weekday actually falls in a given month.
- **A `/month`-rate room:** just that flat monthly rate, regardless of the meeting's actual
  duration.
- **Remote meetings (no physical room):** billed at the flat rate configured for the "Zoom Only"
  entry in the rooms list, regardless of duration — same as a `/month` room, just always applied
  to Remote meetings specifically.

"The meeting's own hours" means that one meeting's start-to-end duration, not a sum across its
whole recurrence — a weekly 1-hour meeting is still just "1 hour" for this calculation, not "1
hour × however many weeks are in the lease."

## Generate a signage URL

See [Use Digital Signage](use-digital-signage.md).
