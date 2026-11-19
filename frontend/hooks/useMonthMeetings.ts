import { useMemo } from "react";
import { formatETDateString } from "../util/date/timeUtils";
import {
    etDateStringToNoonET,
    getMonthGridRange,
    getMonthGridRangeForStart,
    groupMeetingsByETDate,
    MONTH_GRID_DAYS,
    MonthGridRange,
} from "../util/meetings/monthGrid";
import { useRangeMeetings } from "./useRangeMeetings";
import { WeekMeeting } from "./useWeekMeetings";

export interface UseMonthMeetingsResult {
    // The grid `meetings` actually belongs to -- lags the requested month while its fetch is in
    // flight (see useRangeMeetings' loadedStartDate), so MonthView renders cells, dots and its
    // enter transition from one consistent month.
    loadedRange: MonthGridRange;
    // Unfiltered occurrences for every day of loadedRange -- MonthView applies the active room/
    // tag filters itself, so toggling a filter never refetches.
    meetings: WeekMeeting[];
    meetingsByDate: Map<string, WeekMeeting[]>;
    isLoading: boolean;
}

// Data for the desktop Month view (GitHub #459): one /api/retrieve/meeting/range request for
// the whole 42-day grid of the ET month containing `selectedDate`, including the adjacent-month
// padding cells (they show real meetings too). Picking another day inside the same month keeps
// the same grid start, so it doesn't refetch. Bump `refreshTrigger` to force a refetch.
export function useMonthMeetings(selectedDate: Date, refreshTrigger: number = 0): UseMonthMeetingsResult {
    const requestedStart = getMonthGridRange(selectedDate).startDate;
    // Memoized on the ET string so the Date identity handed to useRangeMeetings only changes
    // when the grid does (it keys its own effects on the ET string anyway).
    const gridStart = useMemo(() => etDateStringToNoonET(requestedStart), [requestedStart]);

    const { meetings, isLoading, loadedStartDate } = useRangeMeetings(gridStart, MONTH_GRID_DAYS, refreshTrigger);

    const loadedStartKey = formatETDateString(loadedStartDate);
    const loadedRange = useMemo(() => getMonthGridRangeForStart(loadedStartKey), [loadedStartKey]);
    const meetingsByDate = useMemo(() => groupMeetingsByETDate(meetings), [meetings]);

    return { loadedRange, meetings, meetingsByDate, isLoading };
}
