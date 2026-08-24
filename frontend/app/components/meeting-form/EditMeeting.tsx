import React, { useRef, useState } from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../ui/inputs/TextField';
import Icon from '../ui/displays/Icon';
import ModeTypeButtons from '../ui/inputs/ModeTypeButtons';
import DatePicker from '../ui/pickers/DatePicker';
import TimePicker from '../ui/pickers/TimePicker';
import Dropdown from '../ui/inputs/Dropdown';
import LabeledCheckbox from '../ui/inputs/CheckBox';
import RecurringMeetingForm from './RecurringMeeting';
import ZoomHostField from './ZoomHostField';
import ConflictOverrideModal from './ConflictOverrideModal';
import DiscardChangesModal from './DiscardChangesModal';
import FormValidationBanner from './FormValidationBanner';
import EditRecurringModal, { EditScope } from './EditRecurringModal';
import IconButton from '../ui/buttons/IconButton';
import ScheduleSummaryCard, { formatScheduleLine } from './ScheduleSummaryCard';
import MeetingSchedules from './MeetingSchedules';
import RemoveLinkedScheduleModal from './RemoveLinkedScheduleModal';

import { ILinkedSchedule, IMeeting } from '../../../types/models'
import { isZoomBearing } from '../../../util/meetings/linkedSchedules';
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR, DESCRIPTION_MAX_LENGTH, MeetingFormPayload } from '../../../hooks/useMeetingForm';
import { ConflictListRow } from '../../../util/meetings/conflictDisplay';
import { useToast } from '../shared/ToastProvider';
import { pollMeetingSyncStatus, describeSyncFailure } from '../../../services/syncMeeting';
import { convertETToUTC, formatETDateString, formatETLongDate, getETTimeOfDay, isDstGapError } from '../../../util/date/timeUtils';

import styles from './MeetingForm.module.scss';

// "the date the action takes effect" for EditRecurringModal -- mirrors ViewMeeting.tsx's
// identical helper (same copy convention across the app's recurring-scope modals).
const formatEffectiveDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' })
    .format(date);

// Not part of IMeeting (types/models.ts is shared with the concurrently-in-progress backend
// work) -- these three fields are the update/meeting PUT contract's edit-scope extension.
// editScope/occurrenceDate drive server-side occurrence splitting; newMid is only ever read
// off a response, never sent.
type EditMeetingPayload = MeetingFormPayload & {
  editScope?: EditScope;
  occurrenceDate?: string;
};

interface EditMeetingSidebarProps {
  meeting: IMeeting;
  onClose: () => void;
  onUpdateSuccess: () => void;
  // "wide" is used when this form is embedded inline in a wider context (e.g. the Diagnostics
  // Conflicts panel) rather than the narrow Main Calendar sidebar. See MeetingForm's layout prop.
  layout?: "sidebar" | "wide";
  // The specific occurrence to scope 'this'/'thisAndFollowing' against. Either the calendar
  // box/popup click date (same value page.tsx's handleDelete sends as deleteOption's
  // occurrenceDate/lastClickedDate) or, for ConflictList's Diagnostics embed, the conflicting
  // meeting's own occurrence from the conflict row (ConflictMeetingSummary.occurrence) -- a real
  // date the row is already about, not a click. Absent at the SyncIssuesCard Diagnostics mount
  // site, which has no occurrence-specific data at all (sync status is series-level) -- absence
  // there forces the scope dialog's scoped options off (EditRecurringModal's disableScoped),
  // requiring an explicit "All events" confirmation instead of silently scoping 'all'.
  occurrenceDate?: Date | null;
}

