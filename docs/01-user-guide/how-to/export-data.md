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

## Generate a signage URL

See [Use Digital Signage](use-digital-signage.md).
