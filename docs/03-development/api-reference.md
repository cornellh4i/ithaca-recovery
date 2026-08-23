# API Reference

All endpoints are Next.js Route Handlers under `frontend/app/api/`. Requests and responses use JSON unless noted otherwise.

**Authentication:** NextAuth with Google OAuth (`frontend/app/api/auth/authConfig.ts`). Sign-in is invite-only — the `signIn` callback rejects any email not already present in the `Admin` table. The session JWT carries a `role` (`SUPER_ADMIN | ADMIN | USER`), refreshed from the DB on every request so role changes/removal take effect without waiting for the JWT to expire. Route guards call `requireRole(minRole)` (`frontend/services/auth.ts`), which returns a `401` if unauthenticated or `403` if the session's role is below `minRole`; each route below notes its required role. `GET /api/retrieve/meeting/*` routes have no `requireRole` guard — meeting reads are public, though `[id]` shapes its response by role (see below) rather than gating access outright. An automated test (`frontend/tests/unit/routeGuards.test.ts`) statically verifies every route either has this guard or is explicitly allowlisted as public.

---

## Meetings

### `POST /api/write/meeting`
**Requires:** `ADMIN`. Request body is validated against a `zod` schema (`frontend/util/meetings/meetingValidation.ts`) before anything else — malformed shapes/types get a `400` with the specific validation issues, never reach Prisma or the calendar services. The schema also enforces business rules, not just shape/types: `endDateTime` must be after `startDateTime`, `calType` must be non-empty, a `Hybrid` meeting requires both `room` and `zoomRoom`, an `In Person` meeting requires `room`, and `recurrencePattern.numberOfOccurrences` (when present) is capped at `520` (10 years of weekly occurrences) — each violation surfaces as its own `400` validation issue, same as a shape/type failure. Create a new meeting. If `recurrencePattern` is present, a `RecurrencePattern` record is created alongside it, with `endDate` calculated from `numberOfOccurrences` when not explicitly provided (weekly and monthly patterns both supported). The response is sent as soon as this DB write succeeds — Google Calendar/Zoom sync runs afterward via Next's `after()` (see Sync behavior below), so the response body's `googleSyncStatus`/`zoomSyncStatus` won't yet reflect that sync's outcome. Clients that need the real outcome poll `GET /api/retrieve/meeting/[id]` afterward (see `frontend/services/syncMeeting.ts#pollMeetingSyncStatus`).

Zoom is needed when `modeType` is `"Hybrid"` or `"Remote"` (not `"In Person"`). Zoom resolves/creates *before* the Google Calendar publish below, and if it can't get a working Zoom meeting this run (host pool exhausted, or the Zoom API call failed), **the Google Calendar publish is skipped entirely and `googleSyncStatus` is set to `"pending"`** rather than publishing the meeting with no Zoom link. A later `POST /api/update/meeting/sync` retry (below) picks this back up once a host becomes available, publishing both at once. See the Zoom section below for host selection.

