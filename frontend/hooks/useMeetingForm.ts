import { useCallback, useEffect, useRef, useState } from 'react';
import { IMeeting, IRecurrencePattern } from '../types/models';
import { convertUTCToET, convertETToUTC, formatETDateString, getWeekDatesET, getCurrentETMinutesSinceMidnight, isConvertETToUTCValidationError, isDstGapError } from '../util/date/timeUtils';
import { roomToZoomRoom } from '../util/rooms/rooms';
import {
    DESCRIPTION_MAX_LENGTH,
    MAX_RECURRENCE_OCCURRENCES,
    isOvernightTimeRange,
    validateTimeRange,
} from '../util/meetings/meetingValidation';

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

// Wraps convertETToUTC, returning null instead of throwing -- e.g. a DST spring-forward-gap
// time (2:30 AM on the 2nd Sunday of March) has no valid ET instant, same as toISODate's own
// string rearrangement not calendar-validating a typed "02/30/2026". Used by buildMeetingPayload
// as a defensive fallback so a bad date/time can't throw during render via ZoomHostField's
// getCandidate(), which calls buildMeetingPayload directly, not just on submit. getValidationErrors
// below uses describeTimeValidationError instead, since it needs to know *which* failure this was
// to show the right message -- this wrapper only needs "did it fail," not "why."
function tryConvertETToUTC(etDateStr: string, etTimeStr: string): Date | null {
    try {
        return new Date(convertETToUTC(`${etDateStr}T${etTimeStr}`));
    } catch (err) {
        // Only convertETToUTC's own documented validation failures mean "this input was invalid"
        // -- anything else is unexpected and should propagate.
        if (isConvertETToUTCValidationError(err)) return null;
        throw err;
    }
}

