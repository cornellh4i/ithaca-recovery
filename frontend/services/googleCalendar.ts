import "server-only";
import { google } from "googleapis";
import { IMeeting, IRecurrencePattern } from "../types/models";
import { getETDayBounds, convertETToUTC } from "../util/date/timeUtils";
import { buildLinkedScheduleLabel, LINKED_SCHEDULE_MODE_LABEL } from "../util/meetings/linkedSchedules";

export const calendarIdForCategory: Record<string, string> = {
    AA:        process.env.GOOGLE_CALENDAR_AA ?? "",
    "Al-Anon": process.env.GOOGLE_CALENDAR_ALANON ?? "",
    Other:     process.env.GOOGLE_CALENDAR_OTHER ?? "",
};

// Returns { category: calendarId } for each category in calType that has an env var configured.
export function calendarIdsForMeeting(calType: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const cat of calType) {
        if (calendarIdForCategory[cat]) result[cat] = calendarIdForCategory[cat];
    }
    return result;
}

// Google's client library errors generally carry the API's own reason text in .message
// (e.g. "Insufficient Permission", "Not Found") -- surfaced verbatim in ViewMeeting's
// sync-failure details rather than a generic "something went wrong".
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function getCalendarClient(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.calendar({ version: "v3", auth });
}

export async function checkCalendarReachable(accessToken: string, calendarId: string): Promise<boolean> {
    if (!calendarId) return false;
    try {
        const calendar = getCalendarClient(accessToken);
        // events.list (not calendars.get) — calendars.get needs the broader "calendar" scope,
        // which this app doesn't request; calendar.events covers events.list.
        await calendar.events.list({ calendarId, maxResults: 1 });
        return true;
    } catch (error) {
        console.error(`Google Calendar reachability check failed for ${calendarId}:`, error);
        return false;
    }
}

export function toRRule(pattern: IRecurrencePattern): string {
    const dayMap: Record<string, string> = {
        Sunday: "SU", Monday: "MO", Tuesday: "TU", Wednesday: "WE",
        Thursday: "TH", Friday: "FR", Saturday: "SA",
    };

    let freq: string;
    let byday = "";

    if (pattern.type === "monthly") {
        freq = `FREQ=MONTHLY;INTERVAL=${pattern.interval ?? 1}`;
        if (pattern.weekOfMonth != null) {
            const day = dayMap[(pattern.daysOfWeek ?? [])[0]] ?? "";
            byday = `;BYDAY=${pattern.weekOfMonth}${day}`;
        } else if (pattern.dayOfMonth != null) {
            byday = `;BYMONTHDAY=${pattern.dayOfMonth}`;
        }
    } else {
        const byDay = (pattern.daysOfWeek ?? []).map((d) => dayMap[d]).join(",");
        freq = `FREQ=WEEKLY;INTERVAL=${pattern.interval ?? 1}`;
        byday = byDay ? `;BYDAY=${byDay}` : "";
    }

    // endDate wins when both are present. Normally only one of the two is ever set, but a
    // 'thisAndFollowing' trim (delete route, update route's handleScopedEdit) writes endDate
    // without also clearing a pre-existing numberOfOccurrences at every call site that reaches
    // here indirectly (e.g. a stale in-memory object) -- checking endDate first is a defensive
    // backstop so a trimmed series can never be un-trimmed by COUNT winning instead of UNTIL.
    if (pattern.endDate) {
        // Use 23:59:59 ET so the end date is inclusive — midnight UTC = previous evening ET.
        const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date(pattern.endDate));
        const until = new Date(convertETToUTC(`${etDate}T23:59:59`))
            .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        return `RRULE:${freq}${byday};UNTIL=${until}`;
    }
    if (pattern.numberOfOccurrences) {
        return `RRULE:${freq}${byday};COUNT=${pattern.numberOfOccurrences}`;
    }
    return `RRULE:${freq}${byday}`;
}

