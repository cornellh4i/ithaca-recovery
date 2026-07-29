# API Reference

All endpoints are Next.js Route Handlers under `frontend/app/api/`. Requests and responses use JSON unless noted otherwise.

**Authentication:** NextAuth with Google OAuth (`frontend/app/api/auth/authConfig.ts`). Sign-in is invite-only — the `signIn` callback rejects any email not already present in the `Admin` table. The session JWT carries a `role` (`SUPER_ADMIN | ADMIN | USER`), refreshed from the DB on every request so role changes/removal take effect without waiting for the JWT to expire. Route guards call `requireRole(minRole)` (`frontend/services/auth.ts`), which returns a `401` if unauthenticated or `403` if the session's role is below `minRole`; each route below notes its required role. `GET /api/retrieve/meeting*` routes have no guard — meeting reads are public. An automated test (`frontend/test/unit/routeGuards.test.ts`) statically verifies every route either has this guard or is explicitly allowlisted as public.

---

## Meetings

### `POST /api/write/meeting`
**Requires:** `ADMIN`. Request body is validated against a `zod` schema (`frontend/util/meetingValidation.ts`) before anything else — malformed shapes/types get a `400` with the specific validation issues, never reach Prisma or the calendar services. Create a new meeting. If `recurrencePattern` is present, a `RecurrencePattern` record is created alongside it, with `endDate` calculated from `numberOfOccurrences` when not explicitly provided (weekly and monthly patterns both supported). The response is sent as soon as this DB write succeeds — Google Calendar/Zoom sync runs afterward in the background (see Sync behavior below), so the response body's `syncStatus`/`zoomSyncStatus` won't yet reflect that sync's outcome.

Zoom is needed when `modeType` is `"Hybrid"` or `"Remote"` (not `"In Person"`). Zoom resolves/creates *before* the Google Calendar publish below, and if it can't get a working Zoom meeting this run (host pool exhausted, or the Zoom API call failed), **the Google Calendar publish is skipped entirely and `syncStatus` is set to `"pending"`** rather than publishing the meeting with no Zoom link. A later `POST /api/update/meeting/sync` retry (below) picks this back up once a host becomes available, publishing both at once. See the Zoom section below for host selection.

