// Pure overlap-layout algorithm for a day's meetings, extracted from WeeklyView so it
// can be reasoned about (and tested) independently of fetching/caching and rendering.

export interface OverlapMeeting {
    id: string;
    title: string;
    startTime: string; // "HH:MM" 24hr, clipped to this day for layout/positioning
    endTime: string; // "HH:MM" 24hr, clipped to this day for layout/positioning
    displayStartTime?: string; // true, unclipped "HH:MM" — for the rendered label
    displayEndTime?: string; // true, unclipped "HH:MM" — for the rendered label
    date: string; // ET calendar date this occurrence belongs to
    tags: string[];
    room: string;
    zoomRoom?: string | null;
    positionIndex?: number; // Column index among overlapping meetings, assigned below
    totalOverlapping?: number; // Column count among overlapping meetings, assigned below
    isOverflowIndicator?: boolean; // "+N more" pseudo-entry standing in for meetings past MAX_VISIBLE_OVERLAP
    overflowCount?: number;
    overflowMeetings?: OverlapMeeting[]; // Full overlapping cluster (shown + folded), for the "+N" popup
}

const toMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// At most this many meetings render as full columns per overlapping cluster; any more
// are folded into a single "+N more" indicator instead of shrinking columns further.
export const MAX_VISIBLE_OVERLAP = 2;

/**
 * Lays out a day's meetings so partially-overlapping ones share the column instead of
 * fully covering each other. Two passes:
 * 1. Sweep left to right by start time, splitting meetings into clusters of mutually
 *    (possibly transitively) overlapping meetings.
 * 2. Within each cluster, greedily assign each meeting to the first column whose current
 *    occupant has already ended (classic interval-graph-coloring calendar layout) — the
 *    cluster's column count becomes every meeting's totalOverlapping/width divisor.
 */
export const layoutOverlappingMeetings = <T extends OverlapMeeting>(meetings: T[]): T[] => {
    // Title as a tiebreaker keeps column/overflow assignment consistent across renders
    // and across days — meetings sharing a start time would otherwise fall back to
    // whatever order the database happened to return them in, which isn't guaranteed
    // stable (each day's meetings come from a separate query in the week route).
    const sorted = [...meetings].sort((a, b) =>
        toMinutes(a.startTime) - toMinutes(b.startTime) || a.title.localeCompare(b.title)
    );

    const clusters: T[][] = [];
    let currentCluster: T[] = [];
    let clusterEnd = -Infinity;

    sorted.forEach(meeting => {
        const start = toMinutes(meeting.startTime);
        if (currentCluster.length > 0 && start >= clusterEnd) {
            clusters.push(currentCluster);
            currentCluster = [];
            clusterEnd = -Infinity;
        }
        currentCluster.push(meeting);
        clusterEnd = Math.max(clusterEnd, toMinutes(meeting.endTime));
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    const result: T[] = [];
    clusters.forEach(cluster => {
        const columnEnds: number[] = []; // end time (minutes) currently occupying each column
        const positioned = cluster.map(meeting => {
            const start = toMinutes(meeting.startTime);
            const end = toMinutes(meeting.endTime);
            let column = columnEnds.findIndex(columnEnd => columnEnd <= start);
            if (column === -1) {
                column = columnEnds.length;
                columnEnds.push(end);
            } else {
                columnEnds[column] = end;
            }
            return { ...meeting, positionIndex: column };
        });

        const totalOverlapping = columnEnds.length;

        if (totalOverlapping <= MAX_VISIBLE_OVERLAP) {
            positioned.forEach(meeting => {
                result.push(totalOverlapping > 1 ? { ...meeting, totalOverlapping } : meeting);
            });
            return;
        }

        // Cap at MAX_VISIBLE_OVERLAP full columns; fold the rest into one "+N more"
        // indicator spanning their combined time range.
        const shown = positioned.filter(m => (m.positionIndex ?? 0) < MAX_VISIBLE_OVERLAP);
        const overflow = positioned.filter(m => (m.positionIndex ?? 0) >= MAX_VISIBLE_OVERLAP);

        shown.forEach(meeting => {
            result.push({ ...meeting, totalOverlapping: MAX_VISIBLE_OVERLAP });
        });

        // Anchored to the whole cluster's time range (not just the folded subset) so the "+N"
        // pill always renders at the top of the cluster, regardless of which specific meetings
        // the greedy column assignment above happened to show vs. fold -- a folded meeting can
        // easily start later than the two shown ones despite still overlapping all of them.
        const clusterStartMinutes = Math.min(...cluster.map(m => toMinutes(m.startTime)));
        const clusterEndMinutes = Math.max(...cluster.map(m => toMinutes(m.endTime)));
        // Only OverlapMeeting's own fields are known here -- any extra fields a caller's T
        // adds on (e.g. Day View's `syncError`) are meaningless for a pseudo-entry that isn't
        // a real meeting, so this is asserted rather than genuinely satisfying T.
        result.push({
            id: `overflow-${cluster[0].date}-${clusterStartMinutes}`,
            title: '',
            startTime: minutesToTime(clusterStartMinutes),
            endTime: minutesToTime(clusterEndMinutes),
            date: cluster[0].date,
            tags: [],
            room: '',
            isOverflowIndicator: true,
            overflowCount: overflow.length,
            overflowMeetings: cluster,
        } as unknown as T);
    });

    return result;
};
