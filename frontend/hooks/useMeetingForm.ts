import { useState } from 'react';
import { IMeeting, IRecurrencePattern } from '../util/models';
import { convertUTCToET, convertETToUTC } from '../util/timeUtils';
import { roomToZoomRoom } from '../util/rooms';

// Shared by NewMeeting.tsx and EditMeeting.tsx, so this state/validation/submit logic
// has one implementation instead of two copies that can quietly drift apart.

export const CAL_TYPE_OPTIONS = ["AA", "Al-Anon", "Other"];
export const CAL_TYPE_COLOR = "#CC3366";

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

export function useMeetingForm(initialMeeting?: IMeeting) {
    const [title, setTitle] = useState(initialMeeting?.title ?? "");
    const [mode, setMode] = useState<string>(initialMeeting?.modeType ?? "Hybrid");
    const [date, setDate] = useState<string>(
        initialMeeting ? formatDateForPicker(initialMeeting.startDateTime) : ""
    );
    const [time, setTime] = useState<string>(
        initialMeeting
            ? `${formatTimeForPicker(initialMeeting.startDateTime)} - ${formatTimeForPicker(initialMeeting.endDateTime)}`
            : ""
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
    const [zoomRoom, setZoomRoom] = useState(initialMeeting?.zoomAccount ?? "");
    const [isRecurring, setIsRecurring] = useState(!!initialMeeting?.recurrencePattern);
    const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(
        initialMeeting?.recurrencePattern ?? null
    );

    const handleRecurringMeetingChange = (data: {
        isRecurring: boolean;
        recurrencePattern: IRecurrencePattern | null;
    }) => {
        setIsRecurring(data.isRecurring);
        setRecurrencePattern(data.recurrencePattern);
    };

    const handleRoomChange = (value: string) => {
        setRoom(value);
        const zoom = roomToZoomRoom[value];
        if (zoom) setZoomRoom(zoom);
    };

    const handleModeSelect = (newMode: string) => {
        setMode(newMode);
        // Clear the fields the new mode doesn't use, so stale selections aren't submitted
        if (newMode === "In Person") setZoomRoom("");
        if (newMode === "Remote") setRoom("");
    };

    const handleCalTypeToggle = (type: string) => {
        setCalTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const resetForm = () => {
        setTitle("");
        setMode("Hybrid");
        setDate("");
        setTime("");
        setEmail("");
        setDescription("");
        setRoom("");
        setCalTypes([]);
        setZoomRoom("");
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

        if (mode === "Hybrid" && (!room || !zoomRoom)) {
            errors.push("Hybrid meetings require both a physical room and a Zoom room.");
        } else if (mode === "In Person" && !room) {
            errors.push("In Person meetings require a physical room.");
        } else if (mode === "Remote" && !zoomRoom) {
            errors.push("Remote meetings require a Zoom room.");
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
            zoomAccount: zoomRoom,
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
