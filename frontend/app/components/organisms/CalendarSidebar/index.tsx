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
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import TodayIcon from '@mui/icons-material/Today';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import IconButton from '@mui/material/IconButton';
import styles from '../../../../styles/components/organisms/CalendarSidebar.module.scss';

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
              label="Meeting title"
              value={inputMeetingTitleValue}
              onChange={setMeetingTitleValue}
              underlineOnFocus={false} />}
            DatePicker={<DatePicker
              label={<TodayIcon />}
              value={dateValue}
              onChange={setDateValue}
              error={dateValue === '' ? 'Date is required' : undefined} // Example error handling
            />}
            TimePicker={<TimePicker
              label={<AccessTimeIcon />}
              value={timeValue}
              onChange={setTimeValue}
              disablePast={true}
              error={timeValue === '' ? 'Time is required' : undefined} // Example error handling
            />}
            RadioGroup={<RadioGroup
              label="Ends"
              options={["Never", "On", "After"]}
              selectedOption={freqValue}
              onChange={setFreqValue}
              name="preferences"
            />}
            roomSelectionDropdown={ // For room selection dropdown
              <Dropdown
                label={<svg width="28" height="29" viewBox="0 0 28 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.0002 26.1663C13.7279 26.1663 13.4946 26.0886 13.3002 25.933C13.1057 25.7775 12.9599 25.5733 12.8627 25.3205C12.4932 24.2316 12.0266 23.2108 11.4627 22.258C10.9182 21.3052 10.1502 20.1872 9.1585 18.9038C8.16683 17.6205 7.35989 16.3955 6.73766 15.2288C6.13489 14.0622 5.8335 12.6525 5.8335 10.9997C5.8335 8.72467 6.621 6.79967 8.196 5.22467C9.79044 3.63023 11.7252 2.83301 14.0002 2.83301C16.2752 2.83301 18.2002 3.63023 19.7752 5.22467C21.3696 6.79967 22.1668 8.72467 22.1668 10.9997C22.1668 12.7691 21.8266 14.2469 21.146 15.433C20.4849 16.5997 19.7168 17.7566 18.8418 18.9038C17.7918 20.3038 16.9946 21.4705 16.4502 22.4038C15.9252 23.3177 15.4877 24.29 15.1377 25.3205C15.0404 25.5927 14.8849 25.8066 14.671 25.9622C14.4766 26.0983 14.2529 26.1663 14.0002 26.1663ZM14.0002 21.9955C14.3307 21.3344 14.7002 20.683 15.1085 20.0413C15.5363 19.3997 16.1585 18.5441 16.9752 17.4747C17.8113 16.3858 18.4918 15.3844 19.0168 14.4705C19.5613 13.5372 19.8335 12.3802 19.8335 10.9997C19.8335 9.38578 19.2599 8.01495 18.1127 6.88717C16.9849 5.73995 15.6141 5.16634 14.0002 5.16634C12.3863 5.16634 11.0057 5.73995 9.8585 6.88717C8.73072 8.01495 8.16683 9.38578 8.16683 10.9997C8.16683 12.3802 8.42933 13.5372 8.95433 14.4705C9.49877 15.3844 10.1891 16.3858 11.0252 17.4747C11.8418 18.5441 12.4543 19.3997 12.8627 20.0413C13.2904 20.683 13.6696 21.3344 14.0002 21.9955ZM14.0002 13.9163C14.8168 13.9163 15.5071 13.6344 16.071 13.0705C16.6349 12.5066 16.9168 11.8163 16.9168 10.9997C16.9168 10.183 16.6349 9.49273 16.071 8.92884C15.5071 8.36495 14.8168 8.08301 14.0002 8.08301C13.1835 8.08301 12.4932 8.36495 11.9293 8.92884C11.3654 9.49273 11.0835 10.183 11.0835 10.9997C11.0835 11.8163 11.3654 12.5066 11.9293 13.0705C12.4932 13.6344 13.1835 13.9163 14.0002 13.9163Z" fill="#848484" />
                </svg>
                }
                isVisible={true}
                elements={roomOptions}
                name="Select Room"
              />
            }
            meetingTypeDropdown={ // For meeting type dropdown
              <Dropdown
                label={<svg width="28" height="29" viewBox="0 0 28 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 22.5V19.725C2 19.1583 2.14167 18.6333 2.425 18.15C2.70833 17.6667 3.1 17.3 3.6 17.05C3.83333 16.9333 4.05833 16.825 4.275 16.725C4.50833 16.625 4.75 16.5333 5 16.45V22.5H2ZM6 15.5C5.16667 15.5 4.45833 15.2083 3.875 14.625C3.29167 14.0417 3 13.3333 3 12.5C3 11.6667 3.29167 10.9583 3.875 10.375C4.45833 9.79167 5.16667 9.5 6 9.5C6.83333 9.5 7.54167 9.79167 8.125 10.375C8.70833 10.9583 9 11.6667 9 12.5C9 13.3333 8.70833 14.0417 8.125 14.625C7.54167 15.2083 6.83333 15.5 6 15.5ZM6 13.5C6.28333 13.5 6.51667 13.4083 6.7 13.225C6.9 13.025 7 12.7833 7 12.5C7 12.2167 6.9 11.9833 6.7 11.8C6.51667 11.6 6.28333 11.5 6 11.5C5.71667 11.5 5.475 11.6 5.275 11.8C5.09167 11.9833 5 12.2167 5 12.5C5 12.7833 5.09167 13.025 5.275 13.225C5.475 13.4083 5.71667 13.5 6 13.5ZM6 22.5V19.7C6 19.1333 6.14167 18.6167 6.425 18.15C6.725 17.6667 7.11667 17.3 7.6 17.05C8.63333 16.5333 9.68333 16.15 10.75 15.9C11.8167 15.6333 12.9 15.5 14 15.5C15.1 15.5 16.1833 15.6333 17.25 15.9C18.3167 16.15 19.3667 16.5333 20.4 17.05C20.8833 17.3 21.2667 17.6667 21.55 18.15C21.85 18.6167 22 19.1333 22 19.7V22.5H6ZM8 20.5H20V19.7C20 19.5167 19.95 19.35 19.85 19.2C19.7667 19.05 19.65 18.9333 19.5 18.85C18.6 18.4 17.6917 18.0667 16.775 17.85C15.8583 17.6167 14.9333 17.5 14 17.5C13.0667 17.5 12.1417 17.6167 11.225 17.85C10.3083 18.0667 9.4 18.4 8.5 18.85C8.35 18.9333 8.225 19.05 8.125 19.2C8.04167 19.35 8 19.5167 8 19.7V20.5ZM14 14.5C12.9 14.5 11.9583 14.1083 11.175 13.325C10.3917 12.5417 10 11.6 10 10.5C10 9.4 10.3917 8.45833 11.175 7.675C11.9583 6.89167 12.9 6.5 14 6.5C15.1 6.5 16.0417 6.89167 16.825 7.675C17.6083 8.45833 18 9.4 18 10.5C18 11.6 17.6083 12.5417 16.825 13.325C16.0417 14.1083 15.1 14.5 14 14.5ZM14 12.5C14.55 12.5 15.0167 12.3083 15.4 11.925C15.8 11.525 16 11.05 16 10.5C16 9.95 15.8 9.48333 15.4 9.1C15.0167 8.7 14.55 8.5 14 8.5C13.45 8.5 12.975 8.7 12.575 9.1C12.1917 9.48333 12 9.95 12 10.5C12 11.05 12.1917 11.525 12.575 11.925C12.975 12.3083 13.45 12.5 14 12.5ZM22 15.5C21.1667 15.5 20.4583 15.2083 19.875 14.625C19.2917 14.0417 19 13.3333 19 12.5C19 11.6667 19.2917 10.9583 19.875 10.375C20.4583 9.79167 21.1667 9.5 22 9.5C22.8333 9.5 23.5417 9.79167 24.125 10.375C24.7083 10.9583 25 11.6667 25 12.5C25 13.3333 24.7083 14.0417 24.125 14.625C23.5417 15.2083 22.8333 15.5 22 15.5ZM22 13.5C22.2833 13.5 22.5167 13.4083 22.7 13.225C22.9 13.025 23 12.7833 23 12.5C23 12.2167 22.9 11.9833 22.7 11.8C22.5167 11.6 22.2833 11.5 22 11.5C21.7167 11.5 21.475 11.6 21.275 11.8C21.0917 11.9833 21 12.2167 21 12.5C21 12.7833 21.0917 13.025 21.275 13.225C21.475 13.4083 21.7167 13.5 22 13.5ZM23 22.5V16.45C23.25 16.5333 23.4833 16.625 23.7 16.725C23.9333 16.825 24.1667 16.9333 24.4 17.05C24.9 17.3 25.2917 17.6667 25.575 18.15C25.8583 18.6333 26 19.1583 26 19.725V22.5H23Z" fill="#848484" />
                </svg>
                }
                isVisible={true}
                elements={meetingTypeOptions}
                name="Select Meeting Type"
              />
            }
            zoomAccountDropdown={
              <Dropdown
                label={<svg width="28" height="29" viewBox="0 0 28 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.9998 14.5003C12.7165 14.5003 11.6179 14.0434 10.704 13.1295C9.79012 12.2156 9.33317 11.117 9.33317 9.83366C9.33317 8.55033 9.79012 7.45171 10.704 6.53783C11.6179 5.62394 12.7165 5.16699 13.9998 5.16699C15.2832 5.16699 16.3818 5.62394 17.2957 6.53783C18.2096 7.45171 18.6665 8.55033 18.6665 9.83366C18.6665 11.117 18.2096 12.2156 17.2957 13.1295C16.3818 14.0434 15.2832 14.5003 13.9998 14.5003ZM4.6665 23.8337V20.567C4.6665 19.9059 4.83664 19.2982 5.17692 18.7441C5.5172 18.1899 5.96928 17.767 6.53317 17.4753C7.73873 16.8725 8.96373 16.4205 10.2082 16.1191C11.4526 15.8177 12.7165 15.667 13.9998 15.667C15.2832 15.667 16.5471 15.8177 17.7915 16.1191C19.0359 16.4205 20.261 16.8725 21.4665 17.4753C22.0304 17.767 22.4825 18.1899 22.8228 18.7441C23.163 19.2982 23.3332 19.9059 23.3332 20.567V23.8337H4.6665ZM6.99984 21.5003H20.9998V20.567C20.9998 20.3531 20.9464 20.1587 20.8394 19.9837C20.7325 19.8087 20.5915 19.6725 20.4165 19.5753C19.3665 19.0503 18.3068 18.6566 17.2373 18.3941C16.1679 18.1316 15.0887 18.0003 13.9998 18.0003C12.9109 18.0003 11.8318 18.1316 10.7623 18.3941C9.69289 18.6566 8.63317 19.0503 7.58317 19.5753C7.40817 19.6725 7.2672 19.8087 7.16025 19.9837C7.05331 20.1587 6.99984 20.3531 6.99984 20.567V21.5003ZM13.9998 12.167C14.6415 12.167 15.1908 11.9385 15.6478 11.4816C16.1047 11.0246 16.3332 10.4753 16.3332 9.83366C16.3332 9.19199 16.1047 8.64269 15.6478 8.18574C15.1908 7.7288 14.6415 7.50033 13.9998 7.50033C13.3582 7.50033 12.8089 7.7288 12.3519 8.18574C11.895 8.64269 11.6665 9.19199 11.6665 9.83366C11.6665 10.4753 11.895 11.0246 12.3519 11.4816C12.8089 11.9385 13.3582 12.167 13.9998 12.167Z" fill="#848484" />
                </svg>
                }
                isVisible={true}
                elements={zoomAccountOptions}
                name="Select Zoom Account"
              />
            }
            emailTextField={<TextField
              label="Email"
              value={inputEmailValue}
              onChange={setEmailValue}
              underlineOnFocus={false} />
            }
            uploadPandaDocsForm={<UploadPandaDocs onFileSelect={handleFileSelect} />}
            descriptionTextField={<TextField
              label="Description"
              value={inputDescriptionValue}
              onChange={setDescriptionValue}
              underlineOnFocus={false} />}
            onCreateMeeting={createMeeting}
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

