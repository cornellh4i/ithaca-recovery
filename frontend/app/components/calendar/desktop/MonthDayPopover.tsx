import React, { useEffect, useRef } from "react";
import styles from "./MonthDayPopover.module.scss";
import { formatCompactTimeRange, formatETDateLine } from "../../../../util/date/timeFormat";
import { pluralize } from "../../../../util/format/plural";
import Icon from "../../ui/displays/Icon";

export interface MonthDayPopoverMeeting {
    key: string;
    id: string;
    title: string;
    color: string;
    startTime: string; // "HH:MM" ET, true (unclipped) time
    endTime: string;
    // Displayed location: the physical room, the Zoom room when only that keeps it visible,
    // or "Remote" -- same fallback the Day/Week chips use.
    location: string;
    // The meeting's own physical room, for the double-booked line. Never the Zoom room: a
    // Zoom room isn't a place that can be double-booked from an attendee's point of view.
    physicalRoom: string | null;
}

interface MonthDayPopoverProps {
    date: Date;
    meetings: MonthDayPopoverMeeting[];
    // Admin-only (see hooks/useConflictMids) -- empty for public viewers, so no conflict UI
    // renders for them at all.
    conflictMids?: Set<string>;
    // Which side of the cell the panel hangs from: the cell's left edge for the first five
    // weekday columns, its right edge for the last two, so it never runs off the grid.
    align: "left" | "right";
    // restoreFocus: true for ✕/Escape (focus goes back to the cell), false for an outside
    // click (focus stays wherever the user clicked).
    onClose: (restoreFocus: boolean) => void;
    onOpenDay: () => void;
}

// Day popover for the desktop Month view (GitHub #461). Rendered as an absolutely-positioned
// child of its grid cell, not portaled: a portal would leave the cell's stacking context and
// the outside-click check below, which is the z-index/outside-click bug class this app has hit
// before with portaled popups.
const MonthDayPopover: React.FC<MonthDayPopoverProps> = ({
    date,
    meetings,
    conflictMids,
    align,
    onClose,
    onOpenDay,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const title = formatETDateLine(date);
    const titleId = `month-day-popover-${title.replace(/\W+/g, "-")}`;

    const doubleBookedCount = conflictMids ? meetings.filter(m => conflictMids.has(m.id)).length : 0;
    const subline = [
        meetings.length === 0 ? "No meetings" : pluralize(meetings.length, "meeting"),
        doubleBookedCount > 0 ? `${doubleBookedCount} double-booked` : null,
    ].filter(Boolean).join(" · ");

    // Focus moves into the panel on open so Escape and Tab work from the keyboard, and the
    // panel scrolls into view when it opens from one of the grid's lower rows.
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        panel.focus();
        panel.scrollIntoView?.({ block: "nearest" });
    }, []);

    // Outside click and Escape. The owning cell (the panel's parent element) counts as
    // "inside": the cell's own click toggles the panel, and treating a mousedown on it as an
    // outside click would close the panel right before that click reopened it.
    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            const cell = panelRef.current?.parentElement;
            if (cell && event.target instanceof Node && !cell.contains(event.target)) {
                onClose(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose(true);
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            ref={panelRef}
            className={`${styles.panel} ${align === "right" ? styles.alignRight : styles.alignLeft}`}
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
        >
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <h3 id={titleId} className={styles.title}>{title}</h3>
                    <p className={styles.subline}>{subline}</p>
                </div>
                <button type="button" className={styles.closeButton} aria-label="Close" onClick={() => onClose(true)}>
                    <Icon name="close" />
                </button>
            </div>

            {meetings.length > 0 && (
                <ul className={styles.list}>
                    {meetings.map((meeting) => {
                        const isDoubleBooked = !!conflictMids?.has(meeting.id);
                        return (
                            <li key={meeting.key} className={styles.row}>
                                <span
                                    className={styles.dot}
                                    // Data-driven room color, same value as the cell's dot.
                                    style={{ backgroundColor: meeting.color }}
                                    aria-hidden="true"
                                />
                                <div className={styles.rowText}>
                                    <span className={styles.rowTitle} title={meeting.title}>{meeting.title}</span>
                                    <span className={styles.rowMeta}>
                                        {formatCompactTimeRange(meeting.startTime, meeting.endTime)} · {meeting.location}
                                    </span>
                                    {isDoubleBooked && (
                                        <span className={styles.conflictLine}>
                                            ⚠ Double-booked{meeting.physicalRoom ? ` in ${meeting.physicalRoom}` : ""}
                                        </span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <button type="button" className={styles.openDayLink} onClick={onOpenDay}>
                Open day view →
            </button>
        </div>
    );
};

export default MonthDayPopover;
