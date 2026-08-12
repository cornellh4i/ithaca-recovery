import { useCallback, useEffect, useRef, useState } from "react";
import { formatETDateString } from "../util/date/timeUtils";
import { createCache } from "../util/common/simpleCache";
import { IMeeting } from "../types/models";
import { OverlapMeeting } from "../util/meetings/meetingOverlapLayout";

export type WeekMeeting = OverlapMeeting;

// Module-level, shared cache -- extracted out of WeekView.tsx so the mobile day view
// (DayPortraitView.tsx) hits the exact same cache for the same week's data instead of a
// second, independent cache. Two caches for the same data would mean duplicate network calls
// (and possible staleness drift) whenever a user resizes across the phone breakpoint.
const weekMeetingCache = createCache<WeekMeeting[]>();

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what DayColumn expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
});

// Shared with useRangeMeetings.ts -- both the week and arbitrary-day-range retrieval routes
// return the same {...meeting, date} shape (a raw IMeeting occurrence tagged with the ET date
// it was expanded onto), so both hooks transform it identically.
export const mapRawMeetingsToWeekMeetings = (data: (IMeeting & { date: string })[]): WeekMeeting[] =>
    // startTime/endTime clip to this day (for layout); displayStartTime/displayEndTime keep the
    // true times, so an overnight meeting's cards both label as "11PM-1AM".
    data.map((meeting) => {
        const trueStart = new Date(meeting.startDateTime);
        const trueEnd = new Date(meeting.endDateTime);
        const startsToday = formatETDateString(trueStart) === meeting.date;
        const endsToday = formatETDateString(trueEnd) === meeting.date;

        return {
            id: meeting.mid,
            title: meeting.title,
            startTime: startsToday ? etTimeFmt.format(trueStart) : "00:00",
            endTime: endsToday ? etTimeFmt.format(trueEnd) : "24:00",
            displayStartTime: etTimeFmt.format(trueStart),
            displayEndTime: etTimeFmt.format(trueEnd),
            date: meeting.date,
            tags: [...meeting.calType, meeting.modeType],
            room: meeting.room,
            zoomRoom: meeting.zoomRoom,
        };
    });

const fetchMeetingsByWeek = async (startDate: Date, endDate: Date): Promise<WeekMeeting[]> => {
    const formattedStart = formatETDateString(startDate);
    const formattedEnd = formatETDateString(endDate);
    const cacheKey = `${formattedStart}-${formattedEnd}`;

    return weekMeetingCache.getOrFetch(cacheKey, async () => {
        console.log("[useWeekMeetings] Fetching meetings for week:", cacheKey);

        try {
            const response = await fetch(`/api/retrieve/meeting/week?startDate=${formattedStart}&endDate=${formattedEnd}`);
            const data = await response.json();
            console.log("[useWeekMeetings] Raw API response for", cacheKey, ":", data);
            return mapRawMeetingsToWeekMeetings(data);
        } catch (error) {
            // error objects don't serialize over CDP -- log the message directly so it's
            // actually visible in the piped-through e2e console output.
            console.error("[useWeekMeetings] Error fetching meetings for", cacheKey, ":", error instanceof Error ? error.message : String(error));
            return [];
        }
    });
};

// Warms weekMeetingCache for a week WeekView isn't currently showing (its own prev/next
// neighbor) -- fire-and-forget, no return value: fetchMeetingsByWeek's own cache is the only
// effect wanted here. So that an arrow click's fetch is (almost always) a cache hit by the time
// the new week's motion.div mounts, instead of the enter transition sliding in an empty grid
// for however long the real fetch takes (invisible before this component had any transition;
// visible now that one draws the eye to the moment the new week "arrives").
export const prefetchWeek = (weekStartDate: Date): void => {
    const endDate = new Date(weekStartDate);
    endDate.setDate(weekStartDate.getDate() + 6);
    fetchMeetingsByWeek(weekStartDate, endDate);
};

export const invalidateWeekCache = (startDate: Date, endDate: Date) => {
    const formattedStart = formatETDateString(startDate);
    const formattedEnd = formatETDateString(endDate);
    weekMeetingCache.invalidate(`${formattedStart}-${formattedEnd}`);
};

