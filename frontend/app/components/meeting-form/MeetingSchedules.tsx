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
  isZoomBearing,
  LINKED_SCHEDULE_MODES,
  type LinkedFamily,
  type LinkedScheduleRow,
} from '../../../util/meetings/linkedSchedules';
import { modeFieldRequirement } from '../../../util/rooms/modeFields';
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
  /** Whether the editor is collapsed into its summary card. */
  isConfirmed: boolean;
  onEditSchedule: () => void;
  /** Collapses the meeting's own recurrence editor into its summary card (the Done button). */
  onConfirmSchedule: () => void;
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
  /** Whether the draft is collapsed into its own summary card, as `isConfirmed` does above. */
  isDraftConfirmed: boolean;
  /**
   * Whether a draft was dropped because the meeting stopped repeating weekly, so the warning
   * explaining that stands where the card was.
   */
  draftDiscardedNote?: boolean;
  /** Collapses this meeting's own schedule into its summary card AND opens the second one. */
  onAddSchedule: (modeType: string) => void;
  onSelectDraftMode: (modeType: string) => void;
  onSelectDraftRoom: (room: string) => void;
  onSelectDraftZoomRoom: (zoomRoom: string) => void;
  onToggleDraftDay: (day: string) => void;
  onDiscardDraft: () => void;
  onConfirmDraft: () => void;
  onEditDraft: () => void;
  compact?: boolean;
  /**
   * Why a second schedule can't be started right now, when the reason is worth saying. Disables
   * the trigger and explains it -- on the edit path, unsaved changes to the meeting itself, since
   * the update route takes the two as separate requests.
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
 * The meeting's schedules: its own recurrence editor, collapsed into a card once a second
 * schedule is started, and the second "linked" schedule it runs on other days in another mode.
 *
 * The linked schedule's mode and days are locked against the ones already in use (a family's
 * schedules must differ in mode and never share a weekday -- Zoom holds them as one union
 * schedule), and its Room / Zoom room fields are the meeting form's own, mounted for whichever
 * mode it currently uses.
 */
