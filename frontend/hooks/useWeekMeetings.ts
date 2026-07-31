import { useCallback, useEffect, useRef, useState } from "react";
import { formatETDateString } from "../util/timeUtils";
import { createCache } from "../util/simpleCache";
import { IMeeting } from "../util/models";
import { OverlapMeeting } from "../util/meetingOverlapLayout";

export interface WeekMeeting extends OverlapMeeting {
    syncError?: boolean;
}

// Module-level, shared cache -- extracted out of WeeklyView.tsx so the mobile day view
// (MobileCalendarView.tsx) hits the exact same cache for the same week's data instead of a
// second, independent cache. Two caches for the same data would mean duplicate network calls
// (and possible staleness drift) whenever a user resizes across the phone breakpoint.
const weekMeetingCache = createCache<WeekMeeting[]>();

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what DayColumn expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
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

            // startTime/endTime clip to this day (for layout); displayStartTime/displayEndTime
            // keep the true times, so an overnight meeting's cards both label as "11PM-1AM".
            const meetings: WeekMeeting[] = data.map((meeting: IMeeting & { date: string }) => {
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
                    syncError: meeting.googleSyncStatus === 'error' || meeting.zoomSyncStatus === 'error',
                };
            });

            return meetings;
        } catch (error) {
            // error objects don't serialize over CDP -- log the message directly so it's
            // actually visible in the piped-through e2e console output.
            console.error("[useWeekMeetings] Error fetching meetings for", cacheKey, ":", error instanceof Error ? error.message : String(error));
            return [];
        }
    });
};

export const invalidateWeekCache = (startDate: Date, endDate: Date) => {
    const formattedStart = formatETDateString(startDate);
    const formattedEnd = formatETDateString(endDate);
    weekMeetingCache.invalidate(`${formattedStart}-${formattedEnd}`);
};

// Fetches (and caches) all meetings for the ET week starting `weekStartDate` (a Sunday).
// Bump `refreshTrigger` to force a cache-busting refetch (e.g. after a create/edit/delete).
export function useWeekMeetings(weekStartDate: Date, refreshTrigger: number = 0): WeekMeeting[] {
    const [allMeetings, setAllMeetings] = useState<WeekMeeting[]>([]);

    // Ref instead of a `weekStartDate` closure/dependency so fetchWeekMeetings's identity
    // stays stable across week changes -- needed so the refreshTrigger effect below doesn't
    // fire an extra forced fetch every time the week changes.
    const weekStartDateRef = useRef(weekStartDate);
    // Stable ET-day string standing in for `weekStartDate` in dependency arrays below --
    // `useEffect` compares deps with `Object.is`, so a caller that recomputes `weekStartDate`
    // inline every render (e.g. MobileCalendarView) would otherwise re-run these effects on
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
        const meetings = await fetchMeetingsByWeek(startDate, endDate);
        if (requestId === fetchRequestIdRef.current) {
            setAllMeetings(meetings);
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

    return allMeetings;
}
