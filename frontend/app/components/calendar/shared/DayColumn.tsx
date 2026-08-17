import React, { useState, useRef, useEffect } from 'react';
import BoxText from '../../ui/displays/BoxText';
import OverlapMeetingsPopover from './OverlapMeetingsPopover';
import styles from './DayColumn.module.scss';
import { isZoomRoomMismatched } from '../../../../util/rooms/rooms';
import { formatCompactTimeRange } from '../../../../util/date/timeFormat';
import { formatETDateString } from '../../../../util/date/timeUtils';

interface Meeting {
    id: string;
    title: string;
    startTime: string; // clipped to this day, for layout/positioning
    endTime: string; // clipped to this day, for layout/positioning
    displayStartTime?: string; // true time, for the label
    displayEndTime?: string; // true time, for the label
    tags?: string[];
    room?: string; // Added room property
    zoomRoom?: string | null;
    primaryColor?: string; // Added to support different colored meetings
    positionIndex?: number; // For handling overlapping meetings
    totalOverlapping?: number; // For handling overlapping meetings
    isOverflowIndicator?: boolean; // "+N more" pseudo-entry, rendered as a small pill instead of a meeting card
    overflowCount?: number;
    overflowMeetings?: Meeting[]; // Full overlapping cluster, shown in the "+N" popup
    clusterRange?: { start: string; end: string; key: string }; // Full cluster time range, shared by every member -- see meetingOverlapLayout.ts
}

// Drops the " - Zoom" suffix for a more compact badge label
const formatZoomRoomLabel = (zoomRoom: string) => zoomRoom.replace(/ - Zoom$/, '');

interface DayColumnProps {
    roomColor: string;
    meetings: Meeting[];
    selectedMeetingID: string | null;
    setSelectedMeetingID: (meetingId: string) => void;
    // The date of the currently-selected occurrence -- when set, only this column's own boxes
    // whose date matches get to render as "selected", so a recurring meeting appearing on
    // several days this week doesn't all highlight/pop-out together for one click.
    selectedOccurrenceDate?: Date | null;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    setAnchorEl: (el: HTMLElement) => void;
    // The calendar date this column represents -- recorded on every box click so a recurring
    // meeting's "effective date" reflects the specific occurrence clicked, not whichever date
    // the calendar happens to be globally centered on (see setLastClickedDate).
    columnDate: Date;
    setLastClickedDate?: (date: Date) => void;
    // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict.
    conflictMids?: Set<string>;
    // Admin-only (see hooks/useSyncErrorMids) -- mids with a Google Calendar/Zoom sync error.
    syncErrorMids?: Set<string>;
    // Desktop's default: 120px/hour, matching .timeSlot's 120px row height in both
    // DayView and WeekView. Mobile passes 60 (half height, to fit more of the day on
    // screen -- see DayPortraitView, whose own .timeColumn/.timeSlot heights must be
    // kept in sync with whatever's passed here).
    hourHeight?: number;
    // Drops each card's tag row and shows a mode icon prefixed to the title instead --
    // half-height rows have no room for a full tag row (see BoxText's hideTags).
    hideTags?: boolean;
    // Passed straight to BoxText -- MultiDayLandscapeView's only caller of this prop, for a
    // column width narrower than desktop WeekView's but with room for more than DayColumn's
    // other callers show. Every other caller leaves this unset (BoxText defaults to "full").
    tier?: 'full' | 'compact' | 'subcompact';
}

const DEFAULT_HOUR_HEIGHT = 120;

// Visual breathing room between two back-to-back meetings that would otherwise share
// a hard edge (one ending exactly when the next starts) -- split evenly off each card's
// top/bottom so the gap is centered on the boundary between them. Scales with hourHeight so
// mobile's half-height rows get proportionally tighter breathing room too.
const VERTICAL_GAP = 6;

