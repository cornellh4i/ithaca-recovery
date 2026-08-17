import React, { useLayoutEffect, useRef, useState } from 'react';
import styles from './OverlapMeetingsPopover.module.scss';
import { formatCompactTimeRange } from '../../../../util/date/timeFormat';
import { toPastelColor } from '../../../../util/common/color';
import Icon from '../../ui/displays/Icon';
import TagList from '../../ui/displays/TagList';
import Modal from '../../ui/overlays/Modal';

interface OverlapMeeting {
    id: string;
    title: string;
    startTime: string; // "HH:MM" 24hr ET, clipped to this day
    endTime: string; // "HH:MM" 24hr ET, clipped to this day
    displayStartTime?: string; // true time, for the label
    displayEndTime?: string; // true time, for the label
    room?: string;
    zoomRoom?: string | null;
    tags?: string[];
    primaryColor?: string;
}

interface OverlapMeetingsPopoverProps {
    isOpen: boolean;
    meetings: OverlapMeeting[];
    // The "+N" pill that opened this popover -- the panel anchors beside it rather than
    // centering over the grid, so the surrounding week/day stays readable.
    anchorEl: HTMLElement | null;
    // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict. Same source
    // BoxText's corner badge reads from; kept as the live Set (not baked into each meeting at
    // click time) so a conflict that appears/resolves while the popover is open stays accurate.
    conflictMids?: Set<string>;
    // Admin-only (see hooks/useSyncErrorMids) -- mids with a Google Calendar/Zoom sync error.
    // Same live-Set treatment as conflictMids above.
    syncErrorMids?: Set<string>;
    onClose: () => void;
    onSelectMeeting: (meetingId: string) => void;
}

const PANEL_WIDTH = 272;
// Gap between the anchor pill and the panel, and the minimum clearance kept from the
// viewport edges when clamping.
const ANCHOR_GAP = 8;