const EditMeetingSidebar: React.FC<EditMeetingSidebarProps> =
  ({ meeting, onClose, onUpdateSuccess, layout = "sidebar", occurrenceDate }) => {
    const {
      title: inputMeetingTitleValue, setTitle: setMeetingTitleValue,
      mode: selectedMode,
      date: dateValue, setDate: setDateValue,
      time: timeValue, setTime: setTimeValue,
      email: inputEmailValue, setEmail: setEmailValue,
      description: inputDescriptionValue, setDescription: setDescriptionValue,
      room: selectedRoom,
      calTypes: selectedCalTypes,
      zoomRoom: selectedZoomRoom, setZoomRoom: setSelectedZoomRoom,
      zoomHost: selectedZoomHost, setZoomHost: setSelectedZoomHost,
      isRecurring,
      recurrencePattern,
      scheduleInstants,
      isScheduleConfirmed, setIsScheduleConfirmed,
      linkedDraft,
      startLinkedDraft,
      updateLinkedDraft,
      selectLinkedDraftMode,
      selectLinkedDraftRoom,
      toggleLinkedDraftDay,
      discardLinkedDraft,
      isLinkedDraftConfirmed, setIsLinkedDraftConfirmed,
      linkedDraftDiscardedNote,
      isAnchorDirty,
      handleRecurringMeetingChange,
      handleRoomChange,
      handleModeSelect,
      handleCalTypeToggle,
      getValidationErrors,
      buildMeetingPayload,
      setSubmitAttempted,
      liveValidationErrors,
      markFieldTouched,
      getFieldError,
      timeRangeError,
      isOvernight,
      isDirty,
      isRecurrenceDirty,
      isDateDirty,
      isModeDirty,
      isHostDirty,
    } = useMeetingForm(meeting);

    // Populated only for admin sessions by retrieve/meeting/[id] -- empty for a meeting whose
    // Zoom link is its own.
    const sharedWithText = (meeting.sharedWith ?? [])
      .map((row) => `${row.title} (${row.modeType})`)
      .join(', ');

    // This meeting's OTHER schedules, if it runs as a linked family. Read-only here: a linked
    // schedule's own mode/days/room are edited from its own form (it's an ordinary meeting row
    // with its own mid), so this form only shows what it is and offers to remove it.
    const linkedSchedules = meeting.linkedSchedules ?? [];
    const [scheduleToRemove, setScheduleToRemove] = useState<ILinkedSchedule | null>(null);
    const [isRemovingSchedule, setIsRemovingSchedule] = useState(false);

    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Holds the payload + conflict rows across the confirm round-trip -- a 409 doesn't discard
    // the edit, it just pauses submission until the modal's Cancel or "Save anyway". The
    // conflict retry (onConfirm below) resubmits this exact payload, so any editScope/
    // occurrenceDate applyEditScope already stamped onto it survives the retry for free.
    const [conflictState, setConflictState] = useState<{ payload: EditMeetingPayload; conflicts: ConflictListRow[] } | null>(null);
    // Narrow Main Calendar sidebar gets ~80%-scaled field fonts; the "wide" embed (e.g.
    // Diagnostics Conflicts panel) has room to spare and keeps full size.
    const compact = layout === "sidebar";
    const [isDiscardPromptOpen, setIsDiscardPromptOpen] = useState(false);
    // A scope choice only makes sense when the meeting was AND still is recurring. Turning
    // recurrence off in the form (meeting.isRecurring true, current isRecurring false) is
    // inherently an all-events restructure -- the payload carries no recurrencePattern, so scope
    // 'thisAndFollowing' would 400 server-side and 'this' is already disabled by
    // isRecurrenceDirty -- so that case skips the modal too and submits as today (no editScope,
    // whole-series behavior). Turning recurrence ON for a previously non-recurring meeting also
    // skips it: there's no existing series for occurrenceDate to scope against.
    //
    // Occurrence context (absent at the Diagnostics Sync Issues mount site, which has no click
    // to attribute a date to -- ConflictList passes the actual conflicting occurrence instead)
    // still opens the modal, just with 'this'/'thisAndFollowing' disabled -- see
    // EditRecurringModal's disableScoped, mirroring DeleteRecurringModal's identical gate. This
    // makes an all-occurrences edit an informed, explicit choice instead of the previous silent
    // whole-series rewrite.
    const canScopeEdit = !!(meeting.isRecurring && isRecurring);
    // The Date field below always shows the series' anchor (meeting.startDateTime), never the
    // clicked occurrence -- admins opening a mid-series occurrence (e.g. Sept 23 on the
    // calendar) otherwise see an unexplained Sept 9. Independent of canScopeEdit: this is a
    // display clarification, not a scoping precondition, so it stays even when e.g. the meeting
    // isn't currently recurring in the form.
    const showOccurrenceDateHint = !!(occurrenceDate &&
      // new Date() wrap: meeting comes off a JSON fetch, so startDateTime is a string at
      // runtime despite IMeeting's Date type -- Intl.format throws on it unwrapped.
      formatETDateString(occurrenceDate) !== formatETDateString(new Date(meeting.startDateTime)));
    const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
    // The payload built at the moment Save was pressed -- EditRecurringModal's own choice
    // handler applies the scope onto this rather than rebuilding from current form state, since
    // nothing in the form can change while the modal is up front of it.
    const pendingPayloadRef = useRef<IMeeting | null>(null);

    // Both user-driven close paths (Cancel, the X) go through here, so neither can silently
    // drop in-progress edits.
    const requestClose = () => {
      if (isDirty) {
        setIsDiscardPromptOpen(true);
        return;
      }
      onClose();
    };

    const submitMeeting = async (payload: EditMeetingPayload, confirmOverride: boolean) => {
      setIsSubmitting(true);
      try {
        const response = await fetch('/api/update/meeting', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, confirmOverride }),
        });

        if (response.status === 409) {
          const body = await response.json();
          if (body.conflicts) {
            setConflictState({ payload, conflicts: body.conflicts });
            return;
          }
        }

        if (!response.ok) {
          // See NewMeeting.tsx's identical branch for why -- surfaces the server's actual
          // rejection reason (e.g. a meetingSchema refine()) instead of a bare status code.
          const body = await response.json().catch(() => null);
          const detail = body?.issues?.map((issue: { message: string }) => issue.message).join(' ') || body?.error;
          throw new Error(detail || `HTTP error! status: ${response.status}`);
        }

        const meetingResponse = await response.json();
        console.log(meetingResponse);
        setConflictState(null);
        // A linked-schedule save writes only the new schedule -- the meeting itself is read, not
        // updated (the route refuses a payload that does both), so it says what actually changed.
        const addedLinkedMid: string | undefined = meetingResponse.linkedMid;
        showToast({
          variant: "success",
          title: addedLinkedMid ? "Linked schedule added." : "Meeting updated successfully.",
        });
        discardLinkedDraft();
        onUpdateSuccess();
        onClose();

        // A scoped save ('this'/'thisAndFollowing') makes no Zoom call and writes no sync
        // status on the *parent* row -- meetingResponse.mid here is still the parent (see
        // update/meeting route's updatedParent response), so polling it would just re-read
        // whatever zoomSyncStatus it already had before this edit (possibly a stale 'error'
        // from something unrelated) and wrongly blame this successful save for it. Only the
        // new detached/tail row (newMid, polled below) reflects this edit's own outcome.
        //
        // A linked-schedule save is the same story for the same reason: it writes no field of the
        // meeting itself, so only the schedule it just created (linkedMid, polled below) reports
        // this save's own outcome.
        const isScoped = payload.editScope === 'this' || payload.editScope === 'thisAndFollowing'
          || !!payload.linkedSchedule;

        // Fire-and-forget -- see NewMeeting.tsx's identical call for why (the response above
        // is sent before the actual Zoom/Calendar sync runs). showToast is global, so this is
        // safe to resolve after the form itself has already closed.
        if (!isScoped) {
          pollMeetingSyncStatus(meetingResponse.mid, {
            expectGoogle: (payload.calType?.length ?? 0) > 0,
            expectZoom: payload.modeType === 'Hybrid' || payload.modeType === 'Remote',
          }).then((result) => {
            const message = describeSyncFailure(result);
            if (message) showToast({ variant: "error", title: message, persistent: true });
          });
        }

        // A 'this'/'thisAndFollowing' edit detaches or tails off a *new* row (newMid) that
        // inherits this meeting's Zoom link rather than getting one of its own -- no Zoom call
        // runs for it, so only Google Calendar sync is worth waiting on.
        if (meetingResponse.newMid) {
          pollMeetingSyncStatus(meetingResponse.newMid, {
            expectGoogle: (payload.calType?.length ?? 0) > 0,
            expectZoom: false,
          }).then((result) => {
            const message = describeSyncFailure(result);
            if (message) showToast({ variant: "error", title: message, persistent: true });
          });
        }

        // A linked schedule inherits the family's Zoom meeting rather than minting one, EXCEPT
        // when this meeting has none to inherit (an In Person meeting gaining a Hybrid/Remote
        // schedule) -- that one case really does run a Zoom create worth waiting on.
        if (addedLinkedMid) {
          const linkedMode = payload.linkedSchedule?.modeType;
          pollMeetingSyncStatus(addedLinkedMid, {
            expectGoogle: (payload.calType?.length ?? 0) > 0,
            expectZoom: !meeting.zid && (linkedMode === 'Hybrid' || linkedMode === 'Remote'),
          }).then((result) => {
            const message = describeSyncFailure(result);
            if (message) showToast({ variant: "error", title: message, persistent: true });
          });
        }
      } catch (error) {
        console.error('There was an error fetching the data:', error);
        showToast({
          variant: "error",
          title: error instanceof Error ? error.message : "Could not update the meeting.",
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    // Removing a linked schedule is a whole-series delete of that row through the ordinary
    // delete route -- it's a normal Meeting row, and that route already keeps the family's one
    // shared Zoom meeting alive for whichever schedule is left. Nothing about the form's own
    // in-progress edits is submitted or discarded here; the refresh onUpdateSuccess triggers
    // re-reads the meeting (and so the remaining schedules) without closing the panel.
    const confirmRemoveSchedule = async () => {
      if (!scheduleToRemove || isRemovingSchedule) return;
      setIsRemovingSchedule(true);
      try {
        const response = await fetch('/api/delete/meeting', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mid: scheduleToRemove.mid, deleteOption: 'all' }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `HTTP error! status: ${response.status}`);
        }
        setScheduleToRemove(null);
        showToast({ variant: "success", title: "Linked schedule removed." });
        onUpdateSuccess();
      } catch (error) {
        console.error('Could not remove the linked schedule:', error);
        showToast({
          variant: "error",
          title: error instanceof Error ? error.message : "Could not remove the linked schedule.",
        });
      } finally {
        setIsRemovingSchedule(false);
      }
    };

    // Scope: 'all' (or no occurrence context) submits the payload untouched -- current,
    // unscoped whole-series behavior. Scope 'this'/'thisAndFollowing' stamps editScope +
    // occurrenceDate on for the server, and strips recurrencePattern under 'this' specifically
    // (the server 400s a single-occurrence edit that still carries series recurrence rules;
    // EditRecurringModal also disables that option whenever recurrence was actually changed, so
    // this only ever discards an unmodified/inherited pattern, never a real edit).
    const applyEditScope = (payload: IMeeting, scope: EditScope): EditMeetingPayload => {
      if (scope === 'all' || !occurrenceDate) return payload;

      let { startDateTime, endDateTime } = payload;
      // The form seeds Date/Time from the series' anchor row (retrieve/meeting/[id] returns
      // the *master* row's startDateTime), not the clicked occurrence -- for a recurring
      // meeting those can be weeks apart. If the user left the Date field untouched, re-anchor
      // onto the occurrence's ET calendar date (keeping the form's, possibly edited,
      // time-of-day) so the detached/tail row lands on the right day instead of the anchor's.
      // An edited Date field is the user's explicit choice and is left alone. Mirrors
      // ViewMeeting.tsx's identical re-anchor for the View popup's own display.
      if (!isDateDirty) {
        const occurrenceDateStr = formatETDateString(occurrenceDate);
        const { hour, minute, second } = getETTimeOfDay(startDateTime);
        try {
          const newStart = new Date(convertETToUTC(`${occurrenceDateStr}T${hour}:${minute}:${second}`));
          // Milliseconds have no timezone component -- getETTimeOfDay doesn't carry them,
          // restore directly from the payload's own start rather than losing precision.
          newStart.setUTCMilliseconds(startDateTime.getUTCMilliseconds());
          const duration = endDateTime.getTime() - startDateTime.getTime();
          startDateTime = newStart;
          endDateTime = new Date(newStart.getTime() + duration);
        } catch (err) {
          // The occurrence date re-anchored onto this time-of-day lands in the DST
          // spring-forward gap -- not reachable in practice (the calendar never renders a gap
          // occurrence to click), guarded defensively so a future caller can't crash here.
          if (!isDstGapError(err)) throw err;
          console.warn(`Could not re-anchor onto ${occurrenceDateStr}: ${(err as Error).message}`);
        }
      }

      const scoped: EditMeetingPayload = {
        ...payload,
        startDateTime,
        endDateTime,
        editScope: scope,
        occurrenceDate: occurrenceDate.toISOString(),
      };
      if (scope === 'this') delete scoped.recurrencePattern;
      return scoped;
    };

    const updateMeeting = async () => {
      // Guards against duplicate/racing updates from rapid/double clicks — the
      // button is also disabled while submitting, but the state check is what
      // actually prevents a second in-flight request.
      if (isSubmitting) return;

      setSubmitAttempted(true);
      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        return;
      }

      const updatedMeeting = buildMeetingPayload(meeting.mid, meeting.status ?? 'Active', { withLinkedSchedule: true });
      if (!updatedMeeting) return;

      // A linked-schedule create is inherently whole-series (it adds another schedule to the
      // whole meeting, and the route 400s it under any other scope), so there is nothing to ask.
      if (canScopeEdit && !updatedMeeting.linkedSchedule) {
        pendingPayloadRef.current = updatedMeeting;
        setIsScopeModalOpen(true);
        return;
      }

      await submitMeeting(updatedMeeting, false);
    };

    const handleScopeChoice = async (scope: EditScope) => {
      const payload = pendingPayloadRef.current;
      pendingPayloadRef.current = null;
      if (!payload) return;
      await submitMeeting(applyEditScope(payload, scope), false);
    };

    return (
      <div>
        <div className={styles.meetingHeader}>
          <h3>Edit Meeting</h3>
          <IconButton
            name="close"
            ariaLabel="Close"
            onClick={requestClose}
            className={styles.iconButton}
          />
        </div>
        <FormValidationBanner errors={liveValidationErrors} />
        {showOccurrenceDateHint && (
          <p className={styles.occurrenceHint}>
            <Icon name="warning-circle" size={16} />
            {/* One span = one flex item: bare text children would each become their own
                anonymous item, and the whitespace at their boundaries (around the date)
                collapses away visually. */}
            <span>
              You opened this meeting from its {formatETLongDate(occurrenceDate as Date)} occurrence.
              The date below is the series&apos; start date, not this occurrence.
            </span>
          </p>
        )}
        {linkedSchedules.length > 0 && (
          <section className={styles.linkedSchedules} aria-labelledby="linked-schedules-heading">
            <h4 id="linked-schedules-heading" className={styles.linkedSchedulesHeading}>
              {linkedSchedules.length === 1 ? 'Linked schedule' : 'Linked schedules'}
            </h4>
            <p className={styles.linkedSchedulesNote}>
              This meeting also runs on other days in a different mode. The form below edits the
              schedule you opened — a linked schedule is edited from its own form.
            </p>
            {linkedSchedules.map((schedule) => (
              <ScheduleSummaryCard
                key={schedule.mid}
                schedule={schedule}
                // A full navigation, not a client-side route change: page.tsx reads ?mid= once
                // on mount to resolve a deep link.
                editHref={`/?mid=${encodeURIComponent(schedule.mid)}&edit=1`}
                onRemove={() => setScheduleToRemove(schedule)}
                removeDisabled={isRemovingSchedule}
              />
            ))}
          </section>
        )}
        <MeetingForm
          meetingTitleTextField={<TextField
            input="Meeting title"
            value={inputMeetingTitleValue}
            onChange={setMeetingTitleValue}
            onBlur={() => markFieldTouched("title")}
            error={getFieldError("title")}
            compact={compact}
          />}
          modeTypeButtons={<ModeTypeButtons
            selectedMode={selectedMode}
            onModeSelect={handleModeSelect}
            compact={compact}
          />}
          selectedMode={selectedMode}
          DatePicker={<DatePicker
            label={<Icon name="calendar" size={28} ariaLabel="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
            compact={compact}
          />}
          TimePicker={<TimePicker
            label={<Icon name="clock" size={28} ariaLabel="Clock Icon" />}
            value={timeValue}
            onChange={setTimeValue}
            disablePast={true}
            compact={compact}
          />}
          RecurringMeeting={
            <MeetingSchedules
              recurrenceEditor={
                <RecurringMeetingForm
                  onChange={handleRecurringMeetingChange}
                  startDate={dateValue}
                  initialValue={{
                    isRecurring: !!meeting.recurrencePattern,
                    recurrencePattern: meeting.recurrencePattern ?? null,
                  }}
                  layout={layout}
                />
              }
              isConfirmed={isScheduleConfirmed}
              onEditSchedule={() => setIsScheduleConfirmed(false)}
              onConfirmSchedule={() => setIsScheduleConfirmed(true)}
              modeType={selectedMode}
              recurrencePattern={recurrencePattern}
              isRecurring={isRecurring}
              scheduleInstants={scheduleInstants}
              room={selectedRoom}
              zoomRoom={selectedZoomRoom}
              savedSchedules={linkedSchedules}
              draft={linkedDraft}
              isDraftConfirmed={isLinkedDraftConfirmed}
              draftDiscardedNote={linkedDraftDiscardedNote}
              onAddSchedule={startLinkedDraft}
              onSelectDraftMode={selectLinkedDraftMode}
              onSelectDraftRoom={selectLinkedDraftRoom}
              onSelectDraftZoomRoom={(value) => updateLinkedDraft({ zoomRoom: value })}
              onToggleDraftDay={toggleLinkedDraftDay}
              onDiscardDraft={discardLinkedDraft}
              onConfirmDraft={() => setIsLinkedDraftConfirmed(true)}
              onEditDraft={() => setIsLinkedDraftConfirmed(false)}
              compact={compact}
              // The update route applies a linked-schedule create and an edit to the meeting
              // itself as two separate requests, and 400s a payload carrying both -- so the
              // trigger says why instead of leading into that rejection.
              addBlockedNote={isAnchorDirty
                ? "Save this meeting's changes first — a linked schedule is added on its own."
                : undefined}
            />
          }
          roomSelectionDropdown={
            <Dropdown
              label={<Icon name="location" size={28} ariaLabel="Location Icon" />}
              value={selectedRoom}
              isVisible={true}
              elements={physicalRoomOptions}
              name="Select Room"
              onChange={handleRoomChange}
              compact={compact}
            />
          }
          meetingTypeDropdown={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                className={styles.meetingTypeIcon}
                style={{ marginRight: '6px', display: 'flex', alignItems: 'center' }}
              >
                <Icon name="group" size={28} ariaLabel="Group Icon" />
              </span>
              <div
                data-testid="meeting-type-checkboxes"
                style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px' }}
              >
                {CAL_TYPE_OPTIONS.map(type => (
                  <LabeledCheckbox
                    key={type}
                    label={type}
                    checked={selectedCalTypes.includes(type)}
                    onChange={(_e) => handleCalTypeToggle(type)}
                    color={CAL_TYPE_COLOR}
                    uncheckedBg="#fff"
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          }
          zoomRoomDropdown={
            <Dropdown
              key={selectedZoomRoom}
              label={<Icon name="video-call" size={28} ariaLabel="Zoom Icon" />}
              value={selectedZoomRoom}
              isVisible={true}
              elements={zoomRoomOptions}
              name="Select Zoom Room"
              onChange={setSelectedZoomRoom}
              compact={compact}
            />
          }
          zoomHostDropdown={
            <ZoomHostField
              zoomHost={selectedZoomHost}
              onZoomHostChange={setSelectedZoomHost}
              isVisible={true}
              compact={compact}
              getCandidate={() => buildMeetingPayload(meeting.mid, meeting.status ?? 'Active')}
              lockedReason={meeting.zoomManaged === false
                ? "External Zoom link; host can't be reassigned from the app."
                : undefined}
              sharedLinkNote={sharedWithText
                ? `This Zoom link is shared with ${sharedWithText}; the schedule saved here feeds that same Zoom meeting.`
                : undefined}
            />
          }
          emailTextField={<TextField
            input="Email"
            type="email"
            label={<Icon name="mail" size={28} ariaLabel="Mail Icon" />}
            value={inputEmailValue}
            onChange={setEmailValue}
            onBlur={() => markFieldTouched("email")}
            error={getFieldError("email")}
            compact={compact}
          />}
          descriptionTextField={<TextField
            input="Description"
            label=""
            value={inputDescriptionValue}
            onChange={setDescriptionValue}
            onBlur={() => markFieldTouched("description")}
            error={getFieldError("description")}
            multiline
            maxLength={DESCRIPTION_MAX_LENGTH}
            compact={compact}
          />}
          handleMeetingSubmit={updateMeeting}
          onCancel={requestClose}
          buttonText={isSubmitting ? "Updating…" : "Update Meeting"}
          isSubmitting={isSubmitting}
          layout={layout}
          timeError={timeRangeError ?? undefined}
          timeNote={isOvernight ? "Ends the next day." : undefined}
        />
        <DiscardChangesModal
          isOpen={isDiscardPromptOpen}
          subject="edits to this meeting"
          onKeepEditing={() => setIsDiscardPromptOpen(false)}
          onDiscard={() => {
            setIsDiscardPromptOpen(false);
            onClose();
          }}
        />
        {canScopeEdit && (
          <EditRecurringModal
            isOpen={isScopeModalOpen}
            title={meeting.title}
            // No occurrence context (Sync Issues panel) falls back to the series' own anchor
            // date -- mirrors ViewMeeting.tsx's displayStartDate fallback for the same case.
            // disableScoped forces scope to 'all' whenever this fallback is in play, so this
            // date is never used to re-anchor a scoped save, only to render the message text.
            // new Date() wrap: meeting comes off a JSON fetch, so startDateTime is a string at
            // runtime despite IMeeting's Date type -- Intl.format throws on it unwrapped.
            effectiveDateText={formatEffectiveDate(new Date(occurrenceDate ?? meeting.startDateTime))}
            onClose={() => {
              setIsScopeModalOpen(false);
              pendingPayloadRef.current = null;
            }}
            onSave={handleScopeChoice}
            disableThis={isRecurrenceDirty}
            disableScopedEdits={isModeDirty || isHostDirty}
            disableThisAndFollowing={isDateDirty}
            disableScoped={!occurrenceDate}
          />
        )}
        {scheduleToRemove && (
          <RemoveLinkedScheduleModal
            isOpen
            title={meeting.title}
            modeType={scheduleToRemove.modeType}
            scheduleText={formatScheduleLine(scheduleToRemove)}
            // Whether the family's one Zoom meeting survives comes down to whether the schedule
            // left behind is on it: the delete route only tears a Zoom meeting down once no live
            // row still points at its zid (delete/meeting/route.ts's siblingCount guard). An
            // In-Person schedule was never on it in the first place.
            zoomImpact={
              !isZoomBearing(scheduleToRemove)
                ? 'none'
                : meeting.zid ? 'kept' : 'deleted'
            }
            onCancel={() => setScheduleToRemove(null)}
            onConfirm={confirmRemoveSchedule}
          />
        )}
        <ConflictOverrideModal
          isOpen={!!conflictState}
          conflicts={conflictState?.conflicts ?? []}
          onCancel={() => setConflictState(null)}
          onConfirm={() => {
            // confirmOverride: true always skips the server-side check, so this can never
            // hit the 409 branch again -- safe to close the modal immediately rather than
            // keep it open through a resubmit that can't reject.
            const payload = conflictState?.payload;
            setConflictState(null);
            if (payload) submitMeeting(payload, true);
          }}
        />
      </div>
    );
  };

export default EditMeetingSidebar;