const DayColumn: React.FC<DayColumnProps> = ({
    roomColor,
    meetings,
    selectedMeetingID,
    setSelectedMeetingID,
    selectedOccurrenceDate,
    setSelectedNewMeeting,
    setAnchorEl,
    columnDate,
    setLastClickedDate,
    conflictMids,
    syncErrorMids,
    hourHeight = DEFAULT_HOUR_HEIGHT,
    hideTags = false,
    tier,
}) => {
    const timeToPixels = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * hourHeight + minutes * (hourHeight / 60);
    };
    const verticalGap = VERTICAL_GAP * (hourHeight / DEFAULT_HOUR_HEIGHT);
    const [overlapPopoverMeetings, setOverlapPopoverMeetings] = useState<Meeting[] | null>(null);
    // The "+N" pill that opened the popover -- kept as a fallback popup anchor, since the
    // popover's own row is unmounted the instant it closes and getBoundingClientRect() on a
    // detached node would anchor the popup nowhere useful. Superseded by the selected
    // meeting's own card (see selectedCardRef below) once that card renders, since the pill
    // sits in a fixed corner of the column and can be far from where the card actually is.
    const [overlapAnchorEl, setOverlapAnchorEl] = useState<HTMLElement | null>(null);

    // DOM node of whichever card currently has isSelected===true (normal or promoted).
    // Selecting a meeting from the overflow popover re-anchors ViewMeeting to this once it
    // mounts/updates, since the popover-open pill is a poor stand-in for the card's position.
    const selectedCardRef = useRef<HTMLDivElement | null>(null);
    // Set right before a popover-driven selection, so the effect below knows to re-anchor.
    const pendingPopoverAnchorRef = useRef(false);

    const handleBoxClick = (meetingId: string, el: HTMLElement) => {
        console.log(`Meeting ${meetingId} clicked`);
        setSelectedMeetingID(meetingId);
        setSelectedNewMeeting(false);
        setAnchorEl(el);
        setLastClickedDate?.(columnDate);
    };

    useEffect(() => {
        if (pendingPopoverAnchorRef.current && selectedCardRef.current) {
            setAnchorEl(selectedCardRef.current);
            pendingPopoverAnchorRef.current = false;
        }
    }, [selectedMeetingID, setAnchorEl]);

    // Filters and data refreshes update `meetings` without remounting this component (date
    // changes do remount it via keyed wrappers) -- if the cluster the popover was opened for
    // is no longer rendered, close it instead of showing stale rows off a detached anchor.
    useEffect(() => {
        if (!overlapPopoverMeetings) return;
        const openIds = new Set(overlapPopoverMeetings.map(m => m.id));
        const clusterStillPresent = meetings.some(m =>
            m.isOverflowIndicator &&
            (m.overflowMeetings ?? []).length === openIds.size &&
            (m.overflowMeetings ?? []).every(om => openIds.has(om.id)),
        );
        if (!clusterStillPresent) {
            setOverlapPopoverMeetings(null);
            setOverlapAnchorEl(null);
        }
    }, [meetings, overlapPopoverMeetings]);

    // Undefined selectedOccurrenceDate (no click has happened yet, e.g. a deep link) falls back
    // to matching on id alone, same as before this column-scoping existed.
    const isOccurrenceDateMatch = !selectedOccurrenceDate || formatETDateString(columnDate) === formatETDateString(selectedOccurrenceDate);

    // Renders a single meeting's card. `forceSelected` is used to promote a folded
    // "+N" meeting (picked via the overflow popover) onto the stack even though it has
    // no normal slot of its own -- same full-width/shadow treatment as selecting one
    // of the two already-shown stacked meetings.
    const renderMeetingCard = (meeting: Meeting, key: React.Key, forceSelected = false) => {
        // Remote meetings have neither a physical room nor a Zoom room -- fall back to a
        // literal "Remote" label (matches the virtual room DayView buckets them into,
        // see util/rooms.ts's defaultRooms), otherwise the location line would be blank.
        const locationLabel = meeting.room || meeting.zoomRoom || (meeting.tags?.includes('Remote') ? 'Remote' : '');
        const topOffset = timeToPixels(meeting.startTime) + verticalGap / 2;
        const height = Math.max(
            timeToPixels(meeting.endTime) - timeToPixels(meeting.startTime) - verticalGap,
            1,
        );

        // A single meeting fills the column exactly; overlapping meetings split it evenly
        let width = '100%';
        let left = '0%';

        if (meeting.totalOverlapping && meeting.totalOverlapping > 1) {
            const singleWidth = 100 / meeting.totalOverlapping;
            width = `${singleWidth}%`;
            left = `${(meeting.positionIndex || 0) * singleWidth}%`;
        }

        // Selecting a meeting that's sharing space in an overlapping cluster brings
        // it fully into view (and above its siblings) instead of leaving it in its
        // narrow shared column -- reverts on its own once deselected, since this is
        // just a render-time override, not stored state.
        const isSelected = forceSelected || (meeting.id === selectedMeetingID && isOccurrenceDateMatch);

        return (
            <div
                key={key}
                ref={isSelected ? selectedCardRef : undefined}
                className={styles.meetingWrapper}
                style={{
                    top: `${topOffset}px`,
                    height: `${height}px`,
                    width: isSelected ? '100%' : width,
                    left: isSelected ? '0%' : left,
                    // Above the "+N" overflow pill's z-index (12, DayColumn.module.scss)
                    // too, so a selected meeting is unambiguously the topmost thing in the column.
                    zIndex: isSelected ? 13 : undefined,
                }}
                onClick={(e) => e.stopPropagation()} // Prevent column click handler from firing
            >
                <BoxText
                    boxType="Meeting Block"
                    title={meeting.title}
                    primaryColor={meeting.primaryColor || roomColor}
                    // Mobile (hideTags) keeps place and time as separate props so the time
                    // range can wrap onto its own line as a whole unit on narrow rows (see
                    // BoxText's `location` prop) -- desktop keeps the single pre-joined
                    // string it's always used, unaffected by that wrap behavior.
                    {...(hideTags
                        ? { location: locationLabel, time: formatCompactTimeRange(meeting.displayStartTime ?? meeting.startTime, meeting.displayEndTime ?? meeting.endTime) }
                        : { time: `${locationLabel ? `${locationLabel} · ` : ''}${formatCompactTimeRange(meeting.displayStartTime ?? meeting.startTime, meeting.displayEndTime ?? meeting.endTime)}` })}
                    tags={meeting.tags}
                    meetingId={meeting.id}
                    zoomTag={
                        meeting.room && isZoomRoomMismatched(meeting.room, meeting.zoomRoom)
                            ? formatZoomRoomLabel(meeting.zoomRoom!)
                            : undefined
                    }
                    syncError={syncErrorMids?.has(meeting.id)}
                    hasConflict={conflictMids?.has(meeting.id)}
                    fillHeight
                    hideTags={hideTags}
                    tier={tier}
                    selected={isSelected}
                    onClick={(meetingId, e) => {
                        handleBoxClick(meetingId, e.currentTarget);
                        e.stopPropagation(); // Prevent column click handler from firing
                    }}
                />
            </div>
        );
    };

    // If the selected meeting was picked from an overflow "+N" popup rather than one
    // of the two normally-rendered stacked cards, it has no slot of its own -- find it
    // in the folded cluster so it can be promoted onto the stack (see renderMeetingCard).
    const renderedIds = new Set(meetings.filter(m => !m.isOverflowIndicator).map(m => m.id));
    const promotedMeeting = selectedMeetingID && isOccurrenceDateMatch && !renderedIds.has(selectedMeetingID)
        ? meetings.flatMap(m => m.overflowMeetings ?? []).find(m => m.id === selectedMeetingID)
        : undefined;

    // One background container per overlapping cluster, deduped by clusterRange.key --
    // several meetings (and an overflow indicator) can share the same cluster.
    const clusterRanges = new Map<string, { start: string; end: string }>();
    meetings.forEach(meeting => {
        if (meeting.clusterRange && !clusterRanges.has(meeting.clusterRange.key)) {
            clusterRanges.set(meeting.clusterRange.key, meeting.clusterRange);
        }
    });

    return (
        <div className={styles.columnWrapper}>
            <div className={styles.columnBody} style={{ height: `${hourHeight * 24}px` }}>
                {/* Render hour markers */}
                {Array.from({ length: 24 }).map((_, hourIndex) => (
                    <div
                        key={hourIndex}
                        className={styles.hourMarker}
                        style={{ top: `${hourIndex * hourHeight}px`, height: `${hourHeight}px` }}
                    />
                ))}

                {/* Cluster containers -- rendered beneath the meeting cards and "+N" pill (see
                    z-index in DayColumn.module.scss), spanning each cluster's full time
                    range so it reads as one connected group, like a single meeting spanning the
                    whole cluster. Same VERTICAL_GAP treatment as renderMeetingCard so it lines up
                    exactly as if it were a real meeting card for that time range. */}
                {Array.from(clusterRanges.entries()).map(([key, range]) => {
                    const topOffset = timeToPixels(range.start) + verticalGap / 2;
                    const height = Math.max(
                        timeToPixels(range.end) - timeToPixels(range.start) - verticalGap,
                        1,
                    );
                    return (
                        <div
                            key={key}
                            className={styles.clusterContainer}
                            style={{ top: `${topOffset}px`, height: `${height}px` }}
                        />
                    );
                })}

                {meetings.map((meeting, index) => {
                    if (meeting.isOverflowIndicator) {
                        // Matches renderMeetingCard's topOffset (line 94) so the pill lines up
                        // with the top of the meeting cards it sits beside, instead of sitting
                        // VERTICAL_GAP/2 higher than they do.
                        const topOffset = timeToPixels(meeting.startTime) + verticalGap / 2;
                        return (
                            <div
                                key={index}
                                role="button"
                                tabIndex={0}
                                aria-label={`${meeting.overflowCount} more meetings at this time`}
                                className={styles.overflowIndicator}
                                style={{ top: `${topOffset}px` }}
                                title={`${meeting.overflowCount} more meeting${meeting.overflowCount === 1 ? '' : 's'} at this time — click to see all meetings`}
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent column click handler from firing
                                    // primaryColor fallback matches renderMeetingCard's -- without it,
                                    // color-less overflow meetings render as generic grey popover rows.
                                    setOverlapPopoverMeetings(
                                        (meeting.overflowMeetings ?? []).map(m => ({ ...m, primaryColor: m.primaryColor ?? roomColor }))
                                    );
                                    setOverlapAnchorEl(e.currentTarget);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setOverlapPopoverMeetings(
                                            (meeting.overflowMeetings ?? []).map(m => ({ ...m, primaryColor: m.primaryColor ?? roomColor }))
                                        );
                                        setOverlapAnchorEl(e.currentTarget);
                                    }
                                }}
                            >
                                +{meeting.overflowCount}
                            </div>
                        );
                    }

                    return renderMeetingCard(meeting, index);
                })}

                {promotedMeeting && renderMeetingCard(promotedMeeting, `promoted-${promotedMeeting.id}`, true)}
            </div>

            <OverlapMeetingsPopover
                isOpen={overlapPopoverMeetings !== null}
                meetings={overlapPopoverMeetings ?? []}
                anchorEl={overlapAnchorEl}
                conflictMids={conflictMids}
                syncErrorMids={syncErrorMids}
                onClose={() => setOverlapPopoverMeetings(null)}
                onSelectMeeting={(meetingId) => {
                    pendingPopoverAnchorRef.current = true;
                    if (overlapAnchorEl) handleBoxClick(meetingId, overlapAnchorEl);
                    setOverlapPopoverMeetings(null);
                }}
            />
        </div>
    );
};

export default DayColumn;