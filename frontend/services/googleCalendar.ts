import "server-only";
import { google } from "googleapis";
import { IMeeting, IRecurrencePattern } from "../types/models";
import { getETDayBounds, convertETToUTC } from "../util/date/timeUtils";

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

    if (pattern.numberOfOccurrences) {
        return `RRULE:${freq}${byday};COUNT=${pattern.numberOfOccurrences}`;
    }
    if (pattern.endDate) {
        // Use 23:59:59 ET so the end date is inclusive — midnight UTC = previous evening ET.
        const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date(pattern.endDate));
        const until = new Date(convertETToUTC(`${etDate}T23:59:59`))
            .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        return `RRULE:${freq}${byday};UNTIL=${until}`;
    }
    return `RRULE:${freq}${byday}`;
}

// Suffix appended to the GCal event title so the mode is visible at a glance;
// "Remote" reads as "Zoom Only" since ICR's meetings are never fully unattended.
const modeTitleSuffix: Record<string, string> = {
    Hybrid: "Hybrid",
    "In Person": "In Person",
    Remote: "Zoom Only",
};

// MEETING_LOCATION used for public-facing Google Calendars only,
// Zoom Room calendars pass their own join link.
const MEETING_LOCATION = "518 W Seneca St, Ithaca, NY 14850";

function buildEventTitle(meeting: IMeeting): string {
    const suffix = modeTitleSuffix[meeting.modeType];
    return suffix ? `${meeting.title} - ${suffix}` : meeting.title;
}

// locationOverride: Zoom Room calendars pass the join link here — Zoom Rooms detects a
// joinable meeting from the location field, not the description.
function buildEventBody(meeting: IMeeting, locationOverride?: string) {
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
        summary: buildEventTitle(meeting),
        description: descriptionLines.join("\n"),
        location: locationOverride ?? MEETING_LOCATION,
        start: { dateTime: new Date(meeting.startDateTime).toISOString(), timeZone: "America/New_York" },
        end: { dateTime: new Date(meeting.endDateTime).toISOString(), timeZone: "America/New_York" },
    };

    if (meeting.recurrencePattern) {
        event.recurrence = [toRRule(meeting.recurrencePattern)];
    }

    return event;
}

export async function createCalendarEvent(
    accessToken: string,
    meeting: IMeeting,
    calendarId: string,
    locationOverride?: string,
): Promise<{ id: string | null; error: string | null }> {
    try {
        const calendar = getCalendarClient(accessToken);
        const res = await calendar.events.insert({
            calendarId,
            requestBody: buildEventBody(meeting, locationOverride),
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
): Promise<{ ok: boolean; error: string | null }> {
    try {
        const calendar = getCalendarClient(accessToken);
        await calendar.events.update({
            calendarId,
            eventId: googleCalendarEventId,
            requestBody: buildEventBody(meeting, locationOverride),
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
// the update route (on every edit) and the sync route (manual "Retry sync").
export async function reconcileMeetingCalendars(
    accessToken: string,
    meeting: IMeeting,
    existingEventIds: Record<string, string>,
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
            const { ok, error } = await updateCalendarEvent(accessToken, existingId, meeting, calId);
            if (!ok) {
                allSynced = false;
                recordError(error ?? "Failed to update the calendar event.");
            }
        } else {
            const { id: newId, error } = await createCalendarEvent(accessToken, meeting, calId);
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

// Adds an EXDATE to a recurring Google Calendar event to skip a single occurrence.
// occurrenceISODate: UTC ISO string representing the occurrence to exclude (from lastClickedDate).
export async function deleteCalendarOccurrence(
    accessToken: string,
    googleCalendarEventId: string,
    meetingStartDateTime: Date | string,
    occurrenceISODate: string,
    calendarId: string,
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);

        // Derive the ET date of the occurrence (YYYYMMDD compact)
        const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date(occurrenceISODate));
        const etDateCompact = etDate.replace(/-/g, '');

        // Derive the meeting's start time in ET (HHMMSS) for the EXDATE
        const etTimeParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).formatToParts(new Date(meetingStartDateTime));
        const get = (t: string) => etTimeParts.find(p => p.type === t)?.value?.padStart(2, '0') ?? '00';
        const exdateStr = `EXDATE;TZID=America/New_York:${etDateCompact}T${get('hour')}${get('minute')}${get('second')}`;

        const event = await calendar.events.get({ calendarId, eventId: googleCalendarEventId });
        const currentRecurrence = event.data.recurrence ?? [];

        await calendar.events.patch({
            calendarId,
            eventId: googleCalendarEventId,
            requestBody: { recurrence: [...currentRecurrence, exdateStr] },
        });
        return true;
    } catch (error) {
        console.error("Google Calendar deleteCalendarOccurrence error:", error);
        return false;
    }
}

// Truncates a recurring Google Calendar event series so it ends before occurrenceISODate.
// occurrenceISODate: UTC ISO string representing the first occurrence to remove.
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
