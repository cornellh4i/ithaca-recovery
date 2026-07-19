# API Reference

All endpoints are Next.js Route Handlers under `frontend/app/api/`. Requests and responses use JSON unless noted otherwise.

**Authentication:** NextAuth with Google OAuth (`frontend/app/api/auth/authConfig.ts`). Sign-in is invite-only — the `signIn` callback rejects any email not already present in the `Admin` table. The session JWT carries a `role` (`SUPER_ADMIN | ADMIN | USER`), refreshed from the DB on every request so role changes/removal take effect without waiting for the JWT to expire. Route guards call `requireRole(minRole)` (`frontend/services/auth.ts`), which returns a `401` if unauthenticated or `403` if the session's role is below `minRole`; each route below notes its required role. `GET /api/retrieve/meeting*` routes have no guard — meeting reads are public.

---

## Meetings

### `POST /api/write/meeting`
**Requires:** `ADMIN`. Create a new meeting. If `recurrencePattern` is present, a `RecurrencePattern` record is created alongside it, with `endDate` calculated from `numberOfOccurrences` when not explicitly provided (weekly and monthly patterns both supported). Non-blocking: publishes to Google Calendar per category in `calType` (skipped if `status: "Suspended"`), writing `googleCalendarEventIds` and `syncStatus` back onto the meeting.

If `zoomRoom` is set, also non-blocking and independent of the above: creates a Zoom meeting under that room's dedicated host account and publishes the join link to that room's own Google Calendar, writing `zid`, `zoomLink`, `zoomCalendarEventId`, and `zoomSyncStatus` back onto the meeting. Skipped (persisted verbatim, marked synced) if `zid`/`zoomLink` already came in on the payload.

**Request body:** `IMeeting`
```json
{
  "title": "string",
  "mid": "string (uuid)",
  "description": "string",
  "creator": "admin@example.com",
  "group": "string",
  "startDateTime": "ISO 8601",
  "endDateTime": "ISO 8601",
  "email": "contact@example.com",
  "zoomRoom": "string | null",
  "zoomLink": "string | null",
  "zid": "string | null",
  "calType": ["AA" ],
  "modeType": "Remote | In Person | Hybrid",
  "room": "string",
  "status": "Active | Suspended",
  "isRecurring": false,
  "recurrencePattern": null
}
```

**Response:** `201 Created` — created `IMeeting` object (with `recurrencePattern` if provided)

---

### `GET /api/retrieve/meeting`
Retrieve all non-deleted meetings.

**Response:** `200 OK` — `IMeeting[]`

---

### `GET /api/retrieve/meeting/[id]`
Retrieve a single non-deleted meeting with its recurrence pattern, by `mid` in the URL path.

**Response:** `200 OK` — `IMeeting` with `recurrencePattern`
**Error:** `404 Not Found`

---

### `GET /api/retrieve/meeting/day`
Retrieve all meetings for a specific day, including expanded recurring instances (via `frontend/util/meetingOccurrences.ts`).

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 or `YYYY-MM-DD` | Target day |

**Response:** `200 OK` — `IMeeting[]` with times adjusted to the requested day

---

### `GET /api/retrieve/meeting/week`
Retrieve all meetings for the 7-day week beginning on the Sunday of the provided date, including expanded recurring instances.

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 | Any date within the target week |

**Response:** `200 OK` — `IMeeting[]`

---

### `GET /api/retrieve/meeting/month`
Retrieve all meetings for the calendar month of the provided date.

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 | Any date within the target month |

**Response:** `200 OK` — `IMeeting[]`

---

### `PUT /api/update/meeting`
**Requires:** `ADMIN`. Update an existing meeting, identified by `mid`. Upserts or deletes the associated `RecurrencePattern` depending on whether `recurrencePattern` is present in the body. Re-syncs Google Calendar per category: creates/updates events for categories now in `calType`, deletes events for categories removed from it.

Zoom sync is independent and follows the same non-blocking pattern. If `zoomRoom` changed, the old room's Zoom meeting and calendar event are deleted and a fresh Zoom meeting/calendar event are created under the new room (a Zoom meeting can't move host); if unchanged, it's updated in place.

**Request body:** `IMeeting` (must include `mid`)

**Response:** `200 OK` — updated `IMeeting`
**Error:** `404 Not Found` if `mid` doesn't exist

---

