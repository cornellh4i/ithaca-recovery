import { useCallback, useState } from 'react';
import { IMeeting, IRecurrencePattern } from '../types/models';
import { convertUTCToET, convertETToUTC, formatETDateString, getWeekDatesET, getCurrentETMinutesSinceMidnight } from '../util/date/timeUtils';
import { roomToZoomRoom } from '../util/rooms/rooms';
import { DESCRIPTION_MAX_LENGTH, MAX_RECURRENCE_OCCURRENCES } from '../util/meetings/meetingValidation';

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
export { DESCRIPTION_MAX_LENGTH, MAX_RECURRENCE_OCCURRENCES };

// Field keys a validation error can be attributed to -- lets FormValidationBanner report a
// live count of distinct fields needing fixing, not just a count of error messages (a single
// message can cover two fields, e.g. the Hybrid room/zoomRoom rule below).
export type MeetingFormField =
  | "title" | "date" | "time" | "email" | "calTypes" | "description" | "room" | "zoomRoom" | "recurrence";

export interface MeetingFormFieldError {
  fields: MeetingFormField[];
  message: string;
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// "MM/DD/YYYY" -> "YYYY-MM-DD" via string rearrangement, no Date round-trip — avoids the
// timezone bug where new Date("MM/DD/YYYY") + .toISOString() rolls the date back a day.
// Tolerates unpadded month/day: DatePicker's onChange can forward the user's raw typed text
// (e.g. "1/5/2026"), not just its zero-padded formatDate() output, and buildMeetingPayload
// treats a null return here as a silent save failure (see below).
function toISODate(dateString: string): string | null {
    const match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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

// Wraps convertETToUTC, returning null instead of throwing -- a DST spring-forward-gap time
// (e.g. 2:30 AM on the 2nd Sunday of March) has no valid ET instant. Shared by
// getValidationErrors (surfaces it as a normal field error) and buildMeetingPayload (a
// defensive fallback so a bad time can't throw during render via ZoomHostField's getCandidate(),
// which calls buildMeetingPayload directly, not just on submit).
function tryConvertETToUTC(etDateStr: string, etTimeStr: string): Date | null {
    try {
        return new Date(convertETToUTC(`${etDateStr}T${etTimeStr}`));
    } catch (err) {
        // Only convertETToUTC's own documented validation failures (all prefixed "convertETToUTC:")
        // mean "this input was invalid" -- anything else is unexpected and should propagate.
        if (err instanceof Error && err.message.startsWith('convertETToUTC:')) return null;
        throw err;
    }
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
    // Flips true on the first failed submit -- before that, FormValidationBanner stays hidden
    // even if fields are technically incomplete (nobody wants to see errors before they've
    // tried to save). Once true, liveValidationErrors below re-derives on every render, so the
    // banner's "Fix N fields" count updates live as each field is corrected.
    const [submitAttempted, setSubmitAttempted] = useState(false);
    // Which fields the user has focused into and back out of at least once -- an inline
    // per-field error only renders for a field in this set, so a field the user hasn't
    // reached yet doesn't show red before they've had a chance to fill it in.
    const [touchedFields, setTouchedFields] = useState<Set<MeetingFormField>>(new Set());
    const markFieldTouched = useCallback((field: MeetingFormField) => {
        setTouchedFields((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
    }, []);

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
        setSubmitAttempted(false);
        setTouchedFields(new Set());
    };

    const getValidationErrors = (): MeetingFormFieldError[] => {
        const errors: MeetingFormFieldError[] = [];

        if (!title.trim()) errors.push({ fields: ["title"], message: "Meeting title is required." });
        if (!date) errors.push({ fields: ["date"], message: "Date is required." });

        const [startTime, endTime] = time?.split(' - ') || [];
        if (!startTime || !endTime) {
            errors.push({ fields: ["time"], message: "Start and end time are required." });
        } else {
            const isoDateValue = toISODate(date);
            // A date/time combination that falls in the DST spring-forward gap (~2:00-2:59 AM
            // ET on the 2nd Sunday of March) has no valid ET instant -- surfaced here as a
            // normal, correctable validation error rather than buildMeetingPayload silently
            // returning null (or, before this check existed, throwing) on submit.
            if (isoDateValue && (!tryConvertETToUTC(isoDateValue, startTime) || !tryConvertETToUTC(isoDateValue, endTime))) {
                errors.push({
                    fields: ["date", "time"],
                    message: "This time doesn't exist due to the daylight saving time change in March — please pick a different time.",
                });
            }
        }

        if (!email.trim()) {
            errors.push({ fields: ["email"], message: "Email is required." });
        } else if (!isValidEmail(email)) {
            errors.push({ fields: ["email"], message: "Email must be a valid email address." });
        }

        if (calTypes.length === 0) errors.push({ fields: ["calTypes"], message: "At least one calendar type is required." });

        if (description.length > DESCRIPTION_MAX_LENGTH) {
            errors.push({
                fields: ["description"],
                message: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer (Zoom's limit) — currently ${description.length}.`,
            });
        }

        if (mode === "Hybrid" && (!room || !zoomRoom)) {
            errors.push({ fields: ["room", "zoomRoom"], message: "Hybrid meetings require both a physical room and a Zoom room." });
        } else if (mode === "In Person" && !room) {
            errors.push({ fields: ["room"], message: "In Person meetings require a physical room." });
        }

        if (isRecurring && recurrencePattern === null) {
            errors.push({ fields: ["recurrence"], message: "Recurrence details are required for recurring meetings." });
        } else if (
            isRecurring &&
            recurrencePattern?.numberOfOccurrences != null &&
            recurrencePattern.numberOfOccurrences > MAX_RECURRENCE_OCCURRENCES
        ) {
            // Mirrors meetingValidation.ts's server-side cap -- without this, RecurringMeeting.tsx's
            // own inline "occurrence(s)" message shows but doesn't block Create/Save, so submitting
            // a value above the cap silently 400s on the server instead.
            errors.push({
                fields: ["recurrence"],
                message: `Number of occurrences must be ${MAX_RECURRENCE_OCCURRENCES} or fewer.`,
            });
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

        const startDateTimeUTC = tryConvertETToUTC(isoDateValue, startTime);
        const endDateTimeUTC = tryConvertETToUTC(isoDateValue, endTime);
        if (!startDateTimeUTC || !endDateTimeUTC) {
            // getValidationErrors above should have already caught this and blocked submit --
            // this is the same defensive fallback as the two early returns above.
            console.error("Start/end time falls in the DST spring-forward gap and has no valid ET instant");
            return null;
        }

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

    // Recomputed every render rather than memoized -- the form has a handful of fields, so
    // re-running getValidationErrors() on each render is cheap, and memoizing would just
    // mean listing every field it reads as a dependency array.
    const liveValidationErrors = submitAttempted ? getValidationErrors() : [];

    // Independent of submitAttempted -- a field can show its own inline error the moment
    // it's been touched, even before any submit attempt (e.g. blurring an empty title on
    // the very first pass through the form).
    const getFieldError = (field: MeetingFormField): string | undefined => {
        if (!touchedFields.has(field)) return undefined;
        return getValidationErrors().find((error) => error.fields.includes(field))?.message;
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
        submitAttempted, setSubmitAttempted,
        liveValidationErrors,
        markFieldTouched,
        getFieldError,
    };
}
