import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { IMeeting } from '../../../../util/models'
import TextButton from '../../atoms/textbutton';
import TextField from '../../atoms/TextField';
import DatePicker from '../../atoms/DatePicker';
import TimePicker from '../../atoms/TimePicker';
import Dropdown from '../../atoms/dropdown';
import UploadPandaDocs from '../../atoms/upload';
import MiniCalendar from '../../atoms/MiniCalendar';
import MeetingsFilter from '../../molecules/MeetingsFilter';
import NewMeetingSidebar from '../NewMeeting';
import styles from '../../../../styles/components/organisms/CalendarSidebar.module.scss';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import RecurringMeetingForm from '../../molecules/RecurringMeeting';
interface CalendarSidebarProps {
  filters: any;
  setFilters: any;
  selectedDate: Date;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({filters, setFilters, selectedDate, setSelectedDate}) => {
  // State declarations for New Meeting button
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);

  // Form validation errors tracking
  const [formErrors, setFormErrors] = useState({
    meetingTitle: false,
    date: false,
    time: false,
    room: false,
    meetingType: false,
    zoomAccount: false,
    email: false,
    pandaDocs: false,
    description: false
  });

  // Function to update form error state
  const updateErrorState = (field: string, hasError: boolean) => {
    setFormErrors(prev => ({
      ...prev,
      [field]: hasError
    }));
  };

  // A unique key for the filter 
  const filterKey = 'meetingFilterState';

  const handleFilterChange = (name: string, value: boolean) => {
    const updatedFilters = { ...filters, [name]: value };
    setFilters(updatedFilters);
  };

  const handleOpenNewMeeting = () => {
    // Reset all form errors when opening the form
    setFormErrors({
      meetingTitle: false,
      date: false,
      time: false,
      room: false,
      meetingType: false,
      zoomAccount: false,
      email: false,
      pandaDocs: false,
      description: false
    });
    setIsNewMeetingOpen(true);
  };

  const handleCloseNewMeeting = () => {
    clearMeetingState();
    setIsNewMeetingOpen(false);
  };

  const handleFileSelect = (file: File | null, hasError: boolean) => {
    updateErrorState('pandaDocs', hasError);
    if (file) {
      console.log("File selected:", file);
      // Handle the selected file (e.g., upload it or process it)
    } else {
      console.log("No file selected");
    }
  };

  // Update handlers for these dropdowns
  const handleRoomChange = (value: string, hasError: boolean) => {
    setSelectedRoom(value);
    updateErrorState('room', hasError);
  };
  
  const handleMeetingTypeChange = (value: string, hasError: boolean) => {
    setSelectedMeetingType(value);
    updateErrorState('meetingType', hasError);
  };
  
  const handleZoomAccountChange = (value: string, hasError: boolean) => {
    setSelectedZoomAccount(value);
    updateErrorState('zoomAccount', hasError);
  };

  // Handle text field changes with error reporting
  const handleMeetingTitleChange = (value: string, hasError: boolean) => {
    setMeetingTitleValue(value);
    updateErrorState('meetingTitle', hasError);
  };

  const handleEmailChange = (value: string, hasError: boolean) => {
    setEmailValue(value);
    updateErrorState('email', hasError);
  };

  const handleDescriptionChange = (value: string, hasError: boolean) => {
    setDescriptionValue(value);
    updateErrorState('description', hasError);
  };

  // Handle date and time changes with error reporting
  const handleDateChange = (value: string, hasError: boolean) => {
    setDateValue(value);
    updateErrorState('date', hasError);
  };

  const handleTimeChange = (value: string, hasError: boolean) => {
    setTimeValue(value);
    updateErrorState('time', hasError);
  };

