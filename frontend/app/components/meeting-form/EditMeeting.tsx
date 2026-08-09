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
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { IMeeting } from '../../../types/models'
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR, DESCRIPTION_MAX_LENGTH } from '../../../hooks/useMeetingForm';
import { ConflictListRow } from '../../../util/meetings/conflictDisplay';
import { useToast } from '../shared/ToastProvider';

import styles from '../../../styles/components/meeting-form/MeetingForm.module.scss';

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
    } = useMeetingForm(meeting);

    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Holds the payload + conflict rows across the confirm round-trip -- a 409 doesn't discard
    // the edit, it just pauses submission until the modal's Cancel or "Save anyway".
    const [conflictState, setConflictState] = useState<{ payload: IMeeting; conflicts: ConflictListRow[] } | null>(null);
    // Narrow Main Calendar sidebar gets ~80%-scaled field fonts; the "wide" embed (e.g.
    // Diagnostics Conflicts panel) has room to spare and keeps full size.
    const compact = layout === "sidebar";

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
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const meetingResponse = await response.json();
        console.log(meetingResponse);
        setConflictState(null);
        showToast({ variant: "success", title: "Meeting updated successfully." });
        onUpdateSuccess();
        onClose();
      } catch (error) {
        console.error('There was an error fetching the data:', error);
      } finally {
        setIsSubmitting(false);
      }
    };

    const updateMeeting = async () => {
      // Guards against duplicate/racing updates from rapid/double clicks — the
      // button is also disabled while submitting, but the state check is what
      // actually prevents a second in-flight request.
      if (isSubmitting) return;

      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        alert(validationErrors.join('\n'));
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
          <IconButton className={styles.iconButton} onClick={onClose}>
            <CloseIcon sx={{ color: 'black' }} />
          </IconButton>
        </div>
        <MeetingForm
          meetingTitleTextField={<TextField
            input="Meeting title"
            value={inputMeetingTitleValue}
            onChange={setMeetingTitleValue}
            compact={compact}
          />}
          modeTypeButtons={<ModeTypeButtons
            selectedMode={selectedMode}
            onModeSelect={handleModeSelect}
            compact={compact}
          />}
          selectedMode={selectedMode}
          DatePicker={<DatePicker
            label={<img src='/svg/calendar-icon.svg' alt="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
            compact={compact}
          />}
          TimePicker={<TimePicker
            label={<img src='/svg/clock-icon.svg' alt="Clock Icon" />}
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
              label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
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
                    compact={compact}
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
            />
          }
          emailTextField={<TextField
            input="Email"
            label={<img src="svg/mail-icon.svg" alt="Mail Icon" />}
            value={inputEmailValue}
            onChange={setEmailValue}
            compact={compact}
          />}
          descriptionTextField={<TextField
            input="Description"
            label=""
            value={inputDescriptionValue}
            onChange={setDescriptionValue}
            multiline
            maxLength={DESCRIPTION_MAX_LENGTH}
            compact={compact}
          />}
          handleMeetingSubmit={updateMeeting}
          buttonText={isSubmitting ? "Updating…" : "Update Meeting"}
          isSubmitting={isSubmitting}
          layout={layout}
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