const MeetingSchedules: React.FC<MeetingSchedulesProps> = ({
  recurrenceEditor,
  isConfirmed,
  onEditSchedule,
  onConfirmSchedule,
  modeType,
  recurrencePattern,
  isRecurring,
  scheduleInstants,
  room,
  zoomRoom,
  savedSchedules = [],
  draft,
  isDraftConfirmed,
  draftDiscardedNote = false,
  onAddSchedule,
  onSelectDraftMode,
  onSelectDraftRoom,
  onSelectDraftZoomRoom,
  onToggleDraftDay,
  onDiscardDraft,
  onConfirmDraft,
  onEditDraft,
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

  // The trigger below is a single step: it collapses this meeting's own schedule into its summary
  // card AND opens the second one. So it is offered only once there is something to collapse into
  // and something for the linked schedule to inherit -- a weekly series that meets on at least one
  // weekday, plus a readable time range. Offered from the expanded editor as well as from the
  // collapsed card, so composing the pair never takes two clicks.
  const hasInheritableSchedule =
    isWeeklySeries && (recurrencePattern?.daysOfWeek?.length ?? 0) > 0 && scheduleInstants !== null;
  const offersSecondSchedule = hasInheritableSchedule && !draft && canAddSchedule;
  const blockedNoteId = React.useId();

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

  // Same guard the primary card uses: with no readable time range there is nothing to summarise,
  // so the editor stays open rather than collapsing into a half-empty card.
  const draftSummary = draft &&
    scheduleInstants && {
      modeType: draft.modeType,
      recurrencePattern: {
        type: 'weekly',
        weekOfMonth: null,
        dayOfMonth: null,
        daysOfWeek: draft.daysOfWeek,
      },
      startDateTime: scheduleInstants.startDateTime,
      endDateTime: scheduleInstants.endDateTime,
      room: draft.room,
      zoomRoom: draft.zoomRoom,
    };

  // Everything the draft still owes before it can be collapsed -- including a readable time range,
  // without which draftSummary above can't be built and Done would be a dead click.
  const draftRequired = modeFieldRequirement(draft ? [draft.modeType] : []);
  const isDraftComplete =
    !!draft &&
    isWeeklySeries &&
    scheduleInstants !== null &&
    draft.daysOfWeek.length > 0 &&
    (!draftRequired.room || !!draft.room) &&
    (!draftRequired.zoomRoom || !!draft.zoomRoom);

  return (
    <div className={styles.schedules}>
      {/* Kept mounted while collapsed, not unmounted: remounting would reseed the recurrence
          controls from the stored pattern and lose everything edited in this session. */}
      <div className={isConfirmed ? styles.collapsedEditor : undefined}>{recurrenceEditor}</div>

      {/* Same contract as the draft's Done: collapses the editor into its card, nothing more --
          offered only while there is a recurrence box to collapse, and disabled while the card
          couldn't yet say anything useful (no readable time, or a weekly series with no day). */}
      {!isConfirmed && isRecurring && (
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.doneButton}
            onClick={onConfirmSchedule}
            disabled={
              scheduleInstants === null ||
              recurrencePattern === null ||
              (recurrencePattern.type === 'weekly' && (recurrencePattern.daysOfWeek?.length ?? 0) === 0)
            }
            data-testid="schedule-done"
          >
            Done
          </button>
        </div>
      )}

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

      {offersSecondSchedule && (
        <>
          {/* Disabled rather than withheld when blocked: the note below reads as the reason this
              control is off, not as an unprompted warning about a schedule nobody asked for. */}
          <button
            type="button"
            className={styles.addButton}
            onClick={() => onAddSchedule(candidateModes[0])}
            disabled={!!addBlockedNote}
            aria-describedby={addBlockedNote ? blockedNoteId : undefined}
          >
            <Icon name="plus" size={16} />
            Add another mode for other days
          </button>
          {addBlockedNote && (
            <p className={styles.blockedNote} id={blockedNoteId}>
              <Icon name="warning-circle" size={16} />
              <span>{addBlockedNote}</span>
            </p>
          )}
        </>
      )}

      {/* Rendered independently of the draft: the point of it is that the draft is gone. A live
          region because nothing the admin did on this region raised it -- editing the recurrence
          above discarded the card for them. The region itself stays in the DOM empty, since a
          live region inserted together with its text is announced unreliably. */}
      <p className={styles.blockedNote} role="status" data-testid="linked-schedule-discarded-note">
        {draftDiscardedNote && (
          <>
            <Icon name="warning-circle" size={16} />
            <span>The linked schedule was removed because this meeting no longer repeats weekly.</span>
          </>
        )}
      </p>

      {isDraftConfirmed && draftSummary && (
        <>
          <ScheduleSummaryCard schedule={draftSummary} onRemove={onDiscardDraft} />
          <div className={styles.actionRow}>
            {/* Named by its mode, visibly: both edit links can be on screen at once, and
                distinguishing them in an aria-label alone would leave two identical visible
                labels (WCAG 2.5.3 Label in Name). */}
            <button type="button" className={styles.linkButton} onClick={onEditDraft}>
              {`Edit the ${draft.modeType} schedule`}
            </button>
          </div>
        </>
      )}

      {draft && !(isDraftConfirmed && draftSummary) && (
        <div className={styles.scheduleCard} data-testid="linked-schedule-draft">
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

          {/* Grouped and named the same way the form's own multi-control fields are: a caption
              can't be a <label> for several controls at once. */}
          <div role="group" aria-label="Linked schedule mode">
            <span className={styles.fieldCaption}>Mode</span>
            <ModeTypeButtons
              selectedMode={draft.modeType}
              onModeSelect={onSelectDraftMode}
              compact={compact}
              disabledModes={LINKED_SCHEDULE_MODES.filter((mode) => !candidateModes.includes(mode))}
            />
          </div>

          <div role="group" aria-label="Linked schedule days">
            <span className={styles.fieldCaption}>Days</span>
            <DayPicker
              selectedDays={draft.daysOfWeek}
              onToggleDay={onToggleDraftDay}
              disabledDays={claimedDays}
              compact={compact}
            />
          </div>

          {/* The meeting form's own Room / Zoom room / Zoom host block, showing exactly what the
              picked mode uses. Switching modes clears the fields the new mode doesn't use
              (useMeetingForm.ts's selectLinkedDraftMode), so a room chosen under one mode can't
              reach the payload as a resource the chosen mode never books. */}
          <ModeFields
            modes={[draft.modeType]}
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
            // Not a picker either way: the family's one Zoom meeting is created against
            // whichever schedule needs it, and its host is resolved from the pool server-side.
            // Which schedule that is depends on the meeting's own mode -- an In Person meeting
            // has no Zoom meeting to share, so this schedule is the one that mints it (and
            // consumes host capacity), which the copy must not claim otherwise.
            zoomHostDropdown={
              <p className={styles.inheritedValue}>
                {isZoomBearing({ modeType })
                  ? "Shares this meeting's Zoom host and join link."
                  : "Books its own Zoom host and join link, as this meeting is in person."}
              </p>
            }
            zoomHostHint=""
          />

          {/* Collapses the card, nothing more -- the schedule is written by the form's own
              Create/Save, so this is disabled only while the draft is still missing something
              the summary card would need: a day, a room the mode uses, or a readable time. */}
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.doneButton}
              onClick={onConfirmDraft}
              disabled={!isDraftComplete}
              data-testid="linked-schedule-done"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingSchedules;
