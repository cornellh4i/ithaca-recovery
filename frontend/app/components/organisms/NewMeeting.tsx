import React, { useState } from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../atoms/TextField';
import ModeTypeButtons from '../atoms/ModeTypeButtons';
import DatePicker from '../atoms/DatePicker';
import TimePicker from '../atoms/TimePicker';
import Dropdown from '../atoms/dropdown';
import LabeledCheckbox from '../atoms/checkbox';
import RecurringMeetingForm from '../molecules/RecurringMeeting';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { v4 as uuidv4 } from 'uuid';
import { IMeeting, IRecurrencePattern } from '../../../util/models'
import { convertETToUTC } from "../../../util/timeUtils";

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface NewMeetingSidebarProps {
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerCalendarRefresh: () => void;
}

const physicalRoomOptions = [
  "Serenity Room",
  "Seeds of Hope Room",
  "Unity Room",
  "Room for Improvement",
  "Room for Acceptance",
  "Room for Gratitude",
];

const zoomRoomOptions = [
  "Serenity Room - Zoom",
  "Seeds of Hope Room - Zoom",
  "Unity Room - Zoom",
  "Room for Improvement - Zoom",
  "Children's Room @ 518 - Zoom",
];

const roomToZoomRoom: Record<string, string> = {
  "Serenity Room": "Serenity Room - Zoom",
  "Seeds of Hope Room": "Seeds of Hope Room - Zoom",
  "Unity Room": "Unity Room - Zoom",
  "Room for Improvement": "Room for Improvement - Zoom",
};

const calTypeOptions = ["AA", "Al-Anon", "Other"];
const calTypeColor = "#CC3366";

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({
  setIsNewMeetingOpen,
  triggerCalendarRefresh
}) => {
    const [inputMeetingTitleValue, setMeetingTitleValue] = useState("");
    const [selectedMode, setSelectedMode] = useState<string>('Hybrid');
    const [dateValue, setDateValue] = useState<string>("");
    const [timeValue, setTimeValue] = useState<string>("");
    const [inputEmailValue, setEmailValue] = useState("");
    const [inputDescriptionValue, setDescriptionValue] = useState("");
    const [selectedRoom, setSelectedRoom] = useState<string>("");
    const [selectedCalTypes, setSelectedCalTypes] = useState<string[]>([]);
    const [selectedZoomRoom, setSelectedZoomRoom] = useState<string>("");
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(null);

    const handleRecurringMeetingChange = (data: {
      isRecurring: boolean;
      recurrencePattern: IRecurrencePattern | null;
    }) => {
      setIsRecurring(data.isRecurring);
      setRecurrencePattern(data.recurrencePattern);
    };

    const handleRoomChange = (value: string) => {
      setSelectedRoom(value);
      const zoom = roomToZoomRoom[value];
      if (zoom) setSelectedZoomRoom(zoom);
    };

    const handleCalTypeToggle = (type: string) => {
      setSelectedCalTypes(prev =>
        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
      );
    };

    const clearMeetingState = () => {
      setMeetingTitleValue("");
      setSelectedMode("Hybrid");
      setDateValue("");
      setTimeValue("");
      setEmailValue("");
      setDescriptionValue("");
      setSelectedRoom("");
      setSelectedCalTypes([]);
      setSelectedZoomRoom("");
      setIsRecurring(false);
      setRecurrencePattern(null);
    };

    function convertToISODate(dateString: string) {
      const dateObject = new Date(dateString);
      if (isNaN(dateObject.getTime())) {
        console.error("Invalid date string:", dateString)
        return null;
      }
      return dateObject.toISOString().split('T')[0];
    }

    const handleCloseNewMeeting = () => {
      clearMeetingState();
      setIsNewMeetingOpen(false);
    };

    const validateForm = () => {
      if (selectedMode !== "Zoom" && !selectedRoom) {
        return false;
      }
      if (isRecurring && recurrencePattern === null) {
        return false;
      }
      return true;
    };

    const createMeeting = async () => {
      if (!validateForm()) {
        return;
      }

      try {
        const isoDateValue = convertToISODate(dateValue);

        if (!isoDateValue) {
          console.error("Failed to convert dateValue to ISO format");
          return;
        }

        const [startTime, endTime] = timeValue?.split(' - ') || [];
        if (!startTime || !endTime) {
          console.error("Invalid timeValue format");
          return;
        }

        const startDateString = `${isoDateValue}T${startTime}`;
        let endDateString = `${isoDateValue}T${endTime}`;

        if (!startDateString || !endDateString) {
          console.error("Start or end date string could not be constructed");
          return;
        }

        const startDateTimeUTCString = convertETToUTC(startDateString);
        const endDateTimeUTCString = convertETToUTC(endDateString);

        const startDateTimeUTC = new Date(startDateTimeUTCString);
        const endDateTimeUTC = new Date(endDateTimeUTCString);

        if (endDateTimeUTC <= startDateTimeUTC) {
          endDateTimeUTC.setUTCDate(endDateTimeUTC.getUTCDate() + 1);
        }

        const newMeeting: IMeeting = {
          mid: uuidv4(),
          title: inputMeetingTitleValue,
          modeType: selectedMode,
          description: inputDescriptionValue,
          creator: 'Creator',
          group: 'Group',
          startDateTime: startDateTimeUTC,
          endDateTime: endDateTimeUTC,
          email: inputEmailValue,
          zoomAccount: selectedZoomRoom,
          calType: selectedCalTypes,
          status: 'Active',
          room: selectedRoom,
          isRecurring: false,
        };

        if (isRecurring && recurrencePattern) {
          newMeeting.recurrencePattern = {
            ...recurrencePattern,
            startDate: startDateTimeUTC
          };
        }

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
              isVisible={selectedMode !== "Zoom"}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {calTypeOptions.map(type => (
                  <LabeledCheckbox
                    key={type}
                    label={type}
                    checked={selectedCalTypes.includes(type)}
                    onChange={(_e) => handleCalTypeToggle(type)}
                    color={calTypeColor}
                  />
                ))}
              </div>
            </div>
          }
          zoomAccountDropdown={
            <Dropdown
              key={selectedZoomRoom}
              label={<img src="svg/person-icon.svg" alt="Person Icon" />}
              value={selectedZoomRoom}
              isVisible={selectedMode !== "In-Person"}
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
          />}
          handleMeetingSubmit={createMeeting}
          buttonText={"Create Meeting"}
        />
      </div>
    );
  };

export default NewMeetingSidebar;