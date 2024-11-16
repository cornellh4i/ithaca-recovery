import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { IMeeting } from '../../../../util/models'
import TextButton from '../../atoms/textbutton';
import TextField from '../../atoms/TextField';
import DatePicker from '../../atoms/DatePicker';
import TimePicker from '../../atoms/TimePicker';
import RadioGroup from '../../atoms/RadioGroup';
import Dropdown from '../../atoms/dropdown';
import UploadPandaDocs from '../../atoms/upload';
import MiniCalendar from '../../atoms/MiniCalendar';
import MeetingsFilter from '../../molecules/MeetingsFilter';
import NewMeetingSidebar from '../NewMeeting';
import styles from '../../../../styles/components/organisms/CalendarSidebar.module.scss';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

const CalendarSidebar: React.FC = () => {
  // State declarations for New Meeting button
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);

  // A unique key for the filter 
  const filterKey = 'meetingFilterState';
  const [filters, setFilters] = useState<any>({
    SerenityRoom: true,
    SeedsOfHope: true,
    UnityRoom: true,
    RoomForImprovement: true,
    SmallButPowerfulRight: true,
    SmallButPowerfulLeft: true,
    ZoomAccount1: true,
    ZoomAccount2: true,
    ZoomAccount3: true,
    ZoomAccount4: true,
    AA: true,
    AlAnon: true,
    Other: true,
    InPerson: true,
    Hybrid: true,
    Remote: true,
  });

  const handleFilterChange = (name: string, value: boolean) => {
    const updatedFilters = { ...filters, [name]: value };
    setFilters(updatedFilters);
  };

  const handleOpenNewMeeting = () => {
    setIsNewMeetingOpen(true);
  };

  const handleCloseNewMeeting = () => {
    clearMeetingState();
    setIsNewMeetingOpen(false);
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      console.log("File selected:", file);
      // Handle the selected file (e.g., upload it or process it)
    } else {
      console.log("No file selected");
    }
  };

  // Update handlers for these dropdowns
  const handleRoomChange = (value: string) => setSelectedRoom(value);
  const handleMeetingTypeChange = (value: string) => setSelectedMeetingType(value);
  const handleZoomAccountChange = (value: string) => setSelectedZoomAccount(value);

  // State declarations for New Meeting form
  const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); // Meeting title
  const [dateValue, setDateValue] = useState<string>(""); // Initial date value as empty
  const [timeValue, setTimeValue] = useState<string>(""); // Initial time range as empty
  const [freqValue, setFreqValue] = useState<string>("Never"); // Default frequency value
  const [inputEmailValue, setEmailValue] = useState(""); // Email input value
  const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value
  const [selectedRoom, setSelectedRoom] = useState<string>("Serenity Room");
  const [selectedMeetingType, setSelectedMeetingType] = useState<string>("AA");
  const [selectedZoomAccount, setSelectedZoomAccount] = useState<string>("Zoom Email 1");

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

      const startDateString = `${isoDateValue}T${startTime}`
      const endDateString = `${isoDateValue}T${endTime}`

      if (!startDateString || !endDateString) {
        console.error("Start or end date string could not be constructed");
        return;
      }

      const startDateTime = new Date(startDateString);
      const endDateTime = new Date(endDateString);

      startDateTime.setHours(startDateTime.getHours() - 5);
      endDateTime.setHours(endDateTime.getHours() - 5);

      const newMeeting: IMeeting = {
        title: inputMeetingTitleValue,
        mid: generateMeetingId(),
        description: inputDescriptionValue,
        creator: 'Creator',
        group: 'Group',
        startDateTime: startDateTime,
        endDateTime: endDateTime,
        zoomAccount: selectedZoomAccount,
        type: selectedMeetingType,
        room: selectedRoom,
      };
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

  return (
    <div>
      {isNewMeetingOpen ? (
        <div>
          {isNewMeetingOpen && (
            <div className={styles.newMeetingHeader}>
              <h3>New Meeting</h3>
              <IconButton className={styles.iconButton} onClick={handleCloseNewMeeting}><CloseIcon sx={{ color: 'black' }} /></IconButton>
            </div>
          )}
          <NewMeetingSidebar
            meetingTitleTextField={<TextField
              input="Meeting title"
              value={inputMeetingTitleValue}
              onChange={setMeetingTitleValue}
              underlineOnFocus={false} />}
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
            RadioGroup={<RadioGroup
              label="Ends"
              options={["Never", "On", "After"]}
              selectedOption={freqValue}
              onChange={setFreqValue}
              name="preferences"
            />}
            roomSelectionDropdown={
              <Dropdown
                label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
                isVisible={true}
                elements={roomOptions}
                name="Select Room"
              />
            }
            meetingTypeDropdown={
              <Dropdown
                label={<img src="svg/group-icon.svg" alt="Group Icon"/>}
                isVisible={true}
                elements={meetingTypeOptions}
                name="Select Meeting Type"
              />
            }
            zoomAccountDropdown={
              <Dropdown
                label={<img src="svg/person-icon.svg" alt="Person Icon"/>}
                isVisible={true}
                elements={zoomAccountOptions}
                name="Select Zoom Account"
              />
            }
            emailTextField={<TextField
              input="Email"
              label={<img src="svg/mail-icon.svg" alt="Mail Icon"/>}
              value={inputEmailValue}
              onChange={setEmailValue}
              underlineOnFocus={false} />
            }
            uploadPandaDocsForm={<UploadPandaDocs onFileSelect={handleFileSelect} />}
            descriptionTextField={<TextField
              input="Description"
              label = ""
              value={inputDescriptionValue}
              onChange={setDescriptionValue}
              underlineOnFocus={false} />}
          ></NewMeetingSidebar>
        </div>
      ) : (
        <>
          <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<AddIcon />} />
          <div> <MiniCalendar /> </div>
          <div className={styles.meetingsFilter}>
            <MeetingsFilter filters={filters} onFilterChange={handleFilterChange} />
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarSidebar;