// Formats an excluded occurrence's date + the meeting's own ET start wall-clock time as
// Google Calendar's EXDATE value ("YYYYMMDDTHHMMSS", ET) -- the exclusion always keeps the
// series' own start time, only the calendar date varies per entry. Shared by buildEventBody's
// EXDATE emission below; extracted so any other EXDATE-shaped formatting stays byte-for-byte
// consistent with it instead of drifting into a second, subtly different implementation.
function formatExdateCompact(occurrenceDate: Date | string, meetingStartDateTime: Date | string): string {
    const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
        .format(new Date(occurrenceDate));
    const etDateCompact = etDate.replace(/-/g, '');

    const etTimeParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        // hourCycle: 'h23' explicitly, not just hour12: false -- some engines default hour12:
        // false to h24 (midnight renders as "24", not "00"), which would emit an invalid EXDATE
        // hour for a meeting whose ET start time is exactly midnight.
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23',
    }).formatToParts(new Date(meetingStartDateTime));
    const get = (t: string) => etTimeParts.find(p => p.type === t)?.value?.padStart(2, '0') ?? '00';

    return `${etDateCompact}T${get('hour')}${get('minute')}${get('second')}`;
}

// MEETING_LOCATION used for public-facing Google Calendars only,
// Zoom Room calendars pass their own join link.
const MEETING_LOCATION = "518 W Seneca St, Ithaca, NY 14850";

// A lone meeting's event title names its own mode, "In Person" included: unlike a Zoom topic,
// a calendar event exists for an in-person meeting and its mode is exactly what a reader needs.
// Passed explicitly rather than left to buildLinkedScheduleLabel's default, so both services
// state the one thing they disagree about at their own call site (cf. ZOOM_SINGLE_TOPIC_SUFFIX).
const CALENDAR_SINGLE_TITLE_SUFFIX = LINKED_SCHEDULE_MODE_LABEL;

// The event title carries the meeting's mode ("… - Zoom Only") so it's visible at a glance on a
// public calendar. A meeting run as a linked-schedule family gets that family's full name --
// "One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat" -- on EVERY member's event, not just the
// segment describing that member: each schedule keeps its own event with its own dates and
// RRULE, but a reader landing on either one sees the same meeting described the same way, which
// is also exactly the name the family's shared Zoom meeting carries. Nothing pins a calendar
// title the way zoomTopic pins a Zoom topic, so there's no verbatim-name escape hatch here.
//
// The title is recomputed only for the row being written, so a write that changes the FAMILY's
// shape has to republish the other members too, or their events keep the name they were last
// written with. Adding a schedule does exactly that (handleLinkedScheduleCreate's
// syncLinkedScheduleFamily fan-out, app/api/update/meeting/route.ts).
// TODO(linked-schedules PR5): removing a linked schedule is a plain row soft-delete, which
// leaves the SURVIVOR's events on the two-schedule name until it is next written.
function buildEventTitle(meeting: IMeeting, family: IMeeting[]): string {
    return buildLinkedScheduleLabel(meeting.title, meeting, family, CALENDAR_SINGLE_TITLE_SUFFIX);
}

// family: the meeting's linked-schedule family (util/meetings/linkedSchedules.ts), for the
// title above. Defaulted so the many callers with no family concept -- suspension resume,
// delete-route rewrites -- stay unchanged.
// locationOverride: Zoom Room calendars pass the join link here — Zoom Rooms detects a
// joinable meeting from the location field, not the description.
// Exported for direct unit testing of the RRULE/EXDATE serialization -- this is the single
// place a RecurrencePattern turns into a Google Calendar body, so its output shape is worth
// testing without going through the network-calling functions below.
export function buildEventBody(meeting: IMeeting, family: IMeeting[] = [], locationOverride?: string) {
    const descriptionLines = [
        meeting.calType?.length ? `Type: ${meeting.calType.join(', ')}` : null,
        meeting.modeType ? `Mode: ${meeting.modeType}` : null,
        meeting.room ? `Room: ${meeting.room}` : null,
        meeting.zoomLink ? `Zoom: ${meeting.zoomLink}` : null,
].filter(Boolean);
if (meeting.description) {
    if (descriptionLines.length) descriptionLines.push("");
    descriptionLines.push(`Description: ${meeting.description}`);
}

    const event: Record<string, unknown> = {
        summary: buildEventTitle(meeting, family),
        description: descriptionLines.join("\n"),
        location: locationOverride ?? MEETING_LOCATION,
        start: { dateTime: new Date(meeting.startDateTime).toISOString(), timeZone: "America/New_York" },
        end: { dateTime: new Date(meeting.endDateTime).toISOString(), timeZone: "America/New_York" },
    };

    if (meeting.recurrencePattern) {
        const recurrence = [toRRule(meeting.recurrencePattern)];
        // RecurrencePattern.excludedDates is the complete, current record of every occurrence
        // removed from this series (delete-'this', edit-'this') -- buildEventBody is the single
        // place that turns a pattern into a Google Calendar body, so serializing them here as
        // EXDATE lines makes every full events.update/events.insert (whole-series edit, Retry
        // sync, reconcile) automatically preserve them instead of silently resurrecting
        // previously-removed occurrences the way a bare RRULE regenerate would.
        for (const excluded of meeting.recurrencePattern.excludedDates ?? []) {
            recurrence.push(`EXDATE;TZID=America/New_York:${formatExdateCompact(excluded, meeting.startDateTime)}`);
        }
        event.recurrence = recurrence;
    }

    return event;
}

