// Shared meeting-chip helpers used by every calendar view that renders chips.

import { MODE_ICON_NAME } from '../rooms/modeIcons';
import { formatCompactTimeRange } from '../date/timeFormat';

interface LabeledMeeting {
    title: string;
    startTime: string;
    endTime: string;
    displayStartTime?: string;
    displayEndTime?: string;
    room?: string;
    zoomRoom?: string | null;
    tags?: string[];
}

/**
 * Accessible name for a meeting chip, e.g. "Noon Brown Baggers, 12 - 1 PM, Serenity Room,
 * Hybrid". Location falls back the same way the visible chip label does: physical room,
 * then Zoom room, then "Remote".
 */
export const buildMeetingChipAriaLabel = (meeting: LabeledMeeting): string => {
    const time = formatCompactTimeRange(
        meeting.displayStartTime ?? meeting.startTime,
        meeting.displayEndTime ?? meeting.endTime,
    );
    const location = meeting.room || meeting.zoomRoom || (meeting.tags?.includes('Remote') ? 'Remote' : '');
    const mode = meeting.tags?.find(tag => MODE_ICON_NAME[tag]);
    // A Remote meeting's location is already "Remote" -- don't announce it twice.
    return [meeting.title, time, location, mode !== location ? mode : undefined]
        .filter(Boolean)
        .join(', ');
};