### `POST /api/update/meeting/sync`
**Requires:** `ADMIN`. Retry Google Calendar and Zoom sync for a single meeting (used by the ⚠ sync-status badge's retry action in the UI). The two retry independently — `zoomSyncStatus` is only touched if the meeting has a `zoomRoom` set.

**Request body:**
```json
{ "mid": "string" }
```

**Response:** `200 OK`
```json
{ "syncStatus": "synced | error", "zoomSyncStatus": "synced | error | null" }
```

---

### `DELETE /api/delete/meeting`
**Requires:** `ADMIN`. Delete a meeting. Non-recurring meetings and the `all` option soft-delete (`deletedAt` set); `this`/`thisAndFollowing` modify the `RecurrencePattern` instead.

**Request body:**
```json
{
  "mid": "string",
  "deleteOption": "this | thisAndFollowing | all",
  "occurrenceDate": "ISO 8601 (required for this / thisAndFollowing)"
}
```

| `deleteOption` | Behavior |
|---|---|
| `all` | Soft-deletes the meeting; deletes the GCal event(s) on every calendar it's published to, plus the Zoom meeting and its room-calendar event if `zoomRoom` is set |
| `this` | Adds `occurrenceDate` to the pattern's `excludedDates`; adds an EXDATE to the GCal event |
| `thisAndFollowing` | Trims the pattern's `endDate` to just before `occurrenceDate`; trims the GCal event's RRULE `UNTIL` |

`this`/`thisAndFollowing` never touch Zoom — a recurring meeting's Zoom meeting is one stable meeting shared by every occurrence in the series, so only a whole-series (`all`) delete removes it.

**Response:** `200 OK` — `{ "message": "Meeting deleted successfully" }`

---

## Admins

### `POST /api/write/admin`
**Requires:** `SUPER_ADMIN`. Invite an admin by email. `name` is created empty and filled in from the Google profile on that person's first sign-in.

**Request body:**
```json
{ "email": "string", "role": "SUPER_ADMIN | ADMIN | USER (optional, defaults to ADMIN)" }
```

**Response:** `200 OK` — created `IAdmin` object

---

### `GET /api/retrieve/admin`
**Requires:** `SUPER_ADMIN`. Retrieve a single admin by email.

| Param | Type | Description |
|---|---|---|
| `email` | string | Admin email address |

**Response:** `200 OK` — `IAdmin`
**Error:** `404 Not Found`

---

### `GET /api/retrieve/admins`
**Requires:** `SUPER_ADMIN`. Retrieve all admins (backs the Users tab on `/admin`).

**Response:** `200 OK` — `IAdmin[]`

---

### `PUT /api/update/admin`
**Requires:** `SUPER_ADMIN`. Promote or demote an admin's role. Rejects demoting the last remaining `SUPER_ADMIN` (including self-demotion).

**Request body:**
```json
{ "email": "string", "role": "SUPER_ADMIN | ADMIN | USER" }
```

**Response:** `200 OK` — updated `IAdmin`
**Error:** `400 Bad Request` if it would leave zero Super Admins, `404 Not Found`

---

### `DELETE /api/delete/admin`
**Requires:** `SUPER_ADMIN`. Remove an admin by email. Same last-remaining-Super-Admin protection as above.

**Request body:**
```json
{ "email": "string" }
```

**Response:** `200 OK` — deleted `IAdmin` object
**Error:** `400 Bad Request` if it would leave zero Super Admins, `404 Not Found`

---

## Diagnostics

### `GET /api/admin/diagnostics`
**Requires:** `ADMIN`. Backs the Diagnostics tab on `/admin`.

**Response:** `200 OK`
```json
{
  "database": { "ok": true, "latencyMs": 12 },
  "googleCalendar": { "categories": { "AA": true, "Al-Anon": true, "Other": false } },
  "zoom": {
    "reachable": true,
    "rooms": {
      "Serenity Room - Zoom": { "calendarOk": true, "hostOk": true, "hostLicensed": true },
      "Children's Room @ 518 - Zoom": { "calendarOk": false, "hostOk": true, "hostLicensed": false }
    }
  },
  "session": { "email": "string", "role": "string" },
  "meetingCounts": {
    "total": 0, "active": 0, "suspended": 0,
    "byCategory": { "AA": 0, "Al-Anon": 0, "Other": 0 },
    "recurring": 0, "oneTime": 0,
    "gcalSyncErrors": 0, "zoomSyncErrors": 0
  },
  "conflicts": [],
  "suspendedMeetings": []
}
```
`conflicts` is currently always `[]` — the overlap-detection endpoint it needs hasn't been built yet.

---

## Export

### `GET /api/export/lease`
**Requires:** `SUPER_ADMIN`. Generates the PandaDocs bulk-send lease CSV for all `status: "Active"` meetings, using the stored `LeaseSettings` (or defaults if none saved).

**Response:** `200 OK` — `text/csv`, filename `{leaseStartYear} - {leaseEndYear} Bulk Send Lease.csv`

---

### `GET /api/export/meetings`
**Requires:** `SUPER_ADMIN`. Generates a full-data XLSX backup of every non-deleted meeting (recurring and one-time), including room/mode/contact/schedule fields and per-category Google Calendar event IDs.

**Response:** `200 OK` — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, filename `ithaca-recovery-meetings-{YYYY-MM-DD}.xlsx`

---

## Lease Settings

Singleton config for the PandaDocs lease export — lease period, per-room rates, rental agent contact, and email template — editable via the Export tab's settings modal.

### `GET /api/retrieve/lease-settings`
**Requires:** `SUPER_ADMIN`. Returns the stored settings, or a hardcoded default set (`frontend/services/leaseDefaults.ts`) if none have been saved yet.

**Response:** `200 OK` — `ILeaseSettings`

---

### `PUT /api/update/lease-settings`
**Requires:** `SUPER_ADMIN`. Upserts the singleton settings document.

**Request body:** `ILeaseSettings`

**Response:** `200 OK` — saved `ILeaseSettings`
**Error:** `400 Bad Request` if `leaseStartDate >= leaseEndDate`

---

## Authentication

### `GET /api/auth/status`
Check whether the current request has a session.

**Response:** `200 OK`
```json
{ "isAuthenticated": true }
```

### `GET|POST /api/auth/[...nextauth]`
NextAuth's own sign-in/sign-out/callback routes. Not called directly by app code.

---

## Zoom

Not a set of proxy routes — the old `/api/zoom/*` endpoints were deleted (zero callers, superseded by this). Zoom is a server-only service (`frontend/services/zoom.ts`) called directly from the meeting routes above (`write`, `update`, `delete`, `update/meeting/sync`), gated by the same `requireRole(ADMIN)` check as those routes — there's no separate unauthenticated Zoom surface.

Each of the 5 Zoom-enabled rooms has its own licensed Zoom host account (so up to 5 rooms can host simultaneously without conflicting) and its own Google Calendar (separate from the 3 category calendars) that the join link gets published to. See [technical-decisions.md](handoff/technical-decisions.md#zoom-integration) for why, and [integration-guides.md](handoff/integration-guides.md#5-zoom-api) for setup.

---

## Data Types Reference

```typescript
interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string;                 // admin email
  group: string;
  startDateTime: Date;
  endDateTime: Date;
  email: string;
  zoomRoom?: string | null;        // a Zoom-room label, e.g. "Serenity Room - Zoom"
  zoomLink?: string | null;
  zid?: string | null;             // Zoom meeting ID
  zoomCalendarEventId?: string | null;  // event ID on that room's own Google Calendar
  zoomSyncStatus?: string | null;  // "synced" | "error", independent of syncStatus
  calType: string[];               // subset of ["AA", "Al-Anon", "Other"]
  modeType: string;                // "Remote" | "In Person" | "Hybrid"
  room: string;
  status?: string;                 // "Active" | "Suspended", default "Active"
  isRecurring: boolean;
  recurrencePattern?: IRecurrencePattern | null;
  googleCalendarEventId?: string | null;         // legacy single-calendar ID
  googleCalendarEventIds?: Record<string, string> | null; // per-category, keyed by calType value
  syncStatus?: string | null;      // "synced" | "error"
  deletedAt?: Date | null;         // soft-delete marker
  updatedAt?: Date | null;
}

interface IRecurrencePattern {
  mid?: string;
  type: string;                    // "weekly" | "monthly"
  startDate: Date;
  endDate?: Date | null;
  numberOfOccurrences?: number | null;
  daysOfWeek?: string[] | null;    // e.g. ["Monday", "Wednesday"]
  firstDayOfWeek: string;
  interval: number;                // 1 = weekly, 2 = biweekly, etc.
  weekOfMonth?: number | null;     // 1-4 for Nth weekday, -1 for last; paired with daysOfWeek
  dayOfMonth?: number | null;      // 1-31 for a fixed day of month
  excludedDates?: Date[] | null;
}

interface IAdmin {
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  googleId?: string | null;
  refreshToken?: string | null;
  accessToken?: string | null;
  tokenExpiresAt?: number | null;
}

interface IRoomRate {
  room: string;
  rate: number;
  unit: "hr" | "month";
}

interface ILeaseSettings {
  leaseStartDate: Date;
  leaseEndDate: Date;
  rooms: IRoomRate[];
  agentFirstName: string;
  agentLastName: string;
  agentTitle: string;
  agentEmail: string;
  agentPhone: string;
  agentStreetAddress: string;
  agentCity: string;
  agentState: string;
  agentZip: string;
  emailTemplate: string;           // supports a {group} placeholder
}
```