Once Zoom has resolved (or wasn't needed), sync publishes to Google Calendar per category in `calType` (skipped if `status: "Suspended"`), writing `googleCalendarEventIds` and `googleSyncStatus`/`googleSyncError` back onto the meeting — the event body includes the Zoom join link when one exists. `zoomHost`, `zid`, `zoomLink`, `zoomCalendarEventId`, `zoomSyncStatus`, and `zoomSyncError` are also written back onto the meeting; only Hybrid meetings additionally get a dedicated Zoom-Room-calendar event (keyed by `zoomRoom`) with the join link as its location, for Zoom Room hardware to detect. Skipped (persisted verbatim, marked synced) if `zid`/`zoomLink` already came in on the payload.

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

The body may also carry an optional `linkedSchedule` block: a second weekly schedule of the same meeting — a different mode on other weekdays, sharing its single Zoom meeting. Both rows are created in this route's one transaction, and the family's Zoom meeting is created once and fanned out to whichever rows need it. The block's fields and rules are identical to `PUT /api/update/meeting`'s, documented in full there.

**Response:** `201 Created` — created `IMeeting` object (with `recurrencePattern` if provided, and `linkedMid` if a `linkedSchedule` was created alongside it)
**Error:** `400 Bad Request` — request body fails schema validation (issues listed in the response)

---

### `GET /api/retrieve/meeting/[id]`
Retrieve a single non-deleted meeting by `mid` in the URL path. An unauthenticated caller, or a `USER`-role session, gets the `PublicMeeting`-shaped subset (see [Technical Decisions](../02-handoff/technical-decisions.md#admin-gated-mids-pattern-for-calendar-badges)); an `ADMIN`/`SUPER_ADMIN` session gets the full row plus `recurrencePattern` and derived suspension fields (`resumesAt`/`suspendedSince`/`suspensionActive`).

An `ADMIN`/`SUPER_ADMIN` response also carries `linkedSchedules` — the meeting's *other* schedules if it runs as a linked family (see `PUT /api/update/meeting` below), each as `{ mid, modeType, room, zoomRoom, zoomHost, recurrencePattern, startDateTime, endDateTime, googleSyncStatus, zoomSyncStatus }`. Empty for the overwhelmingly common single-schedule meeting, and never present for a `USER`/unauthenticated caller.

**Response:** `200 OK` — `PublicMeeting` for unauthenticated/`USER`; `IMeeting` (plus `linkedSchedules`) for `ADMIN`/`SUPER_ADMIN`
**Error:** `404 Not Found`

---

### `GET /api/retrieve/meeting/day`
Retrieve all meetings for a specific day, including expanded recurring instances (via `frontend/util/meetings/meetingOccurrences.ts`). Public-safe fields only (`PublicMeeting`).

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 or `YYYY-MM-DD` | Target day |

**Response:** `200 OK` — `IMeeting[]` with times adjusted to the requested day

---

### `GET /api/retrieve/meeting/week`
Retrieve all meetings for the 7-day week beginning on the Sunday of the provided date, including expanded recurring instances. Public-safe fields only.

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 | Any date within the target week |

**Response:** `200 OK` — `IMeeting[]`

---

### `GET /api/retrieve/meeting/range`
Retrieve all meetings for an arbitrary date range (used by mobile's prev/current/next carousel views, which need a range that doesn't align to week boundaries). Same expansion/shape as `week`.

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 | Range start (defaults to now if omitted) |
| `endDate` | ISO 8601 | Range end (defaults to `startDate` if omitted) |

**Response:** `200 OK` — `IMeeting[]`

---

### `PUT /api/update/meeting`
**Requires:** `ADMIN`. Request body validated the same way as `POST /api/write/meeting` (same `zod` schema) before anything else. Update an existing meeting, identified by `mid`. Upserts or deletes the associated `RecurrencePattern` depending on whether `recurrencePattern` is present in the body. The response is sent as soon as this DB write succeeds; Google Calendar/Zoom sync runs afterward via `after()` (see [Integration Guides](integration-guides.md#3-google-calendar-api)) — creates/updates events for categories now in `calType`, deletes events for categories removed from it.

Zoom sync runs the same mode-gated, resolve-before-publish way as `POST /api/write/meeting` above (same `"pending"` deferral if Zoom can't resolve). If `zoomRoom` changed, the old Zoom meeting and (Hybrid-only) calendar event are deleted and a fresh Zoom meeting/calendar event are created under the new room — a Zoom meeting can't move rooms. If instead the Meeting Form's Zoom Host dropdown was used to explicitly reassign the host, the existing Zoom meeting is transferred to that host in place (`schedule_for`), preserving its ID, passcode and join link; a Zoom-side refusal falls back to the same tear-down-and-recreate, as does a host change bundled with a room change (`schedule_for` moves a host, not a room). Either recreate is refused on a `zid` another meeting shares — the host is left unchanged and the failure reported, while the room move itself still applies. Otherwise the existing Zoom meeting is updated in place, after re-checking its host is still free for the (possibly moved) time.

A recurring meeting's edit can be scoped to less than the whole series via two extra top-level body fields, parsed separately from the `IMeeting` payload itself:

| Field | Type | Description |
|---|---|---|
| `editScope` | `"this" \| "thisAndFollowing" \| "all"` | Optional; omitted or `"all"` is the whole-series behavior described above. Non-recurring meetings reject `"this"`/`"thisAndFollowing"` with `400`. |
| `occurrenceDate` | ISO 8601 | Required when `editScope` is `"this"`/`"thisAndFollowing"` (`400` otherwise); must land on a live occurrence of the pattern (not excluded, not past the series end) or the request is rejected with `400`. |

`editScope: "this"` pushes that occurrence's date onto the parent's `RecurrencePattern.excludedDates` and creates a new, detached, non-recurring `Meeting` row (its own `mid`) carrying the request body's edited field values, anchored to `occurrenceDate`. The body's `recurrencePattern` must be omitted for this scope (`400` otherwise — a single occurrence has no recurrence of its own).

`editScope: "thisAndFollowing"` trims the parent's `RecurrencePattern.endDate` to end the day before `occurrenceDate` and creates a new recurring `Meeting` + `RecurrencePattern` (its own `mid`) starting at `occurrenceDate`, using the request body's `recurrencePattern` (required for this scope — `400` otherwise) and edited field values.

Either way, the new row inherits the parent's Zoom identity (`zid`, `zoomHost`, `zoomManaged`, `zoomTopic`) rather than provisioning a new Zoom meeting — the Zoom meeting is host-owned, not room-owned, so it keeps working regardless of which room the new row publishes to. `zoomRoom` itself is **not** inherited: the new row uses the request body's own `zoomRoom` (which may name a different Zoom Room than the parent's, or omit one entirely), gets its own Google Calendar event(s) — created the same way `POST /api/write/meeting` creates a new meeting's events, including its own Zoom-Room-calendar join-link event if `zoomRoom` is set — and that requested `zoomRoom` is conflict-checked (see below) the same as `room`. Its `splitFromMid` is set to the parent's own root series mid (propagated through, not reset, if the parent itself was already a split-off row), so every row produced by repeated splits of the same original series still shares one lineage root. The parent's own Google Calendar event(s), including its own Zoom-Room-calendar event if it has one, get a full-body rewrite to match its post-write pattern — an `EXDATE` for `"this"`, an `RRULE UNTIL` trim for `"thisAndFollowing"` — the same way `deleteOption` on `DELETE /api/delete/meeting` adjusts it. For a currently suspended meeting only the parent's rewrite is skipped; the new row is created `Active` and publishes its own events.

`modeType` and `zoomHost` are whole-series properties and can't be changed by a scoped edit — unlike `zoomRoom`, a mode or host change has series-wide consequences a single split-off row can't represent. A body whose `modeType` differs from the parent's is rejected with `400` (`"mode changes apply to the whole series"`); a body with an explicit `zoomHost` (case-insensitive, non-empty) different from the parent's stored host is rejected with `400` (`"host changes apply to the whole series"`) — a blank/omitted `zoomHost`, or resubmitting the parent's own already-assigned host, is not a change.

For `editScope: "thisAndFollowing"`, the new tail series' `RecurrencePattern.startDate` anchors to `occurrenceDate`, while the row's own `startDateTime` is whatever the body submits — those must name the same Eastern-Time calendar date, or a `400` (`"date changes apply to a single event or the whole series"`) is returned; a client that re-anchors the date field to `occurrenceDate` (matching calendar date, any time-of-day) is unaffected. `editScope: "this"` is exempt — editing the single occurrence's own date is expected there.

#### Linked schedules (`linkedSchedule`)

An optional `linkedSchedule` block adds a **second weekly schedule** to the meeting: the same meeting on other weekdays in a different mode, served by the family's one Zoom meeting. Parsed by its own schema (`linkedScheduleBlockSchema`), so its keys never reach the meeting's own update data.

| Field | Type | Description |
|---|---|---|
| `mid` | string | Client-generated, like a new meeting's — both rows are known before the write |
| `modeType` | `"Hybrid" \| "In Person" \| "Remote"` | Must differ from every existing family member's |
| `room` / `zoomRoom` | string \| null | The new schedule's own; same Hybrid/In-Person requirements as a meeting's |
| `recurrencePattern` | `RecurrencePattern` | Only `daysOfWeek` is read (and `type` must be `"weekly"`) |

Everything else about the schedule is **derived from the anchor row and never read from the block**: title, description, email, group, `calType`, time of day, duration, interval, and where the series ends — a family whose rows disagree on any of those has no single-series representation on Zoom, and would silently stop reaching it. The new row's `linkedToMid` points at the anchor's `mid` (a different lineage from `splitFromMid` — see [Meeting Lifecycle Flows](meeting-lifecycle-flows.md)); a Zoom-bearing one inherits the family's `zid`/link/passcode/host/`zoomManaged`/`zoomTopic` and consumes no additional host capacity, while an In-Person one inherits none of it. If the anchor has no Zoom meeting to inherit (an In-Person anchor gaining a Hybrid/Remote schedule), the new row provisions the family's Zoom meeting itself.

`400`s: the anchor isn't a weekly recurring meeting; the family already runs two schedules; `modeType` duplicates an existing member's; `daysOfWeek` overlaps a day the family already meets on, or is empty; the resulting family can't be served by one Zoom meeting; `linkedSchedule` combined with a non-`"all"` `editScope`; or the same payload also edits the anchor's own fields (the two are separate requests — save the meeting's changes first). The same block on `POST /api/write/meeting` creates both rows in that route's one transaction, with the family's single Zoom meeting created once and fanned out.

**Request body:** `IMeeting` (must include `mid`), plus `editScope`/`occurrenceDate` above, plus an optional `linkedSchedule` block

**Response:** `200 OK` — updated `IMeeting`; when `editScope` was `"this"`/`"thisAndFollowing"`, also includes `newMid` (the new split-off row's `mid`); when a `linkedSchedule` was created, `linkedMid` (its `mid`) — and the meeting itself is returned unchanged, since that request only writes the new schedule
**Error:** `404 Not Found` if `mid` doesn't exist
**Error:** `400 Bad Request` — request body fails schema validation, or one of the `editScope` rules above (issues listed in the response)
**Error:** `409 Conflict` — the new row's `room`/`zoomRoom`/`zoomHost` collides with another meeting; body includes `conflicts`. Resubmit with `confirmOverride: true` to save anyway.
**Error:** `409 Conflict` — the edit's room/Zoom-room/Zoom-host would collide with another meeting; body includes `conflicts`. Resubmit with `confirmOverride: true` to save anyway. For a scoped edit, this checks the new split-off row's own occurrence(s), not the parent's.

---

### `POST /api/update/meeting/sync`
**Requires:** `ADMIN`. Retry Google Calendar and Zoom sync for a single meeting (used by the ⚠ sync-status badge's retry action in the UI). Unlike create/update, this route runs **synchronously** — no `after()` deferral — since a user clicking "Retry sync" expects an immediate result. Zoom retries first; `zoomSyncStatus` is only touched if the meeting needs Zoom (`modeType` is `Hybrid`/`Remote`). If Zoom still can't resolve a host, the Google Calendar reconcile is skipped again and `googleSyncStatus` stays `"pending"` — a retry that *does* newly succeed at getting a host performs both the Zoom update/create and the (now-unblocked) calendar reconcile in this same call.

**Request body:**
```json
{ "mid": "string" }
```

**Response:** `200 OK`
```json
{ "googleSyncStatus": "synced | error | pending", "googleSyncError": "string | null", "zoomSyncStatus": "synced | error | null", "zoomSyncError": "string | null" }
```

---

### `POST /api/update/meeting/suspend`
**Requires:** `ADMIN`. Hides a meeting from the live calendar without deleting it — removes its Google Calendar event(s) (or schedules that removal for a future `to` date) while preserving all meeting data. Rejects with `409` if the meeting already has an active or scheduled suspension (only one at a time). Sync (removing/re-scheduling the calendar event) runs via `after()`, same deferred pattern as create/update.

**Request body:**
```json
{ "mid": "string", "from": "ISO 8601", "to": "ISO 8601 (optional — omit for an indefinite suspension)" }
```

**Response:** `200 OK` — `{ "message": "Meeting suspended", "suspensionId": "string" }`
**Error:** `404 Not Found`, `409 Conflict` (already suspended)

---

### `POST /api/update/meeting/resume`
**Requires:** `ADMIN`. Resumes a suspended meeting — immediately, or schedules a future resume date via `on`. Uses an optimistic-concurrency `updateMany` gated on `promoted: false` so two concurrent resume requests on the same suspension can't both win. Sync (republishing the calendar event) runs via `after()`.

**Request body:**
```json
{ "mid": "string", "on": "ISO 8601 (optional — omit to resume immediately)" }
```

**Response:** `200 OK` — `{ "message": "Meeting resumed" }` or `{ "message": "Resume scheduled" }`
**Error:** `404 Not Found`, `409 Conflict` (already resumed)

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
**Error:** `400 Bad Request` — request body fails schema validation (issues listed in the response) or is malformed JSON; `409 Conflict` — an admin with this email already exists; `500 Internal Server Error`

---

### `GET /api/retrieve/admin`
**Requires:** `SUPER_ADMIN`. Retrieve a single admin by email.

| Param | Type | Description |
|---|---|---|
| `email` | string | Admin email address |

**Response:** `200 OK` — `IAdmin`
**Error:** `404 Not Found`; `500 Internal Server Error`

---

### `GET /api/retrieve/admins`
**Requires:** `SUPER_ADMIN`. Retrieve all admins (backs the Users tab on `/admin`).

**Response:** `200 OK` — `IAdmin[]`
**Error:** `500 Internal Server Error`

---

### `PUT /api/update/admin`
**Requires:** `SUPER_ADMIN`. Promote or demote an admin's role. Rejects demoting the last remaining `SUPER_ADMIN` (including self-demotion).

**Request body:**
```json
{ "email": "string", "role": "SUPER_ADMIN | ADMIN | USER" }
```

**Response:** `200 OK` — updated `IAdmin`
**Error:** `400 Bad Request` — request body fails schema validation, is malformed JSON, or it would leave zero Super Admins; `404 Not Found`; `409 Conflict` — a concurrent change conflicted with this update, retry; `500 Internal Server Error`

---

### `DELETE /api/delete/admin`
**Requires:** `SUPER_ADMIN`. Remove an admin by email. Same last-remaining-Super-Admin protection as above.

**Request body:**
```json
{ "email": "string" }
```

**Response:** `200 OK` — deleted `IAdmin` object
**Error:** `400 Bad Request` — it would leave zero Super Admins; `404 Not Found`; `409 Conflict` — a concurrent change conflicted with this removal, retry; `500 Internal Server Error`

---

## Diagnostics

Split into five independent endpoints, each backing one card on the Diagnostics tab — split out
from an earlier single combined `/api/admin/diagnostics` route so retrying/resuming/refreshing one
panel doesn't refetch the other four. All **require `ADMIN`**.

### `GET /api/admin/diagnostics/system-status`
DB latency, Google Calendar reachability per category, Zoom account reachability, per-room Zoom
calendar validity, per-host Zoom pool validity (existence + Licensed status), current session.
Each external check is bounded to 8s (`withTimeout`) and all four run concurrently, so one slow
provider doesn't serialize the whole request.

**Response:** `200 OK`
```json
{
  "database": { "ok": true, "latencyMs": 12 },
  "googleCalendar": { "categories": { "AA": true, "Al-Anon": true, "Other": false } },
  "zoom": {
    "reachable": true,
    "roomCalendars": { "Serenity Room - Zoom": true },
    "hostPool": { "host1@icr.example": { "ok": true, "licensed": true } }
  },
  "session": { "email": "string", "role": "string" }
}
```

### `GET /api/admin/diagnostics/meeting-counts`
Total/active/suspended, per-category, recurring/one-time, and sync-error/pending-Zoom-host counts.

**Response:** `200 OK`
```json
{
  "total": 0, "active": 0, "suspended": 0,
  "byCategory": { "AA": 0, "Al-Anon": 0, "Other": 0 },
  "recurring": 0, "oneTime": 0,
  "gcalSyncErrors": 0, "zoomSyncErrors": 0, "pendingZoomSync": 0
}
```

### `GET /api/admin/diagnostics/conflicts`
Meetings sharing a room, Zoom room, or Zoom host at overlapping times (via
`util/meetings/resourceOverlap.ts#computeConflicts`).

**Response:** `200 OK` — `{ "conflicts": [...] }`

### `GET /api/admin/diagnostics/suspended`
Meetings currently suspended, or with a suspension scheduled for a future date. Derived from each
meeting's `SuspensionPeriod` rows (via `getUnresolvedSuspension`), not a `status` field alone —
the date-based truth is the source of record.

**Response:** `200 OK` — `{ "suspendedMeetings": [...], "total": 0 }`

### `GET /api/admin/diagnostics/sync-issues`
Meetings that failed to sync to Zoom or Google Calendar, or are waiting on a Zoom host. Each
issue is returned with a structured `severity` (`"warning" | "danger"`), not left for the UI to
infer from message text.

**Response:** `200 OK` — `{ "syncIssues": [...], "total": 0 }`

---

## Admin-Gated Calendar Badge Data

Both **require `ADMIN`** — see
[Technical Decisions](../02-handoff/technical-decisions.md#admin-gated-mids-pattern-for-calendar-badges)
for why these exist as separate endpoints rather than fields on the public meeting payload.

### `GET /api/admin/conflict-mids`
Mids of meetings with an unresolved room/zoomRoom/zoomHost conflict — backs the calendar block's
conflict badge. 15s server-side cache (the underlying computation is the same one
`diagnostics/conflicts` runs, expensive enough to be worth deduping across the calendar's frequent
polling).

**Response:** `200 OK` — `{ "mids": ["string"], "counts": { "mid": 2 } }` (`counts` = how many
other meetings each mid conflicts with)

### `GET /api/admin/sync-error-mids`
Mids of meetings with a Google Calendar or Zoom sync error — backs the calendar block's
sync-error badge.

**Response:** `200 OK` — `{ "mids": ["string"] }`

---

## Export

### `GET /api/export/lease`
**Requires:** `SUPER_ADMIN`. Generates the PandaDoc bulk-send lease CSV for every non-deleted meeting (Active and Suspended both included — a lease obligation doesn't end just because a meeting is suspended), using the stored `LeaseSettings` (or defaults if none saved).

**Response:** `200 OK` — `text/csv`, filename `{leaseStartYear} - {leaseEndYear} Bulk Send Lease.csv`

---

### `GET /api/export/meetings`
**Requires:** `SUPER_ADMIN`. Generates an XLSX backup of every non-deleted meeting (recurring and one-time). Which optional columns are included is configurable (see `meeting-export-settings` below); Meeting ID and Meeting Name are always included.

**Response:** `200 OK` — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, filename `ithaca-recovery-meetings-{YYYY-MM-DD}.xlsx`

---

## Lease Settings

Singleton config for the PandaDoc lease export — lease period, per-room rates, rental agent contact, and email template — editable via the Export tab's settings modal. Enforced as a true singleton at the schema level: `LeaseSettings.id` defaults to a fixed constant rather than a random `cuid()`, and reads/writes are keyed on that constant (`upsert`/`findUnique`, not `findFirst()`) instead of relying on "there's only ever one row" as a convention.

> [!IMPORTANT]
> **Deployment requirement:** this enforcement depends on the migration that renames any
> pre-existing row's `id` onto the fixed constant — production must apply schema changes via
> `prisma migrate deploy` (already how the Vercel build runs it), never `prisma db push`, or an
> existing settings row would silently stop being found and a later save would create a duplicate
> under the new fixed id.

### `GET /api/retrieve/lease-settings`
**Requires:** `SUPER_ADMIN`. Returns the stored settings, or a hardcoded default set (`frontend/util/lease/leaseDefaults.ts`) if none have been saved yet.

**Response:** `200 OK` — `ILeaseSettings`

---

### `PUT /api/update/lease-settings`
**Requires:** `SUPER_ADMIN`. Upserts the singleton settings document.

**Request body:** `ILeaseSettings`

**Response:** `200 OK` — saved `ILeaseSettings`
**Error:** `400 Bad Request` if `leaseStartDate >= leaseEndDate`

---

## Meeting Export Settings

Singleton config for which optional columns the Export Meetings XLSX download includes — editable
via the Export tab's field-selection modal (`MeetingExportConfigModal`). Enforced the same fixed-ID singleton way as Lease Settings above — see that section's deployment requirement, which applies here too.

### `GET /api/retrieve/meeting-export-settings`
**Requires:** `SUPER_ADMIN`. Returns the stored field list, or an empty selection if none saved.

**Response:** `200 OK` — `{ "fields": ["string"] }`

---

### `PUT /api/update/meeting-export-settings`
**Requires:** `SUPER_ADMIN`. Upserts the singleton settings document.

**Request body:** `{ "fields": ["string"] }`

**Response:** `200 OK` — saved settings

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

## Docs

### `GET /api/docs-raw/[[...slug]]`
Serves the raw Markdown source for a docs page by slug, e.g. `/api/docs-raw/01-user-guide/README`.
Backs the "Copy as Markdown" affordance on each docs page — `next.config.mjs`'s rewrites turn a
clean `/docs/<slug>.md` URL into a request here. Public, no auth guard (the rendered docs at
`/docs` are already public).

**Response:** `200 OK`, `text/markdown`, or `404` if the slug doesn't match a doc in the manifest.

---

## Zoom

Not a set of proxy routes — Zoom is a server-only service (`frontend/services/zoom.ts`) called directly from the meeting routes above (`write`, `update`, `delete`, `update/meeting/sync`), gated by the same `requireRole(ADMIN)` check as those routes — there's no separate unauthenticated Zoom surface.

ICR's 5 licensed Zoom accounts (`ZOOM_HOSTS` env var, comma-separated) are a shared pool, not tied to any one room — a licensed host can run up to 2 meetings at once (a basic host only 1; capacity follows live license status, fail-safe 1). A meeting's host is auto-assigned at creation — licensed hosts before basic, least-loaded first within the tier, pool order as tie-break unless the Meeting Form's Zoom Host dropdown is used to manually pick one, for troubleshooting/admin exceptions. Only Hybrid meetings additionally have a `zoomRoom` (a Zoom Room device physically installed in that room) with its own Google Calendar the join link publishes to; Remote (online-only) meetings use a pool host but no physical Zoom Room device. See [Technical Decisions](../02-handoff/technical-decisions.md#zoom-integration) for why, and [Integration Guides](integration-guides.md#4-zoom-api) for setup.

### `GET /api/retrieve/zoom-hosts`
**Requires:** `ADMIN`. List the Zoom host pool, in `ZOOM_HOSTS` order — backs the Meeting Form's Zoom Host dropdown and its friendly "Zoom Host N" labels (derived from list position, not stored).

**Response:** `200 OK`
```json
{ "hosts": ["host1@icr.example", "host2@icr.example"] }
```

---

### `POST /api/retrieve/zoom-host-availability`
**Requires:** `ADMIN`. Backs the Meeting Form's Zoom Host dropdown, which calls this automatically (debounced) whenever the meeting's date/time/recurrence changes — checks every pool host (not just the first free one) against the candidate schedule. Body accepts the same shape the create/update routes take; only `mid` (optional, excludes that meeting from its own conflict check), `startDateTime`, `endDateTime`, `isRecurring`, and `recurrencePattern` are read.

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

From `frontend/types/models.ts`:

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
  zoomLink?: string | null;
  zid?: string | null;             // Zoom meeting ID
  zoomPasscode?: string | null;
  zoomInvitation?: string | null;  // Zoom's auto-generated invitation text
  calType: string[];               // subset of ["AA", "Al-Anon", "Other"]
  modeType: string;                // "Remote" | "In Person" | "Hybrid"
  room: string;
  status?: string;                 // "Active" | "Suspended", default "Active"
  // Populated only by GET retrieve/meeting/[id] for authenticated callers -- derived from
  // SuspensionPeriod, never a source of truth by itself.
  resumesAt?: Date | null;         // the current unresolved suspension's scheduled resume date
  suspendedSince?: Date | null;    // that suspension's own start date
  suspensionActive?: boolean;      // whether it's actually hiding the meeting now, vs. scheduled
  isRecurring: boolean;
  recurrencePattern?: IRecurrencePattern | null;
  googleCalendarEventId?: string | null;         // legacy single-calendar ID
  googleCalendarEventIds?: Record<string, string> | null; // per-category, keyed by calType value
  googleSyncStatus?: string | null;  // "synced" | "error" | "pending" (deferred, waiting on Zoom)
  googleSyncError?: string | null;
  zoomCalendarEventId?: string | null;  // event ID on that room's own Google Calendar (Hybrid only)
  zoomSyncStatus?: string | null;  // "synced" | "error", independent of googleSyncStatus
  zoomHost?: string | null;        // assigned pool account email; null/omitted = auto-assign at creation
  zoomSyncError?: string | null;
  deletedAt?: Date | null;         // soft-delete marker
  updatedAt?: Date | null;
  confirmOverride?: boolean;       // resubmit-past-a-shown-conflict flag; never persisted
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

`SuspensionPeriod` and `MeetingExportSettings` (Prisma models backing the suspend/resume workflow
and export field-selection config) don't have dedicated `types/models.ts` interfaces yet — see
[Project Structure](project-structure.md#prisma-schema-prisma) for their Prisma shape.
