import React from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../atoms/TextField';
import ModeTypeButtons from '../atoms/ModeTypeButtons';
import DatePicker from '../atoms/DatePicker';
import TimePicker from '../atoms/TimePicker';
import Dropdown from '../atoms/Dropdown';
import LabeledCheckbox from '../atoms/CheckBox';
import RecurringMeetingForm from '../molecules/RecurringMeeting';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { IMeeting } from '../../../util/models'
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR } from '../../../hooks/useMeetingForm';

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface EditMeetingSidebarProps {
  meeting: IMeeting;
  onClose: () => void;
  onUpdateSuccess: () => void;
}

const EditMeetingSidebar: React.FC<EditMeetingSidebarProps> =
  ({ meeting, onClose, onUpdateSuccess }) => {
    const {
      title: inputMeetingTitleValue, setTitle: setMeetingTitleValue,
      mode: selectedMode, setMode: setSelectedMode,
      date: dateValue, setDate: setDateValue,
      time: timeValue, setTime: setTimeValue,
      email: inputEmailValue, setEmail: setEmailValue,
      description: inputDescriptionValue, setDescription: setDescriptionValue,
      room: selectedRoom,
      calTypes: selectedCalTypes,
      zoomRoom: selectedZoomRoom, setZoomRoom: setSelectedZoomRoom,
      handleRecurringMeetingChange,
      handleRoomChange,
      handleModeSelect,
      handleCalTypeToggle,
      getValidationErrors,
      buildMeetingPayload,
    } = useMeetingForm(meeting);

    const updateMeeting = async () => {
      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        alert(validationErrors.join('\n'));
        return;
      }

      const updatedMeeting = buildMeetingPayload(meeting.mid, meeting.status ?? 'Active');
      if (!updatedMeeting) return;

      try {
        const response = await fetch('/api/update/meeting', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedMeeting),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const meetingResponse = await response.json();
        console.log(meetingResponse);
        alert("Meeting updated successfully! Please check the Meeting collection on MongoDB.");
        onUpdateSuccess();
        onClose();
      } catch (error) {
        console.error('There was an error fetching the data:', error);
      }
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
          />}
          modeTypeButtons={<ModeTypeButtons
            selectedMode={selectedMode}
            onModeSelect={handleModeSelect}
          />}
          selectedMode={selectedMode}
          DatePicker={<DatePicker
            label={<img src='/svg/calendar-icon.svg' alt="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
            error={dateValue === '' ? 'Date is required' : undefined}
          />}
          TimePicker={<TimePicker
            label={<img src='/svg/clock-icon.svg' alt="Clock Icon" />}
            value={timeValue}
            onChange={setTimeValue}
            disablePast={true}
            error={timeValue === '' ? 'Time is required' : undefined}
          />}
          RecurringMeeting={
            <RecurringMeetingForm
              onChange={handleRecurringMeetingChange}
              startDate={dateValue}
              initialValue={{
                isRecurring: !!meeting.recurrencePattern,
                recurrencePattern: meeting.recurrencePattern ?? null,
              }}
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
            />
          }
          meetingTypeDropdown={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '6px', display: 'flex', alignItems: 'center' }}>
                <img src="svg/group-icon.svg" alt="Group Icon" />
              </span>
              <div data-testid="meeting-type-checkboxes" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {CAL_TYPE_OPTIONS.map(type => (
                  <LabeledCheckbox
                    key={type}
                    label={type}
                    checked={selectedCalTypes.includes(type)}
                    onChange={(_e) => handleCalTypeToggle(type)}
                    color={CAL_TYPE_COLOR}
                  />
                ))}
              </div>
            </div>
          }
          zoomRoomDropdown={
            <Dropdown
              key={selectedZoomRoom}
              label={<img src="svg/person-icon.svg" alt="Person Icon" />}
              value={selectedZoomRoom}
              isVisible={true}
              elements={zoomRoomOptions}
              name="Select Zoom Room"
              onChange={setSelectedZoomRoom}
            />
          }
          emailTextField={<TextField
            input="Email"
            label={<img src="svg/mail-icon.svg" alt="Mail Icon" />}
            value={inputEmailValue}
            onChange={setEmailValue}
          />}
          descriptionTextField={<TextField
            input="Description"
            label=""
            value={inputDescriptionValue}
            onChange={setDescriptionValue}
            multiline
          />}
          handleMeetingSubmit={updateMeeting}
          buttonText={"Update Meeting"}
        />
      </div>
    );
  };

export default EditMeetingSidebar;
