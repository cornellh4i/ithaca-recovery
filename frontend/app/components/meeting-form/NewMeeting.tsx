import React, { useImperativeHandle, useState } from 'react';
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
import FormValidationBanner from './FormValidationBanner';
import IconButton from '../ui/buttons/IconButton';

import { v4 as uuidv4 } from 'uuid';
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR, DESCRIPTION_MAX_LENGTH } from '../../../hooks/useMeetingForm';
import { IMeeting } from '../../../types/models';
import { ConflictListRow } from '../../../util/meetings/conflictDisplay';
import { useToast } from '../shared/ToastProvider';
import { pollMeetingSyncStatus, describeSyncFailure } from '../../../services/syncMeeting';

import styles from './MeetingForm.module.scss';

interface NewMeetingSidebarProps {
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerCalendarRefresh: () => void;
  // What the calendar is currently showing -- seeds the Date field's default (see
  // useMeetingForm's computeDefaultDate).
  selectedDate: Date;
  selectedView: string;
}

// Exposed via ref so a host that also renders its own dialog chrome around this component
// (MobileFullScreenSheet's Escape-to-close on mobile) can trigger the exact same reset-then-
// close path the in-form Cancel/X button uses, instead of a bare setIsNewMeetingOpen(false)
// that would skip resetForm() -- see page.tsx's mobile New Meeting sheet.
export interface NewMeetingSidebarHandle {
  requestClose: () => void;
}

const NewMeetingSidebar = React.forwardRef<NewMeetingSidebarHandle, NewMeetingSidebarProps>(({
  setIsNewMeetingOpen,
  triggerCalendarRefresh,
  selectedDate,
  selectedView,
}, ref) => {
    const {
      title: inputMeetingTitleValue, setTitle: setMeetingTitleValue,
      mode: selectedMode,
      date: dateValue, setDate: setDateValue,
      time: timeValue, setTime: setTimeValue,
      email: inputEmailValue, setEmail: setEmailValue,
      description: inputDescriptionValue, setDescription: setDescriptionValue,
      calTypes: selectedCalTypes,
      zoomRoom: selectedZoomRoom, setZoomRoom: setSelectedZoomRoom,
      zoomHost: selectedZoomHost, setZoomHost: setSelectedZoomHost,
      handleRecurringMeetingChange,
      handleRoomChange,
      handleModeSelect,
      handleCalTypeToggle,
      resetForm,
      getValidationErrors,
      buildMeetingPayload,
      setSubmitAttempted,
      liveValidationErrors,
      markFieldTouched,
      getFieldError,
    } = useMeetingForm(undefined, { selectedDate, selectedView });

    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Holds the payload + conflict rows across the confirm round-trip -- a 409 doesn't clear
    // the form, it just pauses submission until the modal's Cancel or "Save anyway".
    const [conflictState, setConflictState] = useState<{ payload: IMeeting; conflicts: ConflictListRow[] } | null>(null);

    const handleCloseNewMeeting = () => {
      resetForm();
      setIsNewMeetingOpen(false);
    };

    useImperativeHandle(ref, () => ({ requestClose: handleCloseNewMeeting }));

    const submitMeeting = async (payload: IMeeting, confirmOverride: boolean) => {
      setIsSubmitting(true);
      try {
        const response = await fetch('/api/write/meeting', {
          method: 'POST',
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
          // A 400 here means a business-rule check on the server rejected the payload (e.g.
          // meetingSchema's refine()s) despite passing client-side validation -- surface the
          // server's actual reason instead of a bare status code, as a safety net for any rule
          // the client form doesn't (yet) mirror.
          const body = await response.json().catch(() => null);
          const detail = body?.issues?.map((issue: { message: string }) => issue.message).join(' ') || body?.error;
          throw new Error(detail || `HTTP error! status: ${response.status}`);
        }

        const meetingResponse = await response.json();
        console.log(meetingResponse);

        setConflictState(null);
        triggerCalendarRefresh();
        showToast({ variant: "success", title: "Meeting created successfully." });
        handleCloseNewMeeting();

        // Fire-and-forget -- the create response above is sent before the actual Zoom/Calendar
        // sync runs (see services/syncMeeting.ts's pollMeetingSyncStatus), so there's nothing
        // fresh to check yet. showToast is global (ToastProvider context), so this is safe to
        // resolve after the form itself has already closed.
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
          title: error instanceof Error ? error.message : "Could not create the meeting.",
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    const createMeeting = async () => {
      // Guards against duplicate meetings from rapid/double clicks — the button
      // is also disabled while submitting, but the state check is what actually
      // prevents a second in-flight request.
      if (isSubmitting) return;

      setSubmitAttempted(true);
      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        return;
      }

      const newMeeting = buildMeetingPayload(uuidv4(), 'Active');
      if (!newMeeting) return;

      await submitMeeting(newMeeting, false);
    };

    return (
      <div>
        <div className={styles.meetingHeader}>
          <h3>New Meeting</h3>
          <IconButton
            name="close"
            ariaLabel="Close"
            onClick={handleCloseNewMeeting}
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
            compact
          />}
          modeTypeButtons={
            <ModeTypeButtons
              selectedMode={selectedMode}
              onModeSelect={handleModeSelect}
              compact
            />
          }
          selectedMode={selectedMode}
          DatePicker={<DatePicker
            label={<Icon name="calendar" size={28} ariaLabel="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
            compact
          />}
          TimePicker={<TimePicker
            label={<Icon name="clock" size={28} ariaLabel="Clock Icon" />}
            value={timeValue}
            onChange={setTimeValue}
            disablePast={true}
            compact
          />}
          RecurringMeeting={
            <RecurringMeetingForm
              onChange={handleRecurringMeetingChange}
              startDate={dateValue}
            />
          }
          roomSelectionDropdown={
            <Dropdown
              label={<Icon name="location" size={28} ariaLabel="Location Icon" />}
              isVisible={selectedMode !== "Remote"}
              elements={physicalRoomOptions}
              name="Select Room"
              onChange={handleRoomChange}
              compact
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
                    compact
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
              isVisible={selectedMode === "Hybrid"}
              elements={zoomRoomOptions}
              name="Select Zoom Room"
              onChange={setSelectedZoomRoom}
              compact
            />
          }
          zoomHostDropdown={
            <ZoomHostField
              zoomHost={selectedZoomHost}
              onZoomHostChange={setSelectedZoomHost}
              isVisible={selectedMode === "Hybrid" || selectedMode === "Remote"}
              compact
              getCandidate={() => buildMeetingPayload(uuidv4(), 'Active')}
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
            compact
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
            compact
          />}
          handleMeetingSubmit={createMeeting}
          buttonText={isSubmitting ? "Creating…" : "Create Meeting"}
          isSubmitting={isSubmitting}
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
  });

NewMeetingSidebar.displayName = 'NewMeetingSidebar';

export default NewMeetingSidebar;