// family (trailing, optional, like every other write below): the meeting's linked-schedule
// family, so the event title names the whole family. Trailing rather than beside `meeting`
// because most call sites -- resume, suspension, delete-route rewrites -- have no family in
// hand, and a positional parameter they'd all have to pass `[]` to is only a chance to get the
// argument order wrong.
export async function createCalendarEvent(
    accessToken: string,
    meeting: IMeeting,
    calendarId: string,
    locationOverride?: string,
    family: IMeeting[] = [],
): Promise<{ id: string | null; error: string | null }> {
    try {
        const calendar = getCalendarClient(accessToken);
        const res = await calendar.events.insert({
            calendarId,
            requestBody: buildEventBody(meeting, family, locationOverride),
        });
        return { id: res.data.id ?? null, error: null };
    } catch (error) {
        console.error("Google Calendar createEvent error:", error);
        return { id: null, error: errorMessage(error) };
    }
}

export async function updateCalendarEvent(
    accessToken: string,
    googleCalendarEventId: string,
    meeting: IMeeting,
    calendarId: string,
    locationOverride?: string,
    family: IMeeting[] = [],
): Promise<{ ok: boolean; error: string | null }> {
    try {
        const calendar = getCalendarClient(accessToken);
        await calendar.events.update({
            calendarId,
            eventId: googleCalendarEventId,
            requestBody: buildEventBody(meeting, family, locationOverride),
        });
        return { ok: true, error: null };
    } catch (error) {
        console.error("Google Calendar updateEvent error:", error);
        return { ok: false, error: errorMessage(error) };
    }
}

// Reconciles a meeting's Google Calendar events against its current calType:
// removes events for calendars no longer selected, updates events for calendars
// still selected, and creates events for newly selected calendars. Used by both
// the update route (on every edit) and the sync route (manual "Retry sync"), which pass the
// same linked-schedule family they hand Zoom in that request so the event title and the Zoom
// topic are derived from one lookup and can't disagree.
export async function reconcileMeetingCalendars(
    accessToken: string,
    meeting: IMeeting,
    existingEventIds: Record<string, string>,
    family: IMeeting[] = [],
): Promise<{ updatedEventIds: Record<string, string>; allSynced: boolean; googleSyncError: string | null }> {
    const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);
    const updatedEventIds: Record<string, string> = { ...existingEventIds };
    // Any calType category missing from calendarIds means its GOOGLE_CALENDAR_* env var isn't
    // configured -- a real misconfiguration, not "nothing to sync." Without this check, a
    // meeting whose categories are all unconfigured would skip both loops below entirely (no
    // existing events to remove, no calendarIds to create) and allSynced would stay vacuously
    // true, reporting full success despite zero calendar work actually happening.
    const unconfiguredCat = (meeting.calType ?? []).find((cat) => !calendarIds[cat]);
    let allSynced = !unconfiguredCat;
    // First failure wins -- callers surface this verbatim in a single-line details block, so
    // one representative error is more useful than concatenating every failure in the batch.
    let googleSyncError: string | null = null;
    const recordError = (message: string) => { googleSyncError = googleSyncError ?? message; };
    if (unconfiguredCat) recordError(`Calendar for "${unconfiguredCat}" is not configured.`);

    // Remove events from calendars whose category is no longer part of this meeting's calType
    for (const cat of Object.keys(existingEventIds)) {
        if (calendarIds[cat]) continue;
        const calId = calendarIdForCategory[cat];
        const eventId = existingEventIds[cat];
        if (!calId || !eventId) {
            // calId missing means this category's env var isn't configured -- we can't
            // actually delete the remote event, so keep its reference (and flag the
            // meeting as unsynced) rather than silently forgetting it. Forgetting it here
            // would create a duplicate event once the calendar is reconfigured, since
            // reconcileMeetingCalendars would then see no existing event to update.
            allSynced = false;
            recordError(`Calendar for "${cat}" is not configured.`);
            continue;
        }

        const ok = await deleteCalendarEvent(accessToken, eventId, calId);
        if (ok) delete updatedEventIds[cat];
        else {
            allSynced = false;
            recordError("Failed to remove an outdated calendar event.");
        }
    }

    for (const [cat, calId] of Object.entries(calendarIds)) {
        const existingId = existingEventIds[cat];
        if (existingId) {
            const { ok, error } = await updateCalendarEvent(accessToken, existingId, meeting, calId, undefined, family);
            if (!ok) {
                allSynced = false;
                recordError(error ?? "Failed to update the calendar event.");
            }
        } else {
            const { id: newId, error } = await createCalendarEvent(accessToken, meeting, calId, undefined, family);
            if (newId) updatedEventIds[cat] = newId;
            else {
                allSynced = false;
                recordError(error ?? "Failed to create the calendar event.");
            }
        }
    }

    return { updatedEventIds, allSynced, googleSyncError };
}

