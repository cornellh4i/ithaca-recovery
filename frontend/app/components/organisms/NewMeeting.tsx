import React, { useState } from 'react';
import { MeetingForm } from './MeetingForm';

import TextField from '../atoms/TextField';
import DatePicker from '../atoms/DatePicker';
import TimePicker from '../atoms/TimePicker';
import Dropdown from '../atoms/dropdown';
import RecurringMeetingForm from '../molecules/RecurringMeeting';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { v4 as uuidv4 } from 'uuid';
import { IMeeting } from '../../../util/models'
import { convertETToUTC } from "../../../util/timeUtils";

import styles from '../../../styles/components/organisms/MeetingForm.module.scss';

interface NewMeetingSidebarProps {
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> =
  ({ setIsNewMeetingOpen }) => {
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
    const [recurringMeetingInfo, setRecurringMeetingInfo] = useState<{
        isRecurring: boolean;
        frequency: number;
        selectedDays: string[];
        endOption: string;
        endDate: string | undefined;
        occurrences: number;
      }>({
        isRecurring: false,
        frequency: 1,
        selectedDays: [],
        endOption: 'Never',
        endDate: undefined, 
        occurrences: 1,
      }); 
   
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
      setRecurringMeetingInfo({
        isRecurring: false,
        frequency: 1,
        selectedDays: [],
        endOption: 'Never',
        endDate: undefined,
        occurrences: 1,
      });    
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

    const generateZoomLink = async () => {
      try {
        const zoomAccIdStr = selectedZoomAccount.replace("Zoom Email ", "");
        const zoomAccId = parseInt(zoomAccIdStr);
        const meetingStartTime = timeValue.split('-');
        const isRecurring = recurringMeetingInfo.isRecurring; //tells us if recurring meeting is checked
  
  
        const type = isRecurring ? 8 : 2; //8 = recurring if box is checked; 2 = single event if box isn't checked
        console.log('isRecurringType hi:', type)
  
        // extract and clean up the start and end times
        const startTime = meetingStartTime[0].trim();
        const endTime = meetingStartTime[1].trim();
  
        // convert time to minutes since midnight
        const convertToMinutes = (time: string): number => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };
  
        const startMinutes = convertToMinutes(startTime);
        const endMinutes = convertToMinutes(endTime);
  
        const duration = endMinutes - startMinutes;
  
        const formatStartTime = (dateValue: string, startTime: string): string => {
          const date = new Date(dateValue).toISOString().split('T')[0]; // convert to YYYY-MM-DD
          return `${date}T${startTime}:00Z`; // combine with startTime and append "Z" for UTC
        };
  
        const start_time = formatStartTime(dateValue, startTime);
  
        const topic = inputMeetingTitleValue
  
        //Here we convert the days to numbers (zoom expects numbers)
        const daysByNum:Record<string, number> = {
          sun: 1,
          mon: 2,
          tue: 3,
          wed: 4,
          thu: 5,
          fri: 6,
          sat: 7
        };
  
        const convertDaysToNums = (days: string[]) => {
          return days.map(day => daysByNum[day.toLowerCase()]).filter(num => num !== undefined).join(",");
        };
  
        const daysAsNum = convertDaysToNums(recurringMeetingInfo.selectedDays) //list numbers
        console.log('end date', recurringMeetingInfo.endDate)
  
        //If user select 'Ends On' option for recurring meetings we want to convert the end date to ISO format
        const zoomEndDate = recurringMeetingInfo.endDate 
          ? formatStartTime(String(recurringMeetingInfo.endDate), startTime)
          : null;
  
  
        const recurrence = {
          type: 2, //1= daily, 2=weekly, 3=monthly
          repeat_interval: recurringMeetingInfo.frequency, //1 means repeats every week; 2 means repeats every two weeks, etc...
          weekly_days: daysAsNum, //the days of week we want the meeting to repeat on
  
          /** 
           * We need this conditional cuz if we have both fields, end_times overrides end_date_time
           * So if we choose 'end On' we use end_date_time
           * If we choose 'end after we use end_times; end times controls how many times the meeting repeats
           * The spread operator adds one of the two key value pairs to our recurrence object (dictionary)
          */
          ...(zoomEndDate
            ? { end_date_time: zoomEndDate }  
            : { end_times: recurringMeetingInfo.occurrences })
          
          //nothing in our form corresponds to these fields
          // monthly_day: 1,
          // monthly_week: 1,
          // monthly_week_day: 6,
        }
        //we send this to the zoom api
        const requestBody = {
          zoomAccId,
          duration,
          type,
          start_time,
          topic,
          recurrence
        };
    
        const response = await fetch('/api/zoom/CreateMeeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
    
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
    
        const zoomResponse = await response.json();
        console.log("Zoom Meeting Created:", zoomResponse);
        alert("Zoom meeting link generated successfully!");
        return zoomResponse; 
    
      } catch (error) {
        console.error("Error generating Zoom link:", error);
        alert("Failed to generate Zoom meeting link.");
      }
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
          title: inputMeetingTitleValue,
          mid: generateMeetingId(),
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
          RecurringMeeting={<RecurringMeetingForm onChange={setRecurringMeetingInfo} />}
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
          generateMeetingLink={generateZoomLink}
          handleMeetingSubmit={createMeeting}
          buttonText={"Create Meeting"}
        />
      </div>
    );
  };

export default NewMeetingSidebar;