// Distinguishes convertETToUTC's failure modes so getValidationErrors can show a message that
// actually matches what's wrong, instead of always blaming DST -- e.g. typing "02/30/2026" round-
// trips through toISODate (plain string rearrangement, no calendar validation) and fails
// convertETToUTC's calendar-date check, not its DST-gap one. Returns null if both times convert
// cleanly.
function describeTimeValidationError(etDateStr: string, startTime: string, endTime: string): string | null {
    for (const etTimeStr of [startTime, endTime]) {
        try {
            convertETToUTC(`${etDateStr}T${etTimeStr}`);
        } catch (err) {
            if (isDstGapError(err)) {
                return "This time doesn't exist due to the daylight saving time change in March — please pick a different time.";
            }
            if (isConvertETToUTCValidationError(err)) {
                return "This isn't a valid date — please check the day and month.";
            }
            throw err;
        }
    }
    return null;
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

// Comparable stringification of everything the form collects outside the recurrence
// sub-form, for the unsaved-changes guard. calTypes is order-insensitive (the checkboxes
// append in click order), so unchecking and rechecking a category isn't an "edit".
function snapshotFields(values: {
    title: string; mode: string; date: string; time: string; email: string;
    description: string; room: string; calTypes: string[]; zoomRoom: string; zoomHost: string;
}): string {
    return JSON.stringify({ ...values, calTypes: [...values.calTypes].sort() });
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
    // Snapshot of the Date field's own opening value, separate from fieldBaseline's combined
    // snapshot -- EditMeeting.tsx needs to know specifically whether the *date* was touched
    // (not just "something changed") to decide whether a scoped save should re-anchor onto the
    // clicked occurrence or respect the user's explicit date edit. Set once, like fieldBaseline.
    const [dateBaseline, setDateBaseline] = useState(date);
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

    // Recurrence is tracked for dirtiness by comparing against RecurringMeeting.tsx's report
    // rather than against initialMeeting.recurrencePattern: that child rebuilds the pattern
    // object from its own state on mount, so the rebuilt shape can differ from the stored one
    // field-for-field while describing the same recurrence.
    const [recurrenceBaseline, setRecurrenceBaseline] = useState<string | null>(null);
    const [recurrenceSignature, setRecurrenceSignature] = useState<string | null>(null);
    // RecurringMeeting.tsx's mount can report MORE than once with no user input at all: e.g. a
    // stored pattern with an empty daysOfWeek (a real, persisted shape -- not just a test
    // fixture) makes its own "seed a default weekday" effect fire a *second*, self-corrected
    // report right after its first. Locking the baseline onto that first (pre-correction) report
    // would read the self-correction itself as a user edit -- false-positive dirty/disabled-
    // 'This event' for a meeting nobody touched. Instead, the baseline keeps tracking the latest
    // report for a brief settling window after mount (these cascades are synchronous React state
    // updates with no real async gap, so they always finish well within one macrotask, long
    // before a user could physically interact) and only freezes once that window closes.
    const recurrenceSettlingRef = useRef(true);
    useEffect(() => {
        const settleId = setTimeout(() => { recurrenceSettlingRef.current = false; }, 0);
        return () => clearTimeout(settleId);
    }, []);
    // Baseline for the unsaved-changes guard, seeded from the values the form opened with
    // rather than re-derived from initialMeeting -- a brand-new form's computed date/time
    // defaults count as untouched too.
    const [fieldBaseline, setFieldBaseline] = useState(() =>
        snapshotFields({ title, mode, date, time, email, description, room, calTypes, zoomRoom, zoomHost })
    );

    // Must be stable: RecurringMeeting.tsx's effect depends on this callback, and an
    // unstable reference here caused an infinite render loop.
    const handleRecurringMeetingChange = useCallback((data: {
        isRecurring: boolean;
        recurrencePattern: IRecurrencePattern | null;
    }) => {
        setIsRecurring(data.isRecurring);
        setRecurrencePattern(data.recurrencePattern);
        const signature = JSON.stringify(data);
        setRecurrenceSignature(signature);
        // While still settling, every report becomes the new baseline (see
        // recurrenceSettlingRef's comment above) -- once the window closes, only the first
        // baseline value stands and subsequent reports are real, comparable edits.
        setRecurrenceBaseline((previous) =>
            recurrenceSettlingRef.current || previous === null ? signature : previous
        );
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
        const resetTimeInfo = computeDefaultTime();
        const resetValues = {
            title: "",
            mode: "Hybrid",
            date: computeDefaultDate(defaultContext, resetTimeInfo.rolledToNextDay),
            time: resetTimeInfo.time,
            email: "",
            description: "",
            room: "",
            calTypes: [] as string[],
            zoomRoom: "",
            zoomHost: "",
        };
        setTitle(resetValues.title);
        setMode(resetValues.mode);
        setDate(resetValues.date);
        setTime(resetValues.time);
        setEmail(resetValues.email);
        setDescription(resetValues.description);
        setRoom(resetValues.room);
        setCalTypes(resetValues.calTypes);
        setZoomRoom(resetValues.zoomRoom);
        setZoomHost(resetValues.zoomHost);
        setIsRecurring(false);
        setRecurrencePattern(null);
        setSubmitAttempted(false);
        setTouchedFields(new Set());
        // A reset form reads as untouched again -- rebaseline rather than leaving the values
        // it opened with as the comparison point.
        setFieldBaseline(snapshotFields(resetValues));
        setDateBaseline(resetValues.date);
        setRecurrenceBaseline(null);
        setRecurrenceSignature(null);
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
            // Catches both an invalid calendar date (e.g. typed "02/30/2026" -- toISODate is
            // plain string rearrangement, no calendar validation) and a DST spring-forward-gap
            // time -- surfaced here as a normal, correctable validation error rather than
            // buildMeetingPayload silently returning null (or, before this check existed,
            // throwing) on submit.
            const timeError = isoDateValue ? describeTimeValidationError(isoDateValue, startTime, endTime) : null;
            if (timeError) errors.push({ fields: ["date", "time"], message: timeError });

            const rangeError = validateTimeRange(startTime, endTime);
            if (rangeError) errors.push({ fields: ["time"], message: rangeError });
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
            console.error("Start/end date or time is invalid and has no valid ET instant (calendar-invalid date or DST spring-forward gap)");
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

    const [currentStartTime, currentEndTime] = time?.split(' - ') || [];
    // Not gated on touchedFields like getFieldError is: both times always hold a value (the
    // form seeds defaults), so there's no "hasn't been reached yet" state to protect here.
    const timeRangeError =
        currentStartTime && currentEndTime ? validateTimeRange(currentStartTime, currentEndTime) : null;
    const isOvernight =
        !!currentStartTime && !!currentEndTime && isOvernightTimeRange(currentStartTime, currentEndTime);

    // Exposed separately from isDirty below -- EditRecurringModal disables its "This event"
    // option specifically when recurrence settings changed (the server 400s recurrencePattern
    // under scope 'this'), not for any other field edit.
    const isRecurrenceDirty = recurrenceSignature !== null && recurrenceSignature !== recurrenceBaseline;

    // Exposed separately too -- EditMeeting.tsx's scoped-save re-anchoring needs to know
    // specifically whether the Date field itself was hand-edited: the edit form seeds its Date
    // from the series' anchor row (retrieve/meeting/[id] returns the master row), not the
    // clicked occurrence, so an untouched Date field is re-anchored onto the occurrence date
    // while an edited one is respected as the user's explicit choice.
    const isDateDirty = date !== dateBaseline;

    const isDirty =
        snapshotFields({ title, mode, date, time, email, description, room, calTypes, zoomRoom, zoomHost }) !== fieldBaseline ||
        isRecurrenceDirty;

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
        timeRangeError,
        isOvernight,
        isDirty,
        isRecurrenceDirty,
        isDateDirty,
        markFieldTouched,
        getFieldError,
    };
}
