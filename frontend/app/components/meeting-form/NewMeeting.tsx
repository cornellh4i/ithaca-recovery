import React, { useState } from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../atoms/TextField';
import ModeTypeButtons from '../atoms/ModeTypeButtons';
import DatePicker from '../atoms/DatePicker';
import TimePicker from '../atoms/TimePicker';
import Dropdown from '../atoms/Dropdown';
import LabeledCheckbox from '../atoms/CheckBox';
import RecurringMeetingForm from './RecurringMeeting';
import ZoomHostField from './ZoomHostField';
import ConflictOverrideModal from './ConflictOverrideModal';
import FormValidationBanner from './FormValidationBanner';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { v4 as uuidv4 } from 'uuid';
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR, DESCRIPTION_MAX_LENGTH } from '../../../hooks/useMeetingForm';
import { IMeeting } from '../../../types/models';
import { ConflictListRow } from '../../../util/meetings/conflictDisplay';
import { useToast } from '../shared/ToastProvider';
import { pollMeetingSyncStatus, describeSyncFailure } from '../../../services/syncMeeting';

import styles from '../../../styles/components/meeting-form/MeetingForm.module.scss';

interface NewMeetingSidebarProps {
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerCalendarRefresh: () => void;
  // What the calendar is currently showing -- seeds the Date field's default (see
  // useMeetingForm's computeDefaultDate).
  selectedDate: Date;
  selectedView: string;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({
  setIsNewMeetingOpen,
  triggerCalendarRefresh,
  selectedDate,
  selectedView,
}) => {
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
          throw new Error(`HTTP error! status: ${response.status}`);
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
          <IconButton className={styles.iconButton} onClick={handleCloseNewMeeting}>
            <CloseIcon sx={{ color: 'black' }} />
          </IconButton>
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
            label={<img src='/svg/calendar-icon.svg' alt="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
            compact
          />}
          TimePicker={<TimePicker
            label={<img src='/svg/clock-icon.svg' alt="Clock Icon" />}
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
              label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
              isVisible={selectedMode !== "Remote"}
              elements={physicalRoomOptions}
              name="Select Room"
              onChange={handleRoomChange}
              compact
            />
          }
          meetingTypeDropdown={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '6px', display: 'flex', alignItems: 'center' }}>
                <img src="svg/group-icon.svg" alt="Group Icon" />
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
              label={<img src="/svg/video-call-icon.svg" alt="Zoom Icon" />}
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
            label={<img src="svg/mail-icon.svg" alt="Mail Icon" />}
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
  };

export default NewMeetingSidebar;
