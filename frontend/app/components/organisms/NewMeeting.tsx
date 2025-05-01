import React, { useState } from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../atoms/TextField';
import ModeTypeButtons from '../atoms/ModeTypeButtons';
import DatePicker from '../atoms/DatePicker';
import TimePicker from '../atoms/TimePicker';
import Dropdown from '../atoms/dropdown';
import RecurringMeetingForm from '../molecules/RecurringMeeting';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { v4 as uuidv4 } from 'uuid';
import { IMeeting, IRecurrencePattern } from '../../../util/models'
import { convertETToUTC } from "../../../util/timeUtils";

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface NewMeetingSidebarProps {
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> =
  ({ setIsNewMeetingOpen }) => {
    // State declarations for New Meeting form
    const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); // Meeting title
    const [selectedMode, setSelectedMode] = useState<string>('Hybrid');
    const [dateValue, setDateValue] = useState<string>(""); // Initial date value as empty
    const [timeValue, setTimeValue] = useState<string>(""); // Initial time range as empty
    const [inputEmailValue, setEmailValue] = useState(""); // Email input value
    const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value
    const [selectedRoom, setSelectedRoom] = useState<string>("");
    const [selectedMeetingType, setSelectedMeetingType] = useState<string>("");
    const [selectedZoomAccount, setSelectedZoomAccount] = useState<string>("");
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(null);

    const handleRecurringMeetingChange = (data: {
      isRecurring: boolean;
      recurrencePattern: IRecurrencePattern | null;
    }) => {
      setIsRecurring(data.isRecurring);
      setRecurrencePattern(data.recurrencePattern);
    };

    const handleRoomChange = (value: string) => setSelectedRoom(value);
    const handleMeetingTypeChange = (value: string) => setSelectedMeetingType(value);
    const handleZoomAccountChange = (value: string) => setSelectedZoomAccount(value);

    const clearMeetingState = () => {
      setMeetingTitleValue("");
      setSelectedMode("Hybrid");
      setDateValue("");
      setTimeValue("");
      setEmailValue("");
      setDescriptionValue("");
      setSelectedRoom("");
      setSelectedMeetingType("");
      setSelectedZoomAccount("");
      setIsRecurring(false);
      setRecurrencePattern(null);
    };

    // Room and Meeting Type options
    const roomOptions = [
      "Serenity Room",
      "Seeds of Hope",
      "Unity Room",
      "Room for Improvement",
      "Small but Powerful - Right",
      "Small but Powerful - Left"
    ];

    const meetingTypeOptions = [
      "AA",
      "Al-Anon",
      "Other"
    ];

    const zoomAccountOptions = [
      "Zoom Email 1",
      "Zoom Email 2",
      "Zoom Email 3",
      "Zoom Email 4"
    ];

    const generateMeetingId = () => {
      return uuidv4();
    };

    function convertToISODate(dateString: string) {
      const dateObject = new Date(dateString);
      if (isNaN(dateObject.getTime())) {
        console.error("Invalid date string:", dateString)
        return null;
      }
      return dateObject.toISOString().split('T')[0]; // Returns "YYYY-MM-DD"
    }

    const handleOpenNewMeeting = () => {
      setIsNewMeetingOpen(true);
    };

    const handleCloseNewMeeting = () => {
      clearMeetingState();
      setIsNewMeetingOpen(false);
    };

    const createMeeting = async () => {
      try {

        // Convert dateValue to ISO format
        const isoDateValue = convertToISODate(dateValue);

        if (!isoDateValue) {
          console.error("Failed to convert dateValue to ISO format");
        }

        const [startTime, endTime] = timeValue?.split(' - ') || [];
        if (!startTime || !endTime) {
          console.error("Invalid timeValue format");
          return;
        }

        // in EST
        const startDateString = `${isoDateValue}T${startTime}`;
        const endDateString = `${isoDateValue}T${endTime}`;

        if (!startDateString || !endDateString) {
          console.error("Start or end date string could not be constructed");
          return;
        }

        const startDateTimeUTCString = convertETToUTC(startDateString);
        const endDateTimeUTCString = convertETToUTC(endDateString);

        const startDateTimeUTC = new Date(startDateTimeUTCString);
        const endDateTimeUTC = new Date(endDateTimeUTCString);

        const newMeeting: IMeeting = {
          mid: generateMeetingId(),
          title: inputMeetingTitleValue,
          modeType: selectedMode, // Meeting Mode Type
          description: inputDescriptionValue,
          creator: 'Creator',
          group: 'Group',
          startDateTime: startDateTimeUTC,
          endDateTime: endDateTimeUTC,
          email: inputEmailValue,
          zoomAccount: selectedZoomAccount,
          calType: selectedMeetingType, // Room Type
          room: selectedRoom,
        };
        if (isRecurring && recurrencePattern) {
          newMeeting.recurrencePattern = {
            ...recurrencePattern,
            startDate: startDateTimeUTC
          };
        }
        const response = await fetch('/api/write/meeting', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            newMeeting
          ),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const meetingResponse = await response.json();
        console.log(meetingResponse);
        alert("Meeting created successfully! Please check the Meeting collection on MongoDB.");
        handleCloseNewMeeting();
      } catch (error) {
        console.error('There was an error fetching the data:', error);
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
              onModeSelect={setSelectedMode}
            />
          }          
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
            />
          }
          roomSelectionDropdown={
            <Dropdown
              label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
              isVisible={true}
              elements={roomOptions}
              name="Select Room"
              onChange={handleRoomChange}
            />
          }
          meetingTypeDropdown={
            <Dropdown
              label={<img src="svg/group-icon.svg" alt="Group Icon" />}
              isVisible={true}
              elements={meetingTypeOptions}
              name="Select Meeting Type"
              onChange={handleMeetingTypeChange}
            />
          }
          zoomAccountDropdown={
            <Dropdown
              label={<img src="svg/person-icon.svg" alt="Person Icon" />}
              isVisible={true}
              elements={zoomAccountOptions}
              name="Select Zoom Account"
              onChange={handleZoomAccountChange}
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
          />}
          handleMeetingSubmit={createMeeting}
          buttonText={"Create Meeting"}
        />
      </div>
    );
  };

export default NewMeetingSidebar;