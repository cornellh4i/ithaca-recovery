import React from 'react';

import Icon from '../ui/displays/Icon';
import { MODE_ICON_NAME } from '../../../util/rooms/modeIcons';
import { formatDayColumn } from '../../../util/meetings/recurrenceDisplay';
import { formatCompactTimeRange } from '../../../util/date/timeFormat';

import styles from './ScheduleSummaryCard.module.scss';

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what formatCompactTimeRange expects
// -- mirrors ViewMeeting.tsx's etTimeFmt.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
});

const stripZoomSuffix = (name: string): string => name.replace(/ - Zoom$/, '');

/** The pattern fields the card's Day line reads -- structurally satisfied by IRecurrencePattern. */
export interface ScheduleSummaryPattern {
  type: string;
  weekOfMonth?: number | null;
  dayOfMonth?: number | null;
  daysOfWeek?: string[] | null;
}

/**
 * One schedule of a meeting, as the card displays it. Deliberately structural rather than
 * `ILinkedSchedule`: the same card renders a saved family member (from
 * retrieve/meeting/[id]'s `linkedSchedules`) and a schedule that only exists in form state and
 * has no mid or sync status yet.
 *
 * Dates are accepted as strings too -- a saved schedule arrives over JSON, so its
 * `startDateTime` is a string at runtime whatever the declared type says.
 */
export interface ScheduleSummary {
  modeType: string;
  recurrencePattern?: ScheduleSummaryPattern | null;
  startDateTime: Date | string;
  endDateTime: Date | string;
  room?: string | null;
  zoomRoom?: string | null;
  googleSyncStatus?: string | null;
  zoomSyncStatus?: string | null;
}

/**
 * A schedule's own line: the days it meets and its ET time range, e.g. `"Sat · 9 - 10 AM"`
 * (just the time range for a one-time schedule). Exported so anything referring to a schedule
 * outside the card -- the removal confirmation, a toast -- names it the same way the card does.
 */
/**
 * A schedule's ET time range on its own, e.g. `"9 - 10 AM"`. Exported so anything echoing the
 * time a second schedule inherits reads it exactly as the card does.
 */
export function formatScheduleTimeRange(start: Date | string, end: Date | string): string {
  // new Date() wrap: a saved schedule comes off a JSON fetch, so these are strings at runtime
  // despite the Date type -- Intl.format throws on one unwrapped.
  return formatCompactTimeRange(etTimeFmt.format(new Date(start)), etTimeFmt.format(new Date(end)));
}

export function formatScheduleLine(schedule: ScheduleSummary): string {
  const { recurrencePattern } = schedule;
  const dayText = formatDayColumn(
    recurrencePattern
      ? {
          type: recurrencePattern.type,
          weekOfMonth: recurrencePattern.weekOfMonth ?? null,
          dayOfMonth: recurrencePattern.dayOfMonth ?? null,
          daysOfWeek: recurrencePattern.daysOfWeek ?? [],
        }
      : null,
  );
  const timeText = formatScheduleTimeRange(schedule.startDateTime, schedule.endDateTime);
  return dayText ? `${dayText} · ${timeText}` : timeText;
}

export interface ScheduleSummaryCardProps {
  schedule: ScheduleSummary;
  /**
   * Where this schedule's own meeting form lives (`/?mid=<mid>&edit=1`). Renders the line
   * pointing the admin at it -- a linked schedule's own mode, days, room and host are edited
   * there, never from inside the meeting it's linked to.
   */
  editHref?: string;
  /** Omitted entirely (not rendered disabled) when the host has no removal action wired up. */
  onRemove?: () => void;
  /** Blocks a second click while a removal already in flight finishes. */
  removeDisabled?: boolean;
}

// Read-only summary of one of a meeting's schedules: mode, the days it meets, its time range,
// and where it happens. The host owns every action and all state -- this renders what it is
// handed, so the same card serves an already-saved linked schedule and (from the create flow) a
// schedule that hasn't been written yet.
const ScheduleSummaryCard: React.FC<ScheduleSummaryCardProps> = ({
  schedule,
  editHref,
  onRemove,
  removeDisabled = false,
}) => {
  const { modeType, room, zoomRoom, googleSyncStatus, zoomSyncStatus } = schedule;
  // A Hybrid schedule's Zoom room is usually the auto-paired one for its physical room, and
  // naming the same room twice reads as a mistake -- so it's only added when it differs.
  const zoomRoomText = zoomRoom ? stripZoomSuffix(zoomRoom) : null;
  const locationText = [room, zoomRoomText === room ? null : zoomRoomText].filter(Boolean).join(' · ');

  // Not yet live on the service in question. 'error' counts as waiting rather than broken: a
  // schedule created while the Zoom host pool was exhausted lands here with no calendar events
  // at all, and the fix is the same retry sync either way. A null status is a row that never
  // reported one (legacy/backfilled rows) -- not a claim that anything is outstanding.
  const isWaiting = (status: string | null | undefined): boolean => status === 'pending' || status === 'error';
  const waitingOn = [
    isWaiting(googleSyncStatus) ? 'Google Calendar' : null,
    isWaiting(zoomSyncStatus) ? 'Zoom' : null,
  ].filter(Boolean);

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <span className={styles.mode}>
          {MODE_ICON_NAME[modeType] && <Icon name={MODE_ICON_NAME[modeType]} size={16} />}
          {modeType}
        </span>
        {onRemove && (
          <button
            type="button"
            className={styles.removeButton}
            onClick={onRemove}
            disabled={removeDisabled}
            aria-label={`Remove the ${modeType} schedule`}
          >
            Remove
          </button>
        )}
      </div>

      <p className={styles.scheduleLine}>
        <Icon name="clock" size={16} />
        <span>{formatScheduleLine(schedule)}</span>
      </p>

      {locationText && (
        <p className={styles.scheduleLine}>
          <Icon name="location" size={16} />
          <span>{locationText}</span>
        </p>
      )}

      {waitingOn.length > 0 && (
        <p className={styles.waitingNote}>
          <Icon name="warning-circle" size={16} />
          <span>Waiting to sync with {waitingOn.join(' and ')} — this schedule isn&apos;t live there yet.</span>
        </p>
      )}

      {editHref && (
        <p className={styles.editHint}>
          <Icon name="link" size={16} />
          <span>
            <a href={editHref} className={styles.editLink}>Open this schedule</a> to change its
            mode, days, room, or host.
          </span>
        </p>
      )}
    </div>
  );
};

export default ScheduleSummaryCard;
