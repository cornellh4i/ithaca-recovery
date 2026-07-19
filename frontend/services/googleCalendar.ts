import "server-only";
import { google } from "googleapis";
import { IMeeting, IRecurrencePattern } from "../util/models";
import { getETDayBounds, convertETToUTC } from "../util/timeUtils";

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

const MEETING_LOCATION_URL =
    "https://maps.google.com/maps?hl=en&q=518%20W%20Seneca%20St%2C%20Ithaca%2C%20NY%2014850%2C%20USA";

function buildEventTitle(meeting: IMeeting): string {
    const suffix = modeTitleSuffix[meeting.modeType];
    return suffix ? `${meeting.title} - ${suffix}` : meeting.title;
}

// locationOverride: Zoom Room calendars pass the join link here — Zoom Rooms detects a
// joinable meeting from the location field, not the description.
function buildEventBody(meeting: IMeeting, locationOverride?: string) {
    const descriptionLines = [
        meeting.description,
        meeting.calType?.length ? `Type: ${meeting.calType.join(', ')}` : null,
        meeting.modeType ? `Mode: ${meeting.modeType}` : null,
        meeting.room ? `Room: ${meeting.room}` : null,
        meeting.zoomLink ? `Zoom: ${meeting.zoomLink}` : null,
    ].filter(Boolean);

    const event: Record<string, unknown> = {
        summary: buildEventTitle(meeting),
        description: descriptionLines.join("\n"),
        location: locationOverride ?? MEETING_LOCATION_URL,
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
): Promise<string | null> {
    try {
        const calendar = getCalendarClient(accessToken);
        const res = await calendar.events.insert({
            calendarId,
            requestBody: buildEventBody(meeting, locationOverride),
        });
        return res.data.id ?? null;
    } catch (error) {
        console.error("Google Calendar createEvent error:", error);
        return null;
    }
}

export async function updateCalendarEvent(
    accessToken: string,
    googleCalendarEventId: string,
    meeting: IMeeting,
    calendarId: string,
    locationOverride?: string,
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);
        await calendar.events.update({
            calendarId,
            eventId: googleCalendarEventId,
            requestBody: buildEventBody(meeting, locationOverride),
        });
        return true;
    } catch (error) {
        console.error("Google Calendar updateEvent error:", error);
        return false;
    }
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
