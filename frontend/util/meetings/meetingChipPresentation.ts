// Shared per-day meeting-chip presentation used by WeekView, DayPortraitView, and
// MultiDayLandscapeView, so the per-day views can't drift apart on chip color/location
// (they render one chip per meeting, unlike DayView's per-room rows).

import { getRoomFilterVisibility, MeetingFilters } from '../filters/meetingFilters';
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from '../rooms/filterColors';
import { MODE_ICON_NAME } from '../rooms/modeIcons';
import { formatCompactTimeRange } from '../date/timeFormat';

interface ChipMeeting {
    room: string;
    zoomRoom?: string | null;
    tags: string[];
}

export interface MeetingChipPresentation {
    primaryColor: string;
    // undefined when the chip should present as its Zoom room: the physical room's filter is
    // unchecked and only the Zoom room's keeps the meeting visible (filterMeetingsForDate's
    // OR semantics), so the chip goes grey and labels itself with the Zoom room name --
    // mirroring the Zoom-room row Day view shows in that state.
    room: string | undefined;
}

/**
 * Color + displayed room for a meeting chip in a per-day view, given the current room
 * filters. Remote meetings and meetings visible through their physical room keep their
 * normal color and room; a meeting surviving only via its Zoom room presents as that
 * Zoom room instead.
 */
export const getMeetingChipPresentation = (
    meeting: ChipMeeting,
    filters: MeetingFilters,
): MeetingChipPresentation => {
    if (meeting.tags.includes('Remote')) {
        return { primaryColor: REMOTE_COLOR, room: meeting.room };
    }
    const { viaPhysicalRoom, viaZoomRoom } = getRoomFilterVisibility(meeting, filters);
    if (!viaPhysicalRoom && viaZoomRoom) {
        return { primaryColor: ZOOM_ROOM_COLOR, room: undefined };
    }
    return { primaryColor: ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR, room: meeting.room };
};

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