  // State declarations for New Meeting form
  const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); // Meeting title
  const [dateValue, setDateValue] = useState<string>(""); // Initial date value as empty
  const [timeValue, setTimeValue] = useState<string>(""); // Initial time range as empty
  const [freqValue, setFreqValue] = useState<string>("Never"); // Default frequency value
  const [inputEmailValue, setEmailValue] = useState(""); // Email input value
  const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [selectedMeetingType, setSelectedMeetingType] = useState<string>("");
  const [selectedZoomAccount, setSelectedZoomAccount] = useState<string>("");

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
      // Check if any form errors exist
      const hasErrors = Object.values(formErrors).some(error => error === true);
      
      // Also check for empty required fields
      const requiredFieldsEmpty = 
        !inputMeetingTitleValue || 
        !dateValue || 
        !timeValue || 
        !selectedRoom || 
        !selectedMeetingType || 
        !selectedZoomAccount || 
        !inputEmailValue;
      
      if (hasErrors || requiredFieldsEmpty) {
        alert("Please fix all errors and fill in all required fields before creating a meeting");
        
        // Set errors for empty fields
        if (!inputMeetingTitleValue) updateErrorState('meetingTitle', true);
        if (!dateValue) updateErrorState('date', true);
        if (!timeValue) updateErrorState('time', true);
        if (!selectedRoom) updateErrorState('room', true);
        if (!selectedMeetingType) updateErrorState('meetingType', true);
        if (!selectedZoomAccount) updateErrorState('zoomAccount', true);
        if (!inputEmailValue) updateErrorState('email', true);
        
        return;
      }

      // Convert dateValue to ISO format
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
              <IconButton className={styles.iconButton} onClick={handleCloseNewMeeting}>
                <CloseIcon sx={{ color: 'black' }} />
              </IconButton>
            </div>
          )}
          <NewMeetingSidebar
            meetingTitleTextField={<TextField
              input="Meeting title"
              value={inputMeetingTitleValue}
              onChange={handleMeetingTitleChange}
              onErrorChange={(hasError) => updateErrorState('meetingTitle', hasError)}
              />}
            DatePicker={<DatePicker
              label={<img src='/svg/calendar-icon.svg' alt="Calendar Icon" />}
              value={dateValue}
              onChange={handleDateChange}
              onErrorChange={(hasError) => updateErrorState('date', hasError)}
            />}
            TimePicker={<TimePicker
              label={<img src='/svg/clock-icon.svg' alt="Clock Icon" />}
              value={timeValue}
              onChange={setTimeValue}
              onErrorChange={(hasError) => updateErrorState('time', hasError)}
              disablePast={true}
            />}
            RecurringMeeting={<RecurringMeetingForm />}
            roomSelectionDropdown={
              <Dropdown
                label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
                isVisible={true}
                elements={roomOptions}
                name="Select Room"
                onChange={handleRoomChange}
                onErrorChange={(hasError) => updateErrorState('room', hasError)}
              />
            }
            meetingTypeDropdown={
              <Dropdown
                label={<img src="svg/group-icon.svg" alt="Group Icon" />}
                isVisible={true}
                elements={meetingTypeOptions}
                name="Select Meeting Type"
                onChange={handleMeetingTypeChange}
                onErrorChange={(hasError) => updateErrorState('meetingType', hasError)}
              />
            }
            zoomAccountDropdown={
              <Dropdown
                label={<img src="svg/person-icon.svg" alt="Person Icon" />}
                isVisible={true}
                elements={zoomAccountOptions}
                name="Select Zoom Account"
                onChange={handleZoomAccountChange}
                onErrorChange={(hasError) => updateErrorState('zoomAccount', hasError)}
              />
            }
            emailTextField={<TextField
              input="Email"
              label={<img src="svg/mail-icon.svg" alt="Mail Icon" />}
              value={inputEmailValue}
              onChange={handleEmailChange}
              onErrorChange={(hasError) => updateErrorState('email', hasError)}
              />
            }
            uploadPandaDocsForm={<UploadPandaDocs 
              onFileSelect={handleFileSelect} 
              onErrorChange={(hasError) => updateErrorState('pandaDocs', hasError)}
            />}
            descriptionTextField={<TextField
              input="Description"
              label=""
              value={inputDescriptionValue}
              onChange={handleDescriptionChange}
              onErrorChange={(hasError) => updateErrorState('description', hasError)}
              />}
            onCreateMeeting={createMeeting}
          />
        </div>
      ) : (
        <>
          <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<AddIcon />} />
          <div>
            <MiniCalendar selectedDate={selectedDate} onSelect={handleMiniCalendarSelect}/>
          </div>
          <div className={styles.meetingsFilter}>
            <MeetingsFilter filters={filters} onFilterChange={handleFilterChange} />
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarSidebar;