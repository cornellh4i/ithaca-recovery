// Recipes for driving the app's fail-soft Google Calendar / Zoom sync into
// deterministic states with zero real network calls, exploiting the exact
// gating already present in the routes/services (verified by reading them
// directly — see the ticket-D plan doc for the full trace):
//
//   - GCal sync only runs at all if the session has a truthy `accessToken`
//     (write/meeting/route.ts). Mint a session with no accessToken (the
//     default from mintSessionToken/loginAs) to skip it entirely.
//   - GCal sync "runs but fails" requires a truthy accessToken AND at least
//     one configured GOOGLE_CALENDAR_* env var (calendarIdsForMeeting() must
//     return a non-empty map, or the loop never executes and `synced`
//     evaluates false anyway). In the test env, GOOGLE_CALENDAR_AA/ALANON/
//     OTHER are deliberately left unset, so calendarIdsForMeeting() always
//     returns {} — meaning a truthy-but-fake accessToken alone already
//     produces `googleSyncStatus: 'error'`, with zero real HTTP calls.
//   - Zoom sync only runs if `meetingData.zoomRoom` is set. Leave it unset to
//     skip; set it (with ZOOM_CLIENT_ID/SECRET/ACCOUNT_ID also left unset in
//     the test env) to get `zoomSyncStatus: 'error'` — getZoomAccessToken()
//     early-returns null before any fetch.
//
// For "renders a successfully-synced meeting" assertions, don't try to drive
// a real success through these routes — seed the end state directly via
// seedMeeting({ zoomSyncStatus: 'synced', zoomLink: ..., googleSyncStatus: 'synced',
// googleCalendarEventIds: {...} }) instead. These are rendering assertions,
// not integration assertions.

// A truthy accessToken with no real GCal calendars configured deterministically
// produces googleSyncStatus: 'error' on write/update — see the top-of-file note.
export const FAKE_ACCESS_TOKEN = "fake-access-token-for-error-path-testing";