Once Zoom has resolved (or wasn't needed), sync publishes to Google Calendar per category in `calType` (skipped if `status: "Suspended"`), writing `googleCalendarEventIds` and `syncStatus` back onto the meeting — the event body includes the Zoom join link when one exists. `zoomHost`, `zid`, `zoomLink`, `zoomCalendarEventId`, and `zoomSyncStatus` are also written back onto the meeting; only Hybrid meetings additionally get a dedicated Zoom-Room-calendar event (keyed by `zoomRoom`) with the join link as its location, for Zoom Room hardware to detect. Skipped (persisted verbatim, marked synced) if `zid`/`zoomLink` already came in on the payload.

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
**Error:** `400 Bad Request` — request body fails schema validation (issues listed in the response)

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
**Requires:** `ADMIN`. Request body validated the same way as `POST /api/write/meeting` (same `zod` schema) before anything else. Update an existing meeting, identified by `mid`. Upserts or deletes the associated `RecurrencePattern` depending on whether `recurrencePattern` is present in the body. The response is sent as soon as this DB write succeeds; Google Calendar/Zoom sync runs afterward in the background (see [integration-guides.md](integration-guides.md#4-google-calendar-api)) — creates/updates events for categories now in `calType`, deletes events for categories removed from it.

Zoom sync runs the same mode-gated, resolve-before-publish way as `POST /api/write/meeting` above (same `"pending"` deferral if Zoom can't resolve). If `zoomRoom` changed, or the Meeting Form's Zoom Host dropdown was used to explicitly reassign the host to a different pool account, the old Zoom meeting and (Hybrid-only) calendar event are deleted and a fresh Zoom meeting/calendar event are created under the new room/host — Zoom has no in-place host-transfer for this app's stable-meeting model. Otherwise the existing Zoom meeting is updated in place, after re-checking its host is still free for the (possibly moved) time.

**Request body:** `IMeeting` (must include `mid`)

**Response:** `200 OK` — updated `IMeeting`
**Error:** `404 Not Found` if `mid` doesn't exist
**Error:** `400 Bad Request` — request body fails schema validation (issues listed in the response)

---

### `POST /api/update/meeting/sync`
**Requires:** `ADMIN`. Retry Google Calendar and Zoom sync for a single meeting (used by the ⚠ sync-status badge's retry action in the UI). Zoom retries first; `zoomSyncStatus` is only touched if the meeting needs Zoom (`modeType` is `Hybrid`/`Remote`). If Zoom still can't resolve a host, the Google Calendar reconcile is skipped again and `syncStatus` stays `"pending"` — a retry that *does* newly succeed at getting a host performs both the Zoom update/create and the (now-unblocked) calendar reconcile in this same call.

**Request body:**
```json
{ "mid": "string" }
```

**Response:** `200 OK`
```json
{ "syncStatus": "synced | error | pending", "zoomSyncStatus": "synced | error | null" }
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
**Requires:** `SUPER_ADMIN`. Returns the stored settings, or a hardcoded default set (`frontend/util/leaseDefaults.ts`) if none have been saved yet.

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

ICR's 5 licensed Zoom accounts (`ZOOM_HOSTS` env var, comma-separated) are a shared pool, not tied to any one room — each hosts only one meeting at a time. A meeting's host is auto-assigned at creation (first pool host with no schedule conflict) unless the Meeting Form's Zoom Host dropdown is used to manually pick one, for troubleshooting/admin exceptions. Only Hybrid meetings additionally have a `zoomRoom` (a Zoom Room device physically installed in that room) with its own Google Calendar the join link publishes to; Remote (online-only) meetings use a pool host but no physical Zoom Room device. See [technical-decisions.md](../02-handoff/technical-decisions.md#zoom-integration) for why, and [integration-guides.md](integration-guides.md#5-zoom-api) for setup.

### `GET /api/retrieve/zoom-hosts`
**Requires:** `ADMIN`. List the Zoom host pool, in `ZOOM_HOSTS` order — backs the Meeting Form's Zoom Host dropdown and its friendly "Zoom Host N" labels (derived from list position, not stored).

**Response:** `200 OK`
```json
{ "hosts": ["host1@icr.example", "host2@icr.example"] }
```

---

### `POST /api/retrieve/zoom-host-availability`
**Requires:** `ADMIN`. Backs the Meeting Form's "Check host availability" action — checks every pool host (not just the first free one) against a candidate meeting's schedule. Body accepts the same shape the create/update routes take; only `mid` (optional, excludes that meeting from its own conflict check), `startDateTime`, `endDateTime`, `isRecurring`, and `recurrencePattern` are read.

**Request body:**
```json
{
  "mid": "string (optional)",
  "startDateTime": "ISO 8601",
  "endDateTime": "ISO 8601",
  "isRecurring": false,
  "recurrencePattern": null
}
```

**Response:** `200 OK`
```json
{ "hosts": [{ "host": "host1@icr.example", "available": true }] }
```
**Error:** `400 Bad Request` — request body fails schema validation

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
  zoomRoom?: string | null;        // Hybrid only -- a Zoom Room device label, e.g. "Serenity Room - Zoom"
  zoomHost?: string | null;        // assigned pool account email; null/omitted = auto-assign at creation
  zoomLink?: string | null;
  zid?: string | null;             // Zoom meeting ID
  zoomCalendarEventId?: string | null;  // event ID on that room's own Google Calendar (Hybrid only)
  zoomSyncStatus?: string | null;  // "synced" | "error", independent of syncStatus
  calType: string[];               // subset of ["AA", "Al-Anon", "Other"]
  modeType: string;                // "Remote" | "In Person" | "Hybrid"
  room: string;
  status?: string;                 // "Active" | "Suspended", default "Active"
  isRecurring: boolean;
  recurrencePattern?: IRecurrencePattern | null;
  googleCalendarEventId?: string | null;         // legacy single-calendar ID
  googleCalendarEventIds?: Record<string, string> | null; // per-category, keyed by calType value
  syncStatus?: string | null;      // "synced" | "error" | "pending" (deferred, waiting on Zoom)
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
