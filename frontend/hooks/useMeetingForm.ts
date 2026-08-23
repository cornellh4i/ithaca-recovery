import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { IMeeting, IRecurrencePattern } from '../types/models';
import { convertUTCToET, convertETToUTC, formatETDateString, getWeekDatesET, getCurrentETMinutesSinceMidnight, isConvertETToUTCValidationError, isDstGapError } from '../util/date/timeUtils';
import { roomToZoomRoom } from '../util/rooms/rooms';
import { modeFieldVisibility } from '../util/rooms/modeFields';
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
  | "title" | "date" | "time" | "email" | "calTypes" | "description" | "room" | "zoomRoom" | "recurrence"
  | "linkedSchedule";

export interface MeetingFormFieldError {
  fields: MeetingFormField[];
  message: string;
}

/**
 * A second schedule being composed in this form session: a different mode on other weekdays,
 * served by the same meeting and its one Zoom meeting (util/meetings/linkedSchedules.ts).
 *
 * Everything the two schedules must agree on -- time of day, duration, interval, where the
 * series ends -- is deliberately absent: it is derived server-side from this meeting, because a
 * family whose rows disagree on any of it has no single-series representation on Zoom.
 *
 * Local until the form's own submit carries it: nothing about a draft round-trips on its own.
 */
export interface LinkedScheduleDraft {
  // Client-generated up front, like NewMeeting's own mid, so both rows are known before the write.
  mid: string;
  modeType: string;
  /** Full weekday names, as a recurrence pattern stores them. */
  daysOfWeek: string[];
  room: string;
  zoomRoom: string;
}

/** The `linkedSchedule` block the write/update routes parse (linkedScheduleBlockSchema). */
export interface LinkedSchedulePayload {
  mid: string;
  modeType: string;
  room: string | null;
  zoomRoom: string | null;
  recurrencePattern: IRecurrencePattern;
}