// For callers that changed a meeting from outside the calendar route entirely (e.g. Admin
// Diagnostics resuming a suspended meeting) and so don't know/can't reach the specific week key
// -- clears every cached week rather than guessing one.
export const invalidateAllWeekCache = () => {
    weekMeetingCache.clear();
};

export interface UseWeekMeetingsResult {
    meetings: WeekMeeting[];
    // True while a fetch for the currently-requested week is in flight -- including a cache hit,
    // since getOrFetch always returns a promise either way; a cache hit just resolves on the
    // next microtask, so this flips back to false before paint and never visibly flashes.
    isLoading: boolean;
    // The week `meetings` actually belongs to -- may lag `weekStartDate` while a fetch for the
    // newly requested week is still in flight (the fetch above is async, but weekStartDate
    // itself updates synchronously during render). WeekView keys its enter transition, and
    // which day columns/DayColumn occurrence-date it renders, off this instead of
    // weekStartDate directly -- otherwise the transition (and the days it shows) can start
    // before `meetings` has actually caught up, animating in empty or prior-week content under
    // the new week's heading.
    loadedWeekStartDate: Date;
}

// Fetches (and caches) all meetings for the ET week starting `weekStartDate` (a Sunday).
// Bump `refreshTrigger` to force a cache-busting refetch (e.g. after a create/edit/delete).
export function useWeekMeetings(weekStartDate: Date, refreshTrigger: number = 0): UseWeekMeetingsResult {
    const [allMeetings, setAllMeetings] = useState<WeekMeeting[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadedWeekStartDate, setLoadedWeekStartDate] = useState<Date>(weekStartDate);

    // Ref instead of a `weekStartDate` closure/dependency so fetchWeekMeetings's identity
    // stays stable across week changes -- needed so the refreshTrigger effect below doesn't
    // fire an extra forced fetch every time the week changes.
    const weekStartDateRef = useRef(weekStartDate);
    // Stable ET-day string standing in for `weekStartDate` in dependency arrays below --
    // `useEffect` compares deps with `Object.is`, so a caller that recomputes `weekStartDate`
    // inline every render (e.g. DayPortraitView) would otherwise re-run these effects on
    // every unrelated re-render even though the actual week hasn't changed.
    const weekStartKey = formatETDateString(weekStartDate);
    useEffect(() => {
        weekStartDateRef.current = weekStartDate;
        // Keyed on weekStartKey (see its comment above), not the Date object, intentionally.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStartKey]);

    // Guards against out-of-order responses: rapid date/filter changes can fire overlapping
    // fetches, and without this a slower-but-stale response can overwrite a newer one.
    const fetchRequestIdRef = useRef(0);

    const fetchWeekMeetings = useCallback(async (forceFetch = false) => {
        const startDate = weekStartDateRef.current;
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        // Clear the entire cache so stale data on other weeks is also dropped.
        if (forceFetch) {
            weekMeetingCache.clear();
        }

        const requestId = ++fetchRequestIdRef.current;
        setIsLoading(true);
        // fetchMeetingsByWeek's own fetcher already catches and resolves to [] on failure, but
        // isLoading is set/cleared here defensively in a try/finally anyway -- matching
        // useRangeMeetings' own shape -- so this doesn't silently break if that internal
        // catch-and-resolve behavior ever changes.
        try {
            const meetings = await fetchMeetingsByWeek(startDate, endDate);
            if (requestId === fetchRequestIdRef.current) {
                setAllMeetings(meetings);
                setLoadedWeekStartDate(startDate);
            }
        } finally {
            if (requestId === fetchRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchWeekMeetings();
        // Keyed on weekStartKey, not the Date object reference (see its comment above).
    }, [weekStartKey, fetchWeekMeetings]);

    useEffect(() => {
        if (refreshTrigger > 0) {
            console.log("Refetching week meetings due to trigger change:", refreshTrigger);
            fetchWeekMeetings(true); // Force fetch (invalidate cache)
        }
    }, [refreshTrigger, fetchWeekMeetings]);

    return { meetings: allMeetings, isLoading, loadedWeekStartDate };
}