const OverlapMeetingsPopover: React.FC<OverlapMeetingsPopoverProps> = ({
    isOpen,
    meetings,
    anchorEl,
    conflictMids,
    syncErrorMids,
    onClose,
    onSelectMeeting,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    // Anchors beside the pill: to its right by default, flipped to its left when the panel
    // would run off the viewport's right edge, and clamped vertically to stay fully on
    // screen. Measured after render (panel height depends on row count), and re-measured on
    // window resize and when the panel's own height changes while open (e.g. an admin's live
    // conflictMids adding a warning line). Scroll needs no listener -- the full-viewport
    // overlay blocks scrolling underneath while the popover is open.
    useLayoutEffect(() => {
        const panelEl = panelRef.current?.parentElement;
        if (!isOpen || !anchorEl || !panelEl) {
            setPosition(null);
            return;
        }
        const reposition = () => {
            const anchorRect = anchorEl.getBoundingClientRect();
            const panelHeight = panelEl.offsetHeight;

            let left = anchorRect.right + ANCHOR_GAP;
            if (left + PANEL_WIDTH > window.innerWidth - ANCHOR_GAP) {
                left = anchorRect.left - ANCHOR_GAP - PANEL_WIDTH;
            }
            left = Math.max(left, ANCHOR_GAP);

            let top = anchorRect.top;
            top = Math.min(top, window.innerHeight - ANCHOR_GAP - panelHeight);
            top = Math.max(top, ANCHOR_GAP);

            setPosition({ top, left });
        };
        reposition();
        window.addEventListener('resize', reposition);
        const observer = new ResizeObserver(reposition);
        observer.observe(panelEl);
        return () => {
            window.removeEventListener('resize', reposition);
            observer.disconnect();
        };
    }, [isOpen, anchorEl, meetings]);

    // Full range across every meeting shown (true, unclipped times where available) --
    // e.g. "9 - 11 AM" for meetings spanning 9-10, 9:30-10:30, and 10-11. The window is the
    // header title (not the count): several clusters can share a day, so the time range is
    // what tells the user which one they opened.
    const timeRangeLabel = meetings.reduce<{ start: string; end: string } | null>((range, meeting) => {
        const start = meeting.displayStartTime ?? meeting.startTime;
        const end = meeting.displayEndTime ?? meeting.endTime;
        if (!range) return { start, end };
        return {
            start: start < range.start ? start : range.start,
            end: end > range.end ? end : range.end,
        };
    }, null);

    const doubleBookedCount = conflictMids
        ? meetings.filter(meeting => conflictMids.has(meeting.id)).length
        : 0;

    return (
        // Both Day and Week view render this from deep inside absolutely-positioned,
        // overflow-clipped columns (.columnBody), so the panel can't be an in-column child --
        // Modal's document.body portal is what lets a 272px panel escape a narrow week column.
        // The overlay is transparent (no scrim): the grid stays readable behind the panel,
        // while Modal still provides Escape/outside-click dismissal and focus handling. A
        // click anywhere in here still bubbles through the *React* tree (not the DOM tree)
        // up to the opening cell's own click-to-create-a-meeting handler unless stopped here.
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            overlayClassName={styles.overlay}
            contentClassName={styles.panel}
            // Hidden on the first paint of an open: the panel renders once unpositioned so
            // useLayoutEffect can measure its height, then appears at the anchored spot. The
            // position lands on Modal's own dialog element -- a fixed-position child inside a
            // zero-size static dialog wrapper would read as hidden to assistive tech and tests.
            contentStyle={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
            labelledBy="overlap-meetings-title"
        >
            <div ref={panelRef} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div>
                        <h2 id="overlap-meetings-title" className={styles.title}>
                            {timeRangeLabel
                                ? formatCompactTimeRange(timeRangeLabel.start, timeRangeLabel.end)
                                : 'Meetings'}
                        </h2>
                        <p className={styles.subtitle}>
                            {meetings.length} meeting{meetings.length === 1 ? '' : 's'}
                            {doubleBookedCount > 0 && ` · ${doubleBookedCount} double-booked`}
                        </p>
                    </div>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>

                <div className={styles.list}>
                    {meetings.map(meeting => {
                        // Remote meetings have neither a physical room nor a Zoom room -- fall
                        // back to a literal "Remote" label (matches the virtual room DayView
                        // buckets them into), so the meta line is never half-empty.
                        const locationLabel = meeting.room || meeting.zoomRoom || (meeting.tags?.includes('Remote') ? 'Remote' : '');
                        const hasConflict = conflictMids?.has(meeting.id);
                        const hasSyncError = syncErrorMids?.has(meeting.id);
                        const timeLabel = formatCompactTimeRange(
                            meeting.displayStartTime ?? meeting.startTime,
                            meeting.displayEndTime ?? meeting.endTime,
                        );
                        return (
                            <div
                                key={meeting.id}
                                role="button"
                                tabIndex={0}
                                className={styles.row}
                                style={{
                                    borderLeftColor: meeting.primaryColor,
                                    backgroundColor: meeting.primaryColor ? toPastelColor(meeting.primaryColor) : undefined,
                                }}
                                onClick={() => onSelectMeeting(meeting.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectMeeting(meeting.id);
                                    }
                                }}
                            >
                                {hasSyncError && (
                                    <span role="img" aria-label="Sync failed" title="Sync failed" className={styles.syncError}>
                                        <Icon name="sync-error" />
                                    </span>
                                )}
                                <h3 className={styles.rowTitle} style={hasSyncError ? { paddingRight: 18 } : undefined}>
                                    {meeting.title}
                                </h3>
                                <p className={styles.rowMeta}>
                                    {locationLabel ? `${locationLabel} · ${timeLabel}` : timeLabel}
                                </p>
                                {hasConflict && (
                                    <p className={styles.conflictLine}>
                                        <Icon name="warning" className={styles.conflictIcon} />
                                        Double-booked{meeting.room ? ` in ${meeting.room}` : ''}
                                    </p>
                                )}
                                {meeting.tags && meeting.tags.length > 0 && (
                                    <TagList
                                        tags={meeting.tags}
                                        color={meeting.primaryColor ?? '#999'}
                                        gap={5}
                                        containerStyle={{ marginTop: 6 }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};

export default OverlapMeetingsPopover;