/** What the form submits: the meeting, plus the second schedule to create alongside it. */
export type MeetingFormPayload = IMeeting & { linkedSchedule?: LinkedSchedulePayload };

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
    // Snapshot of the Mode the form opened with -- EditRecurringModal gates scoped saves
    // ('this'/'thisAndFollowing') on this: the server always applies a mode change to the whole
    // series (400s a scoped save with a changed modeType), so a changed Mode disables both
    // scoped options rather than silently discarding the user's choice. Same pattern as
    // dateBaseline below.
    const [modeBaseline, setModeBaseline] = useState(mode);
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
    // Snapshot of the Zoom Host the form opened with -- same gating role as modeBaseline above.
    // The server 400s a scoped save's host change (a non-empty host that case-insensitively
    // differs from the parent's), so comparisons below match that case-insensitive rule exactly
    // rather than a strict string diff.
    const [zoomHostBaseline, setZoomHostBaseline] = useState(zoomHost);
    const [isRecurring, setIsRecurring] = useState(!!initialMeeting?.recurrencePattern);
    const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(
        initialMeeting?.recurrencePattern ?? null
    );
    // Whether the admin has confirmed this meeting's own schedule ("Done"), collapsing the
    // recurrence editor into a read-only card so a second schedule can be added beside it. Purely
    // a display state -- it gates nothing about what gets submitted.
    const [isScheduleConfirmed, setIsScheduleConfirmed] = useState(false);
    // The second schedule being composed, if any. Never more than one: a meeting runs at most
    // LINKED_SCHEDULE_CAP schedules, and the create form only ever adds the second.
    const [linkedDraft, setLinkedDraft] = useState<LinkedScheduleDraft | null>(null);
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
        // recurrencePattern.startDate is excluded from the dirty-comparison signature below --
        // RecurringMeetingForm rebuilds it from this hook's own `date` field on every Date-field
        // edit (its main effect depends on the `startDate` prop), so it shifts every time
        // regardless of whether the user touched any actual recurrence setting. Counting it here
        // would make editing only the Date field also trip isRecurrenceDirty, disabling 'this'
        // in EditRecurringModal on top of isDateDirty's own (correct, narrower) 'thisAndFollowing'-
        // only gate. The real recurrencePattern state above is untouched -- buildMeetingPayload
        // still submits its actual startDate; only this comparison ignores it.
        const comparableData = {
            ...data,
            recurrencePattern: data.recurrencePattern
                ? { ...data.recurrencePattern, startDate: undefined }
                : null,
        };
        const signature = JSON.stringify(comparableData);
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

    // Mirrors handleModeSelect's own clearing rule for the draft: a mode that doesn't use a field
    // must not carry a stale value into the payload.
    const startLinkedDraft = (modeType: string) => {
        setLinkedDraft({ mid: uuidv4(), modeType, daysOfWeek: [], room: "", zoomRoom: "" });
    };

    const updateLinkedDraft = (patch: Partial<Omit<LinkedScheduleDraft, "mid">>) => {
        setLinkedDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    };

    const selectLinkedDraftMode = (modeType: string) => {
        setLinkedDraft((prev) => {
            if (!prev) return prev;
            const cleared = {
                ...prev,
                modeType,
                room: modeType === "Remote" ? "" : prev.room,
                zoomRoom: modeType === "Hybrid" ? prev.zoomRoom : "",
            };
            return cleared;
        });
    };

    const selectLinkedDraftRoom = (value: string) => {
        setLinkedDraft((prev) => {
            if (!prev) return prev;
            // Same auto-pairing handleRoomChange does for the meeting's own room, and the same
            // exception: an In Person schedule never carries a Zoom room.
            const zoom = prev.modeType === "In Person" ? prev.zoomRoom : roomToZoomRoom[value];
            return { ...prev, room: value, zoomRoom: zoom ?? prev.zoomRoom };
        });
    };

    const toggleLinkedDraftDay = (day: string) => {
        setLinkedDraft((prev) => {
            if (!prev) return prev;
            const daysOfWeek = prev.daysOfWeek.includes(day)
                ? prev.daysOfWeek.filter((selected) => selected !== day)
                : [...prev.daysOfWeek, day];
            return { ...prev, daysOfWeek };
        });
    };

    const discardLinkedDraft = () => setLinkedDraft(null);

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
        setIsScheduleConfirmed(false);
        setLinkedDraft(null);
        // A reset form reads as untouched again -- rebaseline rather than leaving the values
        // it opened with as the comparison point.
        setFieldBaseline(snapshotFields(resetValues));
        setDateBaseline(resetValues.date);
        setModeBaseline(resetValues.mode);
        setZoomHostBaseline(resetValues.zoomHost);
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

        if (linkedDraft) {
            const linked = (message: string) => errors.push({ fields: ["linkedSchedule"], message });
            // The server derives the linked schedule's whole series from this one, so the meeting
            // itself has to be a weekly series for there to be anything to derive from.
            if (!isRecurring || recurrencePattern?.type !== "weekly") {
                linked("A linked schedule can only be added to a weekly recurring meeting.");
            }
            if (linkedDraft.modeType === mode) {
                linked("The linked schedule must use a different mode from this meeting's own.");
            }
            if (linkedDraft.daysOfWeek.length === 0) {
                linked("Choose at least one day for the linked schedule.");
            }
            // Disjoint weekdays are a hard requirement, not a preference: Zoom holds both
            // schedules as ONE union of weekdays (util/meetings/linkedSchedules.ts), so a day
            // claimed twice would silently collapse into a single occurrence. Re-checked here
            // rather than relying on the day picker's disabled state alone, since editing this
            // meeting's own days after composing the draft can create the overlap.
            const claimed = recurrencePattern?.daysOfWeek ?? [];
            const overlap = linkedDraft.daysOfWeek.filter((day) => claimed.includes(day));
            if (overlap.length > 0) {
                linked(`The linked schedule can't meet on ${overlap.join(", ")} — this meeting already does.`);
            }
            if (linkedDraft.modeType === "Hybrid" && (!linkedDraft.room || !linkedDraft.zoomRoom)) {
                linked("The linked Hybrid schedule requires both a physical room and a Zoom room.");
            } else if (linkedDraft.modeType === "In Person" && !linkedDraft.room) {
                linked("The linked In Person schedule requires a physical room.");
            }
        }

        return errors;
    };

    // Builds the shared IMeeting payload, bumping an overnight end date forward a day.
    // recurrencePattern is passed through unmodified — its startDate is already
    // ET-midnight-anchored upstream. Returns null if unparseable (defensive fallback;
    // callers should call getValidationErrors() first).
    const buildMeetingPayload = (
        mid: string,
        status: string,
        // Opt-in so the payload ZoomHostField builds for its availability check (which is about
        // this meeting's own occurrences) never carries a second schedule with it.
        options?: { withLinkedSchedule?: boolean },
    ): MeetingFormPayload | null => {
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

        const payload: MeetingFormPayload = {
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

        // Attached the same way recurrencePattern is: only when there's actually one to send. The
        // pattern here carries the linked schedule's own weekdays and inherits this meeting's
        // interval and week phase; its dates and end condition are re-derived server-side from
        // this meeting, whatever is sent (linkedScheduleBlockSchema).
        if (options?.withLinkedSchedule && linkedDraft && isRecurring && recurrencePattern) {
            // INVARIANT: only the fields the chosen mode actually uses are sent. The draft's
            // Room / Zoom room dropdowns stay mounted for every mode still selectable (the
            // superset modeFieldVisibility returns for ModeFields), so a value picked under one
            // mode survives a later switch to a mode that doesn't use it -- a Remote schedule
            // holding a room would be advisory-locked, conflict-checked and published on it.
            const linkedFields = modeFieldVisibility([linkedDraft.modeType]);
            payload.linkedSchedule = {
                mid: linkedDraft.mid,
                modeType: linkedDraft.modeType,
                room: linkedFields.room ? linkedDraft.room || null : null,
                zoomRoom: linkedFields.zoomRoom ? linkedDraft.zoomRoom || null : null,
                recurrencePattern: {
                    ...recurrencePattern,
                    mid: linkedDraft.mid,
                    type: "weekly",
                    daysOfWeek: linkedDraft.daysOfWeek,
                    weekOfMonth: null,
                    dayOfMonth: null,
                    excludedDates: [],
                },
            };
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

    // Exposed for the same reason as isDateDirty -- EditRecurringModal disables scoped saves
    // ('this'/'thisAndFollowing') entirely when Mode changed, mirroring the server's own rule.
    const isModeDirty = mode !== modeBaseline;

    // Mirrors the server's exact scoped-edit host rule (update/meeting route): a non-empty
    // Zoom Host that case-insensitively differs from the parent's is a real host change: a
    // blank/omitted host, or resubmitting the parent's own host in any casing, is not.
    const isHostDirty =
        zoomHost.trim() !== "" && zoomHost.trim().toLowerCase() !== zoomHostBaseline.trim().toLowerCase();

    // Just this meeting's own fields -- EditMeeting needs it separately from isDirty below,
    // because the update route refuses to apply an edit to the meeting and add a linked schedule
    // in one request (they're two writes) and so gates the "Add another mode" trigger on it.
    const isAnchorDirty =
        snapshotFields({ title, mode, date, time, email, description, room, calTypes, zoomRoom, zoomHost }) !== fieldBaseline ||
        isRecurrenceDirty;

    // A composed-but-unsaved linked schedule is an unsaved change like any other -- without this
    // the discard-changes guard would let closing the form drop it silently.
    const isDirty = isAnchorDirty || linkedDraft !== null;

    // The ET instants the Date/Time fields currently describe, for anything that has to show this
    // meeting's schedule before it's submitted (the collapsed schedule card). Null while either
    // field is unparseable -- the same cases buildMeetingPayload bails on.
    const scheduleInstants = (() => {
        const isoDateValue = toISODate(date);
        const [startTime, endTime] = time?.split(' - ') || [];
        if (!isoDateValue || !startTime || !endTime) return null;
        const startDateTime = tryConvertETToUTC(isoDateValue, startTime);
        const endDateTime = tryConvertETToUTC(isoDateValue, endTime);
        if (!startDateTime || !endDateTime) return null;
        if (endDateTime <= startDateTime) endDateTime.setUTCDate(endDateTime.getUTCDate() + 1);
        return { startDateTime, endDateTime };
    })();

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
        scheduleInstants,
        isScheduleConfirmed, setIsScheduleConfirmed,
        linkedDraft,
        startLinkedDraft,
        updateLinkedDraft,
        selectLinkedDraftMode,
        selectLinkedDraftRoom,
        toggleLinkedDraftDay,
        discardLinkedDraft,
        isAnchorDirty,
        isDirty,
        isRecurrenceDirty,
        isDateDirty,
        isModeDirty,
        isHostDirty,
        markFieldTouched,
        getFieldError,
    };
}
