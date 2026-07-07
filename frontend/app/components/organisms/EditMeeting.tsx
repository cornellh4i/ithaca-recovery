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

import { IMeeting, IRecurrencePattern } from '../../../util/models'
import { convertUTCToET, convertETToUTC } from "../../../util/timeUtils";

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface EditMeetingSidebarProps {
  meeting: IMeeting;
  onClose: () => void;
  onUpdateSuccess: () => void;
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

const EditMeetingSidebar: React.FC<EditMeetingSidebarProps> =
  ({ meeting, onClose, onUpdateSuccess }) => {

    const formatTime = (date: Date): string => {
      const etDateString = convertUTCToET((new Date(date)).toUTCString());
      const timeMatch = etDateString.match(/(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2];
        const ampm = timeMatch[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
      }
      return '';
    };

    const formatDate = (date: Date): string => {
      const etDateString = convertUTCToET((new Date(date)).toUTCString());
      const dateMatch = etDateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        return `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      }
      return '';
    };

    const [inputMeetingTitleValue, setMeetingTitleValue] = useState(meeting.title);
    const [selectedMode, setSelectedMode] = useState<string>(meeting.modeType);
    const [dateValue, setDateValue] = useState<string>(formatDate(meeting.startDateTime));
    const [timeValue, setTimeValue] = useState<string>(`${formatTime(meeting.startDateTime)} - ${formatTime(meeting.endDateTime)}`);
    const [inputEmailValue, setEmailValue] = useState(meeting.email);
    const [inputDescriptionValue, setDescriptionValue] = useState(meeting.description || '');
    const [selectedRoom, setSelectedRoom] = useState<string>(meeting.room);
    const [selectedCalTypes, setSelectedCalTypes] = useState<string[]>(
      Array.isArray(meeting.calType) ? meeting.calType : meeting.calType ? [meeting.calType as unknown as string] : []
    );
    const [selectedZoomRoom, setSelectedZoomRoom] = useState<string>(meeting.zoomAccount || '');

    const [isRecurring, setIsRecurring] = useState(!!meeting.recurrencePattern);
    const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(
      meeting.recurrencePattern ?? null
    );

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

    const handleModeSelect = (mode: string) => {
      setSelectedMode(mode);
      // Clear the fields the new mode doesn't use, so stale selections aren't submitted
      if (mode === "In Person") setSelectedZoomRoom("");
      if (mode === "Remote") setSelectedRoom("");
    };

    const handleCalTypeToggle = (type: string) => {
      setSelectedCalTypes(prev =>
        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
      );
    };

    function convertToISODate(dateString: string) {
      const dateObject = new Date(dateString);
      if (isNaN(dateObject.getTime())) {
        console.error("Invalid date string:", dateString);
        return null;
      }
      return dateObject.toISOString().split('T')[0];
    }

    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const getValidationErrors = (): string[] => {
      const errors: string[] = [];

      if (!inputMeetingTitleValue.trim()) errors.push("Meeting title is required.");
      if (!dateValue) errors.push("Date is required.");

      const [startTime, endTime] = timeValue?.split(' - ') || [];
      if (!startTime || !endTime) errors.push("Start and end time are required.");

      if (!inputEmailValue.trim()) {
        errors.push("Email is required.");
      } else if (!isValidEmail(inputEmailValue)) {
        errors.push("Email must be a valid email address.");
      }

      if (selectedMode === "Hybrid" && (!selectedRoom || !selectedZoomRoom)) {
        errors.push("Hybrid meetings require both a physical room and a Zoom room.");
      } else if (selectedMode === "In Person" && !selectedRoom) {
        errors.push("In Person meetings require a physical room.");
      } else if (selectedMode === "Remote" && !selectedZoomRoom) {
        errors.push("Remote meetings require a Zoom room.");
      }

      if (isRecurring && recurrencePattern === null) {
        errors.push("Recurrence details are required for recurring meetings.");
      }

      return errors;
    };

    const updateMeeting = async () => {
      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        alert(validationErrors.join('\n'));
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

        const startDateTimeUTCString = convertETToUTC(`${isoDateValue}T${startTime}`);
        const endDateTimeUTCString = convertETToUTC(`${isoDateValue}T${endTime}`);

        const startDateTimeUTC = new Date(startDateTimeUTCString);
        const endDateTimeUTC = new Date(endDateTimeUTCString);

        const updatedMeeting: IMeeting = {
          mid: meeting.mid,
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
          status: meeting.status ?? 'Active',
          room: selectedRoom,
          isRecurring: isRecurring,
        };

        if (isRecurring && recurrencePattern) {
          const recurrenceStartDate = new Date(convertETToUTC(`${isoDateValue}T00:00`));
          updatedMeeting.recurrencePattern = {
            ...recurrencePattern,
            startDate: recurrenceStartDate,
          };
        }

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
          />}
          handleMeetingSubmit={updateMeeting}
          buttonText={"Update Meeting"}
        />
      </div>
    );
  };

export default EditMeetingSidebar;