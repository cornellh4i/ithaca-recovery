import { useCallback, useState } from 'react';
import { IMeeting, IRecurrencePattern } from '../types/models';
import { convertUTCToET, convertETToUTC, formatETDateString, getWeekDatesET, getCurrentETMinutesSinceMidnight } from '../util/date/timeUtils';
import { roomToZoomRoom } from '../util/rooms';
import { DESCRIPTION_MAX_LENGTH } from '../util/meetingValidation';

// What the calendar is currently showing, used to seed a brand-new meeting's default
// Date field -- see computeDefaultDate below.
export interface MeetingFormDefaultContext {
  selectedDate: Date;
  selectedView: string;
}

// Shared by NewMeeting.tsx and EditMeeting.tsx, so this state/validation/submit logic
// has one implementation instead of two copies that can quietly drift apart.

export const CAL_TYPE_OPTIONS = ["AA", "Al-Anon", "Other"];
export const CAL_TYPE_COLOR = "#CC3366";
export { DESCRIPTION_MAX_LENGTH };

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// "MM/DD/YYYY" -> "YYYY-MM-DD" via string rearrangement, no Date round-trip — avoids the
// timezone bug where new Date("MM/DD/YYYY") + .toISOString() rolls the date back a day.
function toISODate(dateString: string): string | null {
    const match = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, month, day, year] = match;
    return `${year}-${month}-${day}`;
}

// Formats a UTC Date into ET wall-clock "MM/DD/YYYY" / "HH:MM", for seeding edit-form initial values.
function formatDateForPicker(date: Date): string {
    const etDateString = convertUTCToET(new Date(date).toUTCString());
    const dateMatch = etDateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return dateMatch ? `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : '';
}

function formatTimeForPicker(date: Date): string {
    const etDateString = convertUTCToET(new Date(date).toUTCString());
    const timeMatch = etDateString.match(/(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)/i);
    if (!timeMatch) return '';
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const ampm = timeMatch[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// "YYYY-MM-DD" -> "MM/DD/YYYY", the inverse of toISODate above.
function isoToPickerDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${month}/${day}/${year}`;
}

