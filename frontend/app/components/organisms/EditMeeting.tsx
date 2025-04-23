import React, { useState } from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../atoms/TextField';
import DatePicker from '../atoms/DatePicker';
import TimePicker from '../atoms/TimePicker';
import Dropdown from '../atoms/dropdown';
import RecurringMeetingForm from '../molecules/RecurringMeeting';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { IMeeting } from '../../../util/models'
import { convertUTCToET, convertETToUTC } from "../../../util/timeUtils";

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface EditMeetingSidebarProps {
  meeting: IMeeting;
  onClose: () => void;
  onUpdateSuccess: () => void;
}

const EditMeetingSidebar: React.FC<EditMeetingSidebarProps> =
  ({ meeting, onClose, onUpdateSuccess }) => {
    /**
     * Extracts time in HH:MM format from a date string
     * @param date - date to extract time from
     * @returns time in HH:MM format (24-hour)
     */
    const formatTime = (date: Date): string => {
      const etDateString = convertUTCToET((new Date(date)).toUTCString());
      const timeMatch = etDateString.match(/(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2];
        const ampm = timeMatch[3].toUpperCase();

        // Convert to 24-hour format
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;

        return `${hours.toString().padStart(2, '0')}:${minutes}`;
      }
      return '';
    };

    /**
     * Formats a Date object to MM/DD/YYYY format in Eastern Time
     * @param date - Date object to format
     * @returns string in MM/DD/YYYY format in Eastern Time
     */
    const formatDate = (date: Date): string => {
      // Convert the date to ET using your existing helper
      const etDateString = convertUTCToET((new Date(date)).toUTCString());

      // Extract MM/DD/YYYY from the formatted ET date string
      // The ET date string format is MM/DD/YYYY, hh:mm:ss AM/PM
      const dateMatch = etDateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);

      if (dateMatch) {
        const month = dateMatch[1];
        const day = dateMatch[2];
        const year = dateMatch[3];

        return `${month}/${day}/${year}`;
      }

      return '';
    };

    // State declarations for Edit Meeting form
    const formData = {
      title: meeting.title,
      mid: meeting.mid,
      description: meeting.description || '',
      creator: meeting.creator,
      group: meeting.group,
      date: formatDate(meeting.startDateTime),
      startTime: formatTime(meeting.startDateTime),
      endTime: formatTime(meeting.endDateTime),
      email: meeting.email,
      zoomAccount: meeting.zoomAccount || '',
      zoomLink: meeting.zoomLink || '',
      zid: meeting.zid || '',
      type: meeting.type,
      room: meeting.room,
    };

    const [inputMeetingTitleValue, setMeetingTitleValue] = useState(formData.title); // Meeting title
    const [dateValue, setDateValue] = useState<string>(formData.date); // Initial date value as empty
    const [timeValue, setTimeValue] = useState<string>(`${formData.startTime} - ${formData.endTime}`); // Initial time range as empty
    const [freqValue, setFreqValue] = useState<string>("Never"); // TODO: Update recurrence rules
    const [inputEmailValue, setEmailValue] = useState(formData.email); // TODO: Update Email after migrating IMeeting
    const [inputDescriptionValue, setDescriptionValue] = useState(formData.description); // Description input value
    const [selectedRoom, setSelectedRoom] = useState<string>(formData.room);
    const [selectedMeetingType, setSelectedMeetingType] = useState<string>(formData.type);
    const [selectedZoomAccount, setSelectedZoomAccount] = useState<string>(formData.zoomAccount);

    // Update handlers for these dropdowns
    const handleRoomChange = (value: string) => setSelectedRoom(value);
    const handleMeetingTypeChange = (value: string) => setSelectedMeetingType(value);
    const handleZoomAccountChange = (value: string) => setSelectedZoomAccount(value);

    const clearMeetingState = () => {
      setMeetingTitleValue("");
      setDateValue("");
      setTimeValue("");
      setFreqValue("Never");
      setEmailValue("");
      setDescriptionValue("");
      setSelectedRoom("");
      setSelectedMeetingType("");
      setSelectedZoomAccount("");
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

    function convertToISODate(dateString: string) {
      const dateObject = new Date(dateString);
      if (isNaN(dateObject.getTime())) {
        console.error("Invalid date string:", dateString)
        return null;
      }
      return dateObject.toISOString().split('T')[0]; // Returns "YYYY-MM-DD"
    }

    const updateMeeting = async () => {
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

        const updatedMeeting: IMeeting = {
          title: inputMeetingTitleValue,
          mid: formData.mid,
          description: inputDescriptionValue,
          creator: 'Creator',
          group: 'Group',
          startDateTime: startDateTimeUTC,
          endDateTime: endDateTimeUTC,
          email: inputEmailValue,
          zoomAccount: selectedZoomAccount,
          type: selectedMeetingType,
          room: selectedRoom,
        };

        const response = await fetch('/api/update/meeting', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
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
          RecurringMeeting={<RecurringMeetingForm />}
          roomSelectionDropdown={
            <Dropdown
              label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
              value={selectedRoom}
              isVisible={true}
              elements={roomOptions}
              name="Select Room"
              onChange={handleRoomChange}
            />
          }
          meetingTypeDropdown={
            <Dropdown
              label={<img src="svg/group-icon.svg" alt="Group Icon" />}
              value={selectedMeetingType}
              isVisible={true}
              elements={meetingTypeOptions}
              name="Select Meeting Type"
              onChange={handleMeetingTypeChange}
            />
          }
          zoomAccountDropdown={
            <Dropdown
              label={<img src="svg/person-icon.svg" alt="Person Icon" />}
              value={selectedZoomAccount}
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
          handleMeetingSubmit={updateMeeting}
          buttonText={"Update Meeting"}
        />
      </div>
    );
  };

export default EditMeetingSidebar;