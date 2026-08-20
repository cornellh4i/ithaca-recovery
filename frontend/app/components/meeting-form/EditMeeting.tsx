import React, { useState } from 'react';
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
import IconButton from '../ui/buttons/IconButton';

import { IMeeting } from '../../../types/models'
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR, DESCRIPTION_MAX_LENGTH } from '../../../hooks/useMeetingForm';
import { ConflictListRow } from '../../../util/meetings/conflictDisplay';
import { useToast } from '../shared/ToastProvider';
import { pollMeetingSyncStatus, describeSyncFailure } from '../../../services/syncMeeting';

import styles from './MeetingForm.module.scss';

interface EditMeetingSidebarProps {
  meeting: IMeeting;
  onClose: () => void;
  onUpdateSuccess: () => void;
  // "wide" is used when this form is embedded inline in a wider context (e.g. the Diagnostics
  // Conflicts panel) rather than the narrow Main Calendar sidebar. See MeetingForm's layout prop.
  layout?: "sidebar" | "wide";
}

const EditMeetingSidebar: React.FC<EditMeetingSidebarProps> =
  ({ meeting, onClose, onUpdateSuccess, layout = "sidebar" }) => {
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
    } = useMeetingForm(meeting);

    // Populated only for admin sessions by retrieve/meeting/[id] -- empty for a meeting whose
    // Zoom link is its own.
    const sharedWithText = (meeting.sharedWith ?? [])
      .map((row) => `${row.title} (${row.modeType})`)
      .join(', ');

    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Holds the payload + conflict rows across the confirm round-trip -- a 409 doesn't discard
    // the edit, it just pauses submission until the modal's Cancel or "Save anyway".
    const [conflictState, setConflictState] = useState<{ payload: IMeeting; conflicts: ConflictListRow[] } | null>(null);
    // Narrow Main Calendar sidebar gets ~80%-scaled field fonts; the "wide" embed (e.g.
    // Diagnostics Conflicts panel) has room to spare and keeps full size.
    const compact = layout === "sidebar";
    const [isDiscardPromptOpen, setIsDiscardPromptOpen] = useState(false);

    // Both user-driven close paths (Cancel, the X) go through here, so neither can silently
    // drop in-progress edits.
    const requestClose = () => {
      if (isDirty) {
        setIsDiscardPromptOpen(true);
        return;
      }
      onClose();
    };

    const submitMeeting = async (payload: IMeeting, confirmOverride: boolean) => {
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
        showToast({ variant: "success", title: "Meeting updated successfully." });
        onUpdateSuccess();
        onClose();

        // Fire-and-forget -- see NewMeeting.tsx's identical call for why (the response above
        // is sent before the actual Zoom/Calendar sync runs). showToast is global, so this is
        // safe to resolve after the form itself has already closed.
        pollMeetingSyncStatus(meetingResponse.mid, {
          expectGoogle: (payload.calType?.length ?? 0) > 0,
          expectZoom: payload.modeType === 'Hybrid' || payload.modeType === 'Remote',
        }).then((result) => {
          const message = describeSyncFailure(result);
          if (message) showToast({ variant: "error", title: message, persistent: true });
        });
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

      const updatedMeeting = buildMeetingPayload(meeting.mid, meeting.status ?? 'Active');
      if (!updatedMeeting) return;

      await submitMeeting(updatedMeeting, false);
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
                ? "Legacy Zoom link; host can't be reassigned from the app."
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
