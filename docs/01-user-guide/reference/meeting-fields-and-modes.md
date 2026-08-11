# Meeting Fields and Modes

Every field on the meeting form, and what each mode requires.

## Modes

| Mode | Physical room | Zoom room | Zoom host | Notes |
|---|---|---|---|---|
| **In Person** | ✅ Required | — Not used | — Not used | No Zoom meeting is created. |
| **Hybrid** | ✅ Required | ✅ Required | ✅ Required | A physical room plus a Zoom room. A real Zoom meeting is created, and its join link is also published to that room's own Google Calendar (for the physical Zoom Room hardware to detect). |
| **Remote** | — Not used | — Not used | ✅ Required | Zoom only, no physical room and no Zoom Room hardware calendar — but a real Zoom meeting still needs a host, so one is still assigned. |

A Zoom-enabled meeting (Hybrid or Remote) gets a real Zoom meeting created behind the scenes,
with its host auto-assigned from the shared pool — there's no manual Zoom setup needed on your
part unless you specifically need to pick a different host (e.g. troubleshooting).

## Fields

| Field | Required | Notes |
|---|---|---|
| Meeting title | ✅ Required | The group's name, e.g. "AA Thursday Evening Group" |
| Mode | ✅ Required | See table above |
| Date | ✅ Required | |
| Time | ✅ Required | All times are Eastern Time (ET). If a meeting runs past midnight, the end date automatically advances to the next day. |
| This meeting is recurring | — Optional | See [Set Up a Recurring Meeting](../how-to/set-up-a-recurring-meeting.md) |
| Room | Hybrid / In Person only | One of the 6 physical rooms at 518 W Seneca St |
| Meeting Type | ✅ Required | AA, Al-Anon, and/or Other — check every calendar this meeting belongs to; a meeting can belong to more than one |
| Zoom Room | Hybrid only | One of 5 named Zoom rooms — picking a physical room auto-selects its matching Zoom room, but you can change it |
| Zoom Host | Hybrid / Remote only | Defaults to "Automatic assignment" (first available host from the shared pool) — pick a specific one manually only if you need to, e.g. troubleshooting |
| Email | ✅ Required | The group organizer's contact email — used for lease document generation |
| Description | — Optional | Additional notes |

## Rooms

**Physical rooms** (6, color-coded on the calendar): Serenity Room, Seeds of Hope Room, Unity
Room, Room for Improvement, Room for Acceptance, Room for Gratitude.

**Zoom rooms** (5): Serenity Room - Zoom, Seeds of Hope Room - Zoom, Unity Room - Zoom, Room for
Improvement - Zoom, Children's Room @ 518 - Zoom.
