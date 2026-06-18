import "server-only";
import { google } from "googleapis";
import { IMeeting, IRecurrencePattern } from "../util/models";
import { getETDayBounds } from "../util/timeUtils";

const CALENDAR_ID = process.env.GOOGLE_MASTER_CALENDAR_ID!;

function getCalendarClient(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.calendar({ version: "v3", auth });
}

function toRRule(pattern: IRecurrencePattern): string {
    const dayMap: Record<string, string> = {
        Sunday: "SU", Monday: "MO", Tuesday: "TU", Wednesday: "WE",
        Thursday: "TH", Friday: "FR", Saturday: "SA",
    };

    const byDay = (pattern.daysOfWeek ?? []).map((d) => dayMap[d]).join(",");
    const freq = `FREQ=WEEKLY;INTERVAL=${pattern.interval}`;
    const byday = byDay ? `;BYDAY=${byDay}` : "";

    if (pattern.numberOfOccurrences) {
        return `RRULE:${freq}${byday};COUNT=${pattern.numberOfOccurrences}`;
    }
    if (pattern.endDate) {
        const until = new Date(pattern.endDate)
            .toISOString()
            .replace(/[-:]/g, "")
            .split(".")[0] + "Z";
        return `RRULE:${freq}${byday};UNTIL=${until}`;
    }
    return `RRULE:${freq}${byday}`;
}

function buildEventBody(meeting: IMeeting) {
    const descriptionLines = [
        meeting.description,
        `Type: ${meeting.calType}`,
        `Mode: ${meeting.modeType}`,
        meeting.room ? `Room: ${meeting.room}` : null,
        meeting.zoomLink ? `Zoom: ${meeting.zoomLink}` : null,
    ].filter(Boolean);

    const event: Record<string, unknown> = {
        summary: meeting.title,
        description: descriptionLines.join("\n"),
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
    meeting: IMeeting
): Promise<string | null> {
    try {
        const calendar = getCalendarClient(accessToken);
        const res = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: buildEventBody(meeting),
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
    meeting: IMeeting
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);
        await calendar.events.update({
            calendarId: CALENDAR_ID,
            eventId: googleCalendarEventId,
            requestBody: buildEventBody(meeting),
        });
        return true;
    } catch (error) {
        console.error("Google Calendar updateEvent error:", error);
        return false;
    }
}

export async function deleteCalendarEvent(
    accessToken: string,
    googleCalendarEventId: string
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);
        await calendar.events.delete({
            calendarId: CALENDAR_ID,
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

        const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: googleCalendarEventId });
        const currentRecurrence = event.data.recurrence ?? [];

        await calendar.events.patch({
            calendarId: CALENDAR_ID,
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
): Promise<boolean> {
    try {
        const calendar = getCalendarClient(accessToken);

        // UNTIL = 1ms before the UTC start of the occurrence's ET day
        const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date(occurrenceISODate));
        const [occurrenceUTCStart] = getETDayBounds(etDate);
        const untilStr = new Date(occurrenceUTCStart.getTime() - 1)
            .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: googleCalendarEventId });
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
            calendarId: CALENDAR_ID,
            eventId: googleCalendarEventId,
            requestBody: { recurrence: updatedRecurrence },
        });
        return true;
    } catch (error) {
        console.error("Google Calendar trimCalendarEventSeries error:", error);
        return false;
    }
}

export async function listChangedEvents(
    accessToken: string,
    updatedMin: Date
): Promise<{ id: string; status: string; summary?: string; start?: string; end?: string; description?: string }[]> {
    try {
        const calendar = getCalendarClient(accessToken);
        const res = await calendar.events.list({
            calendarId: CALENDAR_ID,
            updatedMin: updatedMin.toISOString(),
            showDeleted: true,
            singleEvents: false,
        });
        return (res.data.items ?? []).map((e) => ({
            id: e.id ?? "",
            status: e.status ?? "",
            summary: e.summary ?? undefined,
            start: e.start?.dateTime ?? e.start?.date ?? undefined,
            end: e.end?.dateTime ?? e.end?.date ?? undefined,
            description: e.description ?? undefined,
        }));
    } catch (error) {
        console.error("Google Calendar listChangedEvents error:", error);
        return [];
    }
}
