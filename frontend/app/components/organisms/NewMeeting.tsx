import React, { useState } from 'react';
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

import { v4 as uuidv4 } from 'uuid';
import { physicalRoomOptions, zoomRoomOptions } from "../../../util/rooms";
import { useMeetingForm, CAL_TYPE_OPTIONS, CAL_TYPE_COLOR } from '../../../hooks/useMeetingForm';

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface NewMeetingSidebarProps {
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerCalendarRefresh: () => void;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({
  setIsNewMeetingOpen,
  triggerCalendarRefresh
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
      handleRecurringMeetingChange,
      handleRoomChange,
      handleModeSelect,
      handleCalTypeToggle,
      resetForm,
      getValidationErrors,
      buildMeetingPayload,
    } = useMeetingForm();

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCloseNewMeeting = () => {
      resetForm();
      setIsNewMeetingOpen(false);
    };

    const createMeeting = async () => {
      // Guards against duplicate meetings from rapid/double clicks — the button
      // is also disabled while submitting, but the state check is what actually
      // prevents a second in-flight request.
      if (isSubmitting) return;

      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        alert(validationErrors.join('\n'));
        return;
      }

      const newMeeting = buildMeetingPayload(uuidv4(), 'Active');
      if (!newMeeting) return;

      setIsSubmitting(true);
      try {
        const response = await fetch('/api/write/meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newMeeting),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const meetingResponse = await response.json();
        console.log(meetingResponse);

        triggerCalendarRefresh();
        alert("Meeting created successfully! Please check the Meeting collection on MongoDB.");
        handleCloseNewMeeting();
      } catch (error) {
        console.error('There was an error fetching the data:', error);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div>
        <div className={styles.meetingHeader}>
          <h3>New Meeting</h3>
          <IconButton className={styles.iconButton} onClick={handleCloseNewMeeting}>
            <CloseIcon sx={{ color: 'black' }} />
          </IconButton>
        </div>
        <MeetingForm
          meetingTitleTextField={<TextField
            input="Meeting title"
            value={inputMeetingTitleValue}
            onChange={setMeetingTitleValue}
          />}
          modeTypeButtons={
            <ModeTypeButtons
              selectedMode={selectedMode}
              onModeSelect={handleModeSelect}
            />
          }
          selectedMode={selectedMode}
          DatePicker={<DatePicker
            label={<img src='/svg/calendar-icon.svg' alt="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
          />}
          TimePicker={<TimePicker
            label={<img src='/svg/clock-icon.svg' alt="Clock Icon" />}
            value={timeValue}
            onChange={setTimeValue}
            disablePast={true}
            error={'Time is required'}
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
              isVisible={selectedMode !== "In Person"}
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
          handleMeetingSubmit={createMeeting}
          buttonText={isSubmitting ? "Creating…" : "Create Meeting"}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  };

export default NewMeetingSidebar;
