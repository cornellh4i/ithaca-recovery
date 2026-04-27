# API Reference

All endpoints are Next.js Route Handlers under `frontend/app/api/`. Requests and responses use JSON. Authentication is enforced at the session level via Azure MSAL — see [project-structure.md](project-structure.md) for the auth flow. [TODO: Update when complete transition to Google]

---

## Meetings

### `POST /api/write/meeting`
Create a new meeting. If `isRecurring` is true, a `RecurrencePattern` record is created alongside the meeting and an `endDate` is calculated automatically from `numberOfOccurrences` when not explicitly provided.

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
  "zoomAccount": "string | null",
  "zoomLink": "string | null",
  "zid": "string | null",
  "calType": "string",
  "modeType": "Remote | In Person | Hybrid",
  "room": "string",
  "isRecurring": false,
  "recurrencePattern": null
}
```

**Response:** `201 Created` — created `IMeeting` object

---

### `GET /api/retrieve/meeting`
Retrieve all meetings.

**Response:** `200 OK` — `IMeeting[]`

---

### `GET /api/retrieve/meeting/[id]`
Retrieve a single meeting with its recurrence pattern.

**URL parameter:** `mid` — the meeting's unique ID

**Response:** `200 OK` — `IMeeting` with `recurrencePattern`  
**Error:** `404 Not Found`

---

### `GET /api/retrieve/meeting/day`
Retrieve all meetings (including expanded recurring instances) for a specific day.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 or `YYYY-MM-DD` | Target day |

**Response:** `200 OK` — `IMeeting[]` with times adjusted to the requested day

---

### `GET /api/retrieve/meeting/week`
Retrieve all meetings for the 7-day week beginning on the Sunday of the provided date.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 | Any date within the target week |

**Response:** `200 OK` — `IMeeting[]`

---

### `GET /api/retrieve/meeting/month`
Retrieve all meetings for the calendar month of the provided date.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO 8601 | Any date within the target month |

**Response:** `200 OK` — `IMeeting[]`

---

### `PUT /api/update/meeting`
Update an existing meeting. Identifies the record by `mid`. Also upserts or removes the associated `RecurrencePattern`.

**Request body:** `IMeeting` (must include `mid`)

**Response:** `200 OK` — updated `IMeeting`

---

### `DELETE /api/delete/meeting`
Delete a meeting. Supports three deletion strategies for recurring meetings.

**Request body:**
```json
{
  "mid": "string",
  "deleteOption": "this | thisAndFollowing | all"
}
```

| `deleteOption` | Behavior |
|---|---|
| `all` | Deletes the meeting and its recurrence pattern |
| `this` | Placeholder — deletes current occurrence only (not yet fully implemented) |
| `thisAndFollowing` | Placeholder — deletes current and future occurrences (not yet fully implemented) |

**Response:** `200 OK` — success message string

---

## Admins

### `POST /api/write/admin`
Create a new admin user.

**Request body:** `IAdmin`
```json
{
  "uid": "string",
  "name": "string",
  "email": "string",
  "privilegeMode": "string (optional)"
}
```

**Response:** `201 Created` — created `IAdmin` object

---

### `GET /api/retrieve/admin`
Retrieve an admin by email address.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `email` | string | Admin email address |

**Response:** `200 OK` — `IAdmin`  
**Error:** `404 Not Found`

---

### `DELETE /api/delete/admin`
Delete an admin by email.

**Request body:**
```json
{ "email": "string" }
```

**Response:** `200 OK` — deleted `IAdmin` object

---

## Zoom

All Zoom routes proxy to the Zoom API using OAuth account credentials. Credentials are read from `ZOOM1_CLIENT_ID`, `ZOOM1_CLIENT_SECRET`, and `ZOOM1_ACCOUNT_ID`.

### `GET /api/zoom`
Generate a Zoom OAuth access token.

**Response:** `200 OK`
```json
{ "access_token": "string" }
```

---

### `POST /api/zoom/CreateMeeting`
Create a Zoom meeting. Internally fetches a token, creates the meeting, then fetches and returns the full meeting details.

**Request body:** Zoom meeting config object
```json
{
  "topic": "string",
  "agenda": "string",
  "start_time": "ISO 8601",
  "duration": 60,
  "timezone": "America/New_York",
  "type": 2,
  "settings": {
    "host_video": true,
    "participant_video": true,
    "password": "string"
  }
}
```

**Response:** `200 OK` — Zoom meeting object (includes join URL, meeting ID, etc.)

---

### `PATCH /api/zoom/UpdateMeeting`
Update an existing Zoom meeting.

**Request body:**
```json
{
  "meetingId": "string",
  "topic": "string",
  "start_time": "ISO 8601"
}
```
Any valid Zoom meeting fields can be included alongside `meetingId`.

**Response:** `200 OK` — updated Zoom meeting object

---

### `DELETE /api/zoom/DeleteMeeting`
Delete a Zoom meeting.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `id` | string | Zoom meeting ID |

**Response:** Zoom API response

---

## Microsoft Graph

These routes proxy to the Microsoft Graph API using the authenticated user's access token.

### `GET /api/microsoft/groups`
List all Microsoft Azure AD groups accessible to the authenticated user.

**Response:** `200 OK` — array of group objects from Graph API

---

### `GET /api/microsoft/calendars/getCalendars`
Retrieve the calendar for a specific Azure AD group.

**Request body:**
```json
{ "groupId": "string" }
```

**Response:** `200 OK` — calendar object from `GET v1.0/groups/{groupId}/calendar`

---

## Authentication

### `GET /api/auth/status`
Check whether the current user is authenticated.

**Response:** `200 OK`
```json
{ "isAuthenticated": true }
```

---

## Server Utilities

### `GET /api/server/account`
Returns the current authenticated user's account info from the MSAL cache.

### `GET /api/server/url`
Returns the current request URL (used for constructing redirect URIs).

### `GET /api/server/session`
Returns the current session data from the cookie store.

---

## Data Types Reference

```typescript
interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string;                    // admin email
  group: string;
  startDateTime: Date;
  endDateTime: Date;
  email: string;
  zoomAccount?: string | null;
  zoomLink?: string | null;
  zid?: string | null;               // Zoom meeting ID
  calType: string;
  modeType: "Remote" | "In Person" | "Hybrid";
  room: string;
  isRecurring?: boolean;
  recurrencePattern?: IRecurrencePattern | null;
}

interface IRecurrencePattern {
  mid?: string;
  type: "weekly" | "daily";
  startDate: Date;
  endDate?: Date | null;
  numberOfOccurrences?: number | null;
  daysOfWeek?: string[] | null;      // e.g. ["Monday", "Wednesday"]
  firstDayOfWeek: string;
  interval: number;                  // 1 = weekly, 2 = biweekly
}

interface IAdmin extends IUser {
  email: string;
  privilegeMode?: string;
}

interface IUser {
  uid: string;
  name: string;
}
```