// "YYYY-MM-DD" -> the next calendar day's "YYYY-MM-DD". Uses Date.UTC purely as a calendar
// calculator (not a timezone conversion) so month/year rollovers are handled for free.
function addOneDayISO(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    const y = next.getUTCFullYear();
    const m = (next.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = next.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Default Date for a brand-new meeting, based on what the calendar is currently showing:
// Day View defaults to the day being viewed; Week View defaults to today (ET) if the
// displayed week is the real current week, otherwise to that week's first day (Sunday) --
// there's no single obviously-right day to default to when browsing a week that isn't
// the current one. `rolledToNextDay` (from computeDefaultTime) bumps only the "today"-derived
// branches by a day -- explicit non-today selections (a different Day-view date, or a
// non-current week's Sunday) are left alone, since those weren't derived from "now".
function computeDefaultDate(context?: MeetingFormDefaultContext, rolledToNextDay = false): string {
    const todayET = formatETDateString(new Date());
    const advance = (iso: string) => (rolledToNextDay ? addOneDayISO(iso) : iso);

    if (!context) return isoToPickerDate(advance(todayET));

    const selectedET = formatETDateString(context.selectedDate);
    if (context.selectedView === "Day") {
        return isoToPickerDate(selectedET === todayET ? advance(selectedET) : selectedET);
    }

    const displayedWeek = getWeekDatesET(selectedET);
    const isCurrentWeek = displayedWeek.includes(todayET);
    return isoToPickerDate(isCurrentWeek ? advance(todayET) : displayedWeek[0]);
}

// Default Time for a brand-new meeting: starts on the next ET half-hour slot (e.g. 2:10
// -> 2:30, 2:40 -> 3:00; always advances even if already exactly on a slot), ends an hour
// after that. `rolledToNextDay` reports whether that rounding wrapped past midnight ET
// (e.g. 23:45 -> "00:00"), so computeDefaultDate can advance the date to match.
function computeDefaultTime(): { time: string; rolledToNextDay: boolean } {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toHHMM = (minutesSinceMidnight: number) =>
        `${pad(Math.floor(minutesSinceMidnight / 60))}:${pad(minutesSinceMidnight % 60)}`;

    const MINUTES_PER_DAY = 24 * 60;
    const nowMinutes = getCurrentETMinutesSinceMidnight();
    const startMinutes = (Math.floor(nowMinutes / 30) * 30 + 30) % MINUTES_PER_DAY;
    const endMinutes = (startMinutes + 60) % MINUTES_PER_DAY;
    return {
        time: `${toHHMM(startMinutes)} - ${toHHMM(endMinutes)}`,
        rolledToNextDay: startMinutes < nowMinutes,
    };
}

export function useMeetingForm(initialMeeting?: IMeeting, defaultContext?: MeetingFormDefaultContext) {
    const [title, setTitle] = useState(initialMeeting?.title ?? "");
    const [mode, setMode] = useState<string>(initialMeeting?.modeType ?? "Hybrid");
    // Computed once per render (not just on mount) so the date and time defaults below agree
    // on the same rolledToNextDay snapshot -- see computeDefaultTime's doc comment.
    const defaultTimeInfo = initialMeeting ? null : computeDefaultTime();
    const [date, setDate] = useState<string>(() =>
        initialMeeting
            ? formatDateForPicker(initialMeeting.startDateTime)
            : computeDefaultDate(defaultContext, defaultTimeInfo!.rolledToNextDay)
    );
    const [time, setTime] = useState<string>(() =>
        initialMeeting
            ? `${formatTimeForPicker(initialMeeting.startDateTime)} - ${formatTimeForPicker(initialMeeting.endDateTime)}`
            : defaultTimeInfo!.time
    );
    const [email, setEmail] = useState(initialMeeting?.email ?? "");
    const [description, setDescription] = useState(initialMeeting?.description ?? "");
    const [room, setRoom] = useState(initialMeeting?.room ?? "");
    const [calTypes, setCalTypes] = useState<string[]>(
        initialMeeting
            ? Array.isArray(initialMeeting.calType)
                ? initialMeeting.calType
                : initialMeeting.calType ? [initialMeeting.calType as unknown as string] : []
            : []
    );
    // Every existing Remote meeting today has a non-null zoomRoom (the old rules required
    // it), but Remote no longer collects/shows this field -- don't resubmit a stale value
    // the new UI can't display or let the user clear.
    const [zoomRoom, setZoomRoom] = useState(
        initialMeeting?.modeType === "Remote" ? "" : (initialMeeting?.zoomRoom ?? "")
    );
    const [zoomHost, setZoomHost] = useState(initialMeeting?.zoomHost ?? "");
    const [isRecurring, setIsRecurring] = useState(!!initialMeeting?.recurrencePattern);
    const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(
        initialMeeting?.recurrencePattern ?? null
    );

    // Must be stable: RecurringMeeting.tsx's effect depends on this callback, and an
    // unstable reference here caused an infinite render loop.
    const handleRecurringMeetingChange = useCallback((data: {
        isRecurring: boolean;
        recurrencePattern: IRecurrencePattern | null;
    }) => {
        setIsRecurring(data.isRecurring);
        setRecurrencePattern(data.recurrencePattern);
    }, []);

    const handleRoomChange = (value: string) => {
        setRoom(value);
        // In Person meetings never carry a Zoom room — the auto-pairing is only for Hybrid
        if (mode === "In Person") return;
        const zoom = roomToZoomRoom[value];
        if (zoom) setZoomRoom(zoom);
    };

    const handleModeSelect = (newMode: string) => {
        setMode(newMode);
        // Clear the fields the new mode doesn't use, so stale selections aren't submitted
        if (newMode === "In Person") { setZoomRoom(""); setZoomHost(""); }
        if (newMode === "Remote") { setRoom(""); setZoomRoom(""); }
    };

    const handleCalTypeToggle = (type: string) => {
        setCalTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const resetForm = () => {
        setTitle("");
        setMode("Hybrid");
        const resetTimeInfo = computeDefaultTime();
        setDate(computeDefaultDate(defaultContext, resetTimeInfo.rolledToNextDay));
        setTime(resetTimeInfo.time);
        setEmail("");
        setDescription("");
        setRoom("");
        setCalTypes([]);
        setZoomRoom("");
        setZoomHost("");
        setIsRecurring(false);
        setRecurrencePattern(null);
    };

    const getValidationErrors = (): string[] => {
        const errors: string[] = [];

        if (!title.trim()) errors.push("Meeting title is required.");
        if (!date) errors.push("Date is required.");

        const [startTime, endTime] = time?.split(' - ') || [];
        if (!startTime || !endTime) errors.push("Start and end time are required.");

        if (!email.trim()) {
            errors.push("Email is required.");
        } else if (!isValidEmail(email)) {
            errors.push("Email must be a valid email address.");
        }

        if (calTypes.length === 0) errors.push("At least one calendar type is required.");

        if (description.length > DESCRIPTION_MAX_LENGTH) {
            errors.push(`Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer (Zoom's limit) — currently ${description.length}.`);
        }

        if (mode === "Hybrid" && (!room || !zoomRoom)) {
            errors.push("Hybrid meetings require both a physical room and a Zoom room.");
        } else if (mode === "In Person" && !room) {
            errors.push("In Person meetings require a physical room.");
        }

        if (isRecurring && recurrencePattern === null) {
            errors.push("Recurrence details are required for recurring meetings.");
        }

        return errors;
    };

    // Builds the shared IMeeting payload, bumping an overnight end date forward a day.
    // recurrencePattern is passed through unmodified — its startDate is already
    // ET-midnight-anchored upstream. Returns null if unparseable (defensive fallback;
    // callers should call getValidationErrors() first).
    const buildMeetingPayload = (mid: string, status: string): IMeeting | null => {
        const isoDateValue = toISODate(date);
        if (!isoDateValue) {
            console.error("Failed to convert dateValue to ISO format");
            return null;
        }

        const [startTime, endTime] = time?.split(' - ') || [];
        if (!startTime || !endTime) {
            console.error("Invalid timeValue format");
            return null;
        }

        const startDateTimeUTC = new Date(convertETToUTC(`${isoDateValue}T${startTime}`));
        const endDateTimeUTC = new Date(convertETToUTC(`${isoDateValue}T${endTime}`));

        if (endDateTimeUTC <= startDateTimeUTC) {
            endDateTimeUTC.setUTCDate(endDateTimeUTC.getUTCDate() + 1);
        }

        const payload: IMeeting = {
            mid,
            title,
            modeType: mode,
            description,
            creator: 'Creator',
            group: 'Group',
            startDateTime: startDateTimeUTC,
            endDateTime: endDateTimeUTC,
            email,
            zoomRoom,
            zoomHost: zoomHost || null,
            calType: calTypes,
            status,
            room,
            isRecurring,
        };

        if (isRecurring && recurrencePattern) {
            payload.recurrencePattern = recurrencePattern;
        }

        return payload;
    };

    return {
        title, setTitle,
        mode, setMode,
        date, setDate,
        time, setTime,
        email, setEmail,
        description, setDescription,
        room, setRoom,
        calTypes, setCalTypes,
        zoomRoom, setZoomRoom,
        zoomHost, setZoomHost,
        isRecurring, setIsRecurring,
        recurrencePattern, setRecurrencePattern,
        handleRecurringMeetingChange,
        handleRoomChange,
        handleModeSelect,
        handleCalTypeToggle,
        resetForm,
        getValidationErrors,
        buildMeetingPayload,
    };
}
