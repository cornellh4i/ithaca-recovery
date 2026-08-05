import { useCallback, useEffect, useRef, useState } from "react";
import { formatETDateString } from "../util/timeUtils";
import { createCache } from "../util/simpleCache";
import { WeekMeeting, mapRawMeetingsToWeekMeetings } from "./useWeekMeetings";

// Separate cache from useWeekMeetings' own -- keyed by the exact date range requested, not a
// calendar week, so a caller needing an arbitrary N-day window (MultiDayLandscapeView's page)
// only ever fetches/caches those N days, not the whole week(s) they happen to fall in.
const rangeMeetingCache = createCache<WeekMeeting[]>();

const fetchMeetingsByRange = async (startDate: Date, endDate: Date): Promise<WeekMeeting[]> => {
    const formattedStart = formatETDateString(startDate);
    const formattedEnd = formatETDateString(endDate);
    const cacheKey = `${formattedStart}-${formattedEnd}`;

    return rangeMeetingCache.getOrFetch(cacheKey, async () => {
        console.log("[useRangeMeetings] Fetching meetings for range:", cacheKey);

        try {
            const response = await fetch(`/api/retrieve/meeting/range?startDate=${formattedStart}&endDate=${formattedEnd}`);
            const data = await response.json();
            console.log("[useRangeMeetings] Raw API response for", cacheKey, ":", data);
            return mapRawMeetingsToWeekMeetings(data);
        } catch (error) {
            console.error("[useRangeMeetings] Error fetching meetings for", cacheKey, ":", error instanceof Error ? error.message : String(error));
            return [];
        }
    });
};

// Fetches (and caches) meetings for exactly `days` consecutive ET days starting at
// `startDate` -- unlike useWeekMeetings, this isn't aligned to a calendar week, so a caller
// needing an arbitrary N-day window doesn't have to over-fetch whole weeks around it. Bump
// `refreshTrigger` to force a cache-busting refetch (e.g. after a create/edit/delete).
export function useRangeMeetings(startDate: Date, days: number, refreshTrigger: number = 0): WeekMeeting[] {
    const [allMeetings, setAllMeetings] = useState<WeekMeeting[]>([]);

    // Ref instead of closing over startDate/days directly -- same reasoning as useWeekMeetings'
    // own weekStartDateRef: keeps fetchRangeMeetings' identity stable across range changes, so
    // the refreshTrigger effect below doesn't fire an extra forced fetch every time the page
    // moves.
    const startDateRef = useRef(startDate);
    const daysRef = useRef(days);
    // Stable key standing in for (startDate, days) in dependency arrays -- same reasoning as
    // useWeekMeetings' own weekStartKey (a caller recomputing startDate inline every render
    // shouldn't re-run these effects unless the range itself actually changed).
    const rangeKey = `${formatETDateString(startDate)}-${days}`;
    useEffect(() => {
        startDateRef.current = startDate;
        daysRef.current = days;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rangeKey]);

    // Guards against out-of-order responses: rapid page changes can fire overlapping fetches,
    // and without this a slower-but-stale response can overwrite a newer one.
    const fetchRequestIdRef = useRef(0);

    const fetchRangeMeetings = useCallback(async (forceFetch = false) => {
        const start = startDateRef.current;
        const endDate = new Date(start);
        endDate.setDate(start.getDate() + daysRef.current - 1);

        if (forceFetch) {
            rangeMeetingCache.clear();
        }

        const requestId = ++fetchRequestIdRef.current;
        const meetings = await fetchMeetingsByRange(start, endDate);
        if (requestId === fetchRequestIdRef.current) {
            setAllMeetings(meetings);
        }
    }, []);

    useEffect(() => {
        fetchRangeMeetings();
    }, [rangeKey, fetchRangeMeetings]);

    useEffect(() => {
        if (refreshTrigger > 0) {
            fetchRangeMeetings(true);
        }
    }, [refreshTrigger, fetchRangeMeetings]);

    return allMeetings;
}
