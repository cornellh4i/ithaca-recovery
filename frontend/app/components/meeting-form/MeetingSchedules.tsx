import React from 'react';

import Dropdown from '../ui/inputs/Dropdown';
import DayPicker from '../ui/inputs/DayPicker';
import Icon from '../ui/displays/Icon';
import ModeTypeButtons from '../ui/inputs/ModeTypeButtons';
import ScheduleSummaryCard, { formatScheduleTimeRange } from './ScheduleSummaryCard';
import { ModeFields } from './MeetingForm';

import type { IRecurrencePattern } from '../../../types/models';
import type { LinkedScheduleDraft } from '../../../hooks/useMeetingForm';
import {
  availableModesFor,
  canLinkSchedule,
  claimedDaysFor,
  LINKED_SCHEDULE_MODES,
  type LinkedFamily,
  type LinkedScheduleRow,
} from '../../../util/meetings/linkedSchedules';
import { physicalRoomOptions, zoomRoomOptions } from '../../../util/rooms/rooms';
import { formatETLongDate } from '../../../util/date/timeUtils';

import styles from './MeetingSchedules.module.scss';

/** One of the meeting's already-saved schedules, as retrieve/meeting/[id] returns it. */
export interface SavedSchedule {
  modeType: string;
  recurrencePattern?: { daysOfWeek?: string[] | null } | null;
}

export interface MeetingSchedulesProps {
  /** The meeting's own recurrence editor (RecurringMeetingForm), mounted by the host. */
  recurrenceEditor: React.ReactElement;
  /** Whether the editor is collapsed into its summary card ("Done"). */
  isConfirmed: boolean;
  onEditSchedule: () => void;
  modeType: string;
  recurrencePattern: IRecurrencePattern | null;
  isRecurring: boolean;
  /** The Date/Time fields' current ET instants -- null while either is unparseable. */
  scheduleInstants: { startDateTime: Date; endDateTime: Date } | null;
  room: string;
  zoomRoom: string;
  /** Schedules this meeting already runs (the edit path); empty for a meeting being created. */
  savedSchedules?: SavedSchedule[];
  draft: LinkedScheduleDraft | null;
  onAddSchedule: (modeType: string) => void;
  onSelectDraftMode: (modeType: string) => void;
  onSelectDraftRoom: (room: string) => void;
  onSelectDraftZoomRoom: (zoomRoom: string) => void;
  onToggleDraftDay: (day: string) => void;
  onDiscardDraft: () => void;
  compact?: boolean;
  /**
   * Why a second schedule can't be started right now, when the reason is worth saying. Shown in
   * place of the trigger -- on the edit path, unsaved changes to the meeting itself, since the
   * update route takes the two as separate requests.
   */
  addBlockedNote?: string;
}