export async function deleteCalendarEvent(
    accessToken: string,
    googleCalendarEventId: string,
    calendarId: string,
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);
        await calendar.events.delete({
            calendarId,
            eventId: googleCalendarEventId,
        });
        return true;
    } catch (error) {
        console.error("Google Calendar deleteEvent error:", error);
        return false;
    }
}

// Truncates a recurring Google Calendar event series so it ends before occurrenceISODate.
// occurrenceISODate: UTC ISO string representing the first occurrence to remove.
//
// Exists solely for a SUSPENSION trim now (services/... syncSuspend in
// app/api/update/meeting/suspend/route.ts) -- every other trim (delete's 'thisAndFollowing',
// update's scoped-edit split) is RecurrencePattern state (a stored `endDate`) and goes through
// a full events.update instead, letting buildEventBody regenerate the whole recurrence
// (RRULE + EXDATEs) from that pattern. A suspension trim is deliberately NOT pattern state --
// it truncates at max(suspension.from, tomorrow), a date that lives only in SuspensionPeriod,
// never written into RecurrencePattern.endDate -- so it must stay a live-recurrence patch here
// rather than ever being regenerated from the pattern, or a later full-body rewrite of the same
// event (e.g. an unrelated field edit while still suspended) would silently undo it.
export async function trimCalendarEventSeries(
    accessToken: string,
    googleCalendarEventId: string,
    occurrenceISODate: string,
    calendarId: string,
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);

        // UNTIL = 1ms before the UTC start of the occurrence's ET day
        const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date(occurrenceISODate));
        const [occurrenceUTCStart] = getETDayBounds(etDate);
        const untilStr = new Date(occurrenceUTCStart.getTime() - 1)
            .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        const event = await calendar.events.get({ calendarId, eventId: googleCalendarEventId });
        const currentRecurrence = event.data.recurrence ?? [];

        // Replace or set UNTIL; drop COUNT so they don't conflict
        const updatedRecurrence = currentRecurrence.map(r => {
            if (!r.startsWith('RRULE:')) return r;
            const parts = r.replace('RRULE:', '').split(';')
                .filter(p => !p.startsWith('UNTIL=') && !p.startsWith('COUNT='));
            parts.push(`UNTIL=${untilStr}`);
            return `RRULE:${parts.join(';')}`;
        });

        await calendar.events.patch({
            calendarId,
            eventId: googleCalendarEventId,
            requestBody: { recurrence: updatedRecurrence },
        });
        return true;
    } catch (error) {
        console.error("Google Calendar trimCalendarEventSeries error:", error);
        return false;
    }
}