// How the linked schedule's own time and repeat are described, since it never picks them: they
// are derived server-side from this meeting, which is the only shape one Zoom meeting can hold.
function inheritedScheduleText(
  pattern: IRecurrencePattern | null,
  instants: { startDateTime: Date; endDateTime: Date } | null,
): string {
  const parts: string[] = [];
  if (instants) parts.push(formatScheduleTimeRange(instants.startDateTime, instants.endDateTime));
  const interval = pattern?.interval ?? 1;
  parts.push(interval > 1 ? `every ${interval} weeks` : 'every week');
  if (pattern?.endDate) {
    parts.push(`until ${formatETLongDate(new Date(pattern.endDate))}`);
  } else if (pattern?.numberOfOccurrences) {
    parts.push(`for ${pattern.numberOfOccurrences} occurrence${pattern.numberOfOccurrences === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

/**
 * The meeting's schedules: its own recurrence editor, collapsed into a card once confirmed, and
 * the second "linked" schedule it can run on other days in another mode.
 *
 * The linked schedule's mode and days are locked against the ones already in use (a family's
 * schedules must differ in mode and never share a weekday -- Zoom holds them as one union
 * schedule), and its Room / Zoom room fields are the meeting form's own, mounted for the union
 * of every mode still selectable here so nothing remounts as the admin toggles between them.
 */
const MeetingSchedules: React.FC<MeetingSchedulesProps> = ({
  recurrenceEditor,
  isConfirmed,
  onEditSchedule,
  modeType,
  recurrencePattern,
  isRecurring,
  scheduleInstants,
  room,
  zoomRoom,
  savedSchedules = [],
  draft,
  onAddSchedule,
  onSelectDraftMode,
  onSelectDraftRoom,
  onSelectDraftZoomRoom,
  onToggleDraftDay,
  onDiscardDraft,
  compact = false,
  addBlockedNote,
}) => {
  // Only a weekly series can carry a second schedule: the linked row's dates, interval and end
  // are re-derived from this one server-side, and Zoom holds the pair as a single weekly union.
  const isWeeklySeries = isRecurring && recurrencePattern?.type === 'weekly';

  const anchorRow: LinkedScheduleRow = {
    modeType,
    recurrencePattern: { daysOfWeek: recurrencePattern?.daysOfWeek ?? [] },
  };
  const savedRows: LinkedScheduleRow[] = savedSchedules.map((schedule) => ({
    modeType: schedule.modeType,
    recurrencePattern: { daysOfWeek: schedule.recurrencePattern?.daysOfWeek ?? [] },
  }));
  // The family the draft is being composed AGAINST -- deliberately excluding the draft itself, so
  // its own current mode stays selectable and its own days stay clickable.
  const familyBeforeDraft: LinkedFamily = { anchor: anchorRow, linked: savedRows };
  const candidateModes = availableModesFor(familyBeforeDraft);
  const claimedDays = claimedDaysFor(familyBeforeDraft);
  // Counts a saved schedule and an in-progress draft alike: one meeting runs at most
  // LINKED_SCHEDULE_CAP schedules in any state.
  const draftRow: LinkedScheduleRow[] = draft
    ? [{ modeType: draft.modeType, recurrencePattern: { daysOfWeek: draft.daysOfWeek } }]
    : [];
  const canAddSchedule = canLinkSchedule({ anchor: anchorRow, linked: [...savedRows, ...draftRow] });

  const primarySummary = scheduleInstants && {
    modeType,
    recurrencePattern: recurrencePattern
      ? {
          type: recurrencePattern.type,
          weekOfMonth: recurrencePattern.weekOfMonth ?? null,
          dayOfMonth: recurrencePattern.dayOfMonth ?? null,
          daysOfWeek: recurrencePattern.daysOfWeek ?? [],
        }
      : null,
    startDateTime: scheduleInstants.startDateTime,
    endDateTime: scheduleInstants.endDateTime,
    room,
    zoomRoom,
  };

  return (
    <div className={styles.schedules}>
      {/* Kept mounted while collapsed, not unmounted: remounting would reseed the recurrence
          controls from the stored pattern and lose everything edited in this session. */}
      <div className={isConfirmed ? styles.collapsedEditor : undefined}>{recurrenceEditor}</div>

      {isConfirmed && primarySummary && (
        <>
          <ScheduleSummaryCard schedule={primarySummary} />
          <div className={styles.actionRow}>
            <button type="button" className={styles.linkButton} onClick={onEditSchedule}>
              Edit this schedule
            </button>
          </div>
        </>
      )}

      {isConfirmed && isWeeklySeries && !draft && canAddSchedule && !addBlockedNote && (
        <button type="button" className={styles.addButton} onClick={() => onAddSchedule(candidateModes[0])}>
          <Icon name="plus" size={16} />
          Add another mode for other days
        </button>
      )}

      {isConfirmed && isWeeklySeries && !draft && canAddSchedule && addBlockedNote && (
        <p className={styles.blockedNote}>
          <Icon name="warning-circle" size={16} />
          <span>{addBlockedNote}</span>
        </p>
      )}

      {draft && (
        <div className={styles.scheduleCard}>
          <div className={styles.cardHeader}>
            <h4 className={styles.cardHeading}>New linked schedule</h4>
            <button type="button" className={styles.linkButton} onClick={onDiscardDraft}>
              Cancel
            </button>
          </div>
          <p className={styles.cardNote}>
            The same meeting on other days in another mode, sharing its one Zoom meeting. It keeps
            this meeting&apos;s time, length and repeat: {inheritedScheduleText(recurrencePattern, scheduleInstants)}.
          </p>

          <span className={styles.fieldCaption}>Mode</span>
          <ModeTypeButtons
            selectedMode={draft.modeType}
            onModeSelect={onSelectDraftMode}
            compact={compact}
            disabledModes={LINKED_SCHEDULE_MODES.filter((mode) => !candidateModes.includes(mode))}
          />

          <span className={styles.fieldCaption}>Days</span>
          <DayPicker
            selectedDays={draft.daysOfWeek}
            onToggleDay={onToggleDraftDay}
            disabledDays={claimedDays}
            compact={compact}
          />

          {/* The meeting form's own Room / Zoom room / Zoom host block, mounted for every mode
              still selectable above rather than for the one currently picked -- so the fields
              don't come and go (dropping what was typed in them) as the admin toggles modes. */}
          <ModeFields
            modes={candidateModes}
            roomSelectionDropdown={
              <Dropdown
                label={<Icon name="location" size={28} ariaLabel="Location Icon" />}
                value={draft.room}
                isVisible={true}
                elements={physicalRoomOptions}
                name="Select linked schedule room"
                onChange={onSelectDraftRoom}
                compact={compact}
              />
            }
            zoomRoomDropdown={
              <Dropdown
                key={draft.zoomRoom}
                label={<Icon name="video-call" size={28} ariaLabel="Zoom Icon" />}
                value={draft.zoomRoom}
                isVisible={true}
                elements={zoomRoomOptions}
                name="Select linked schedule Zoom room"
                onChange={onSelectDraftZoomRoom}
                compact={compact}
              />
            }
            // Not a picker: a linked schedule never books a host of its own -- it joins the
            // meeting's existing Zoom meeting, which is the whole point of linking it.
            zoomHostDropdown={<p className={styles.inheritedValue}>Shares this meeting&apos;s Zoom host and join link.</p>}
            zoomHostHint=""
          />
        </div>
      )}
    </div>
  );
};

export default MeetingSchedules;
