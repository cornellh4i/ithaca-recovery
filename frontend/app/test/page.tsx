"use client";
import React, { useContext, useState } from 'react';
import { IAdmin, IUser } from '../../util/models'
import { IMeeting } from '../../util/models'
import styles from "../../styles/TestPage.module.scss";
import TestButton from "../components/Test/TestButton"
import UploadPandaDocs from '../components/atoms/upload/index';
import BoxText from "../components/atoms/BoxText";
import DatePicker from "../components/atoms/DatePicker";
import RadioGroup from '../components/atoms/RadioGroup';
import TextField from '../components/atoms/TextField';
import TimePicker from "../components/atoms/TimePicker";
import MiniCalendar from "../components/atoms/MiniCalendar";
import SolidButton from "../components/atoms/solidbutton"
import checkbox from "../components/atoms/checkbox/index"
import SpinnerInput from "../components/atoms/SpinnerInput";
import Dropdown from "../components/atoms/dropdown";
import MeetingsFilter from '../components/molecules/MeetingsFilter';
import NewMeetingSidebar from '../components/organisms/NewMeeting';
import ViewMeetingDetails from '../components/organisms/ViewMeeting';
import TodayIcon from '@mui/icons-material/Today';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ReccuringMeeting from "../components/molecules/RecurringMeeting";

import { set } from 'mongoose';

const App = () => {

  const sampleMeeting = {
    id: '1',
    mid: 'M123',
    title: 'Project Kickoff',
    description: 'Discuss project goals, milestones, and next steps with the team.',
    creator: 'Alice Johnson',
    group: 'Team Calendar',
    startDateTime: new Date(2024, 10, 20, 14, 0), // Nov 20, 2024, 2:00 PM
    endDateTime: new Date(2024, 10, 20, 15, 30), // Nov 20, 2024, 3:30 PM
    zoomAccount: 'alice.johnson@company.com',
    zoomLink: 'https://zoom.us/j/123456789',
    zid: 'Z456',
    type: 'Virtual Meeting',
    room: 'Conference Room B',
    recurrence: 'Weekly',
    email: 'test@email.com', // Added email property
    onBack: () => alert('Back button clicked'),
    onEdit: () => alert('Edit button clicked'),
    onDelete: () => alert('Delete Button Clicked'),
  };

  /** ADMIN TESTING FUNCTIONS  */

  // State declarations
  const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); // Meeting title
  const [dateValue, setDateValue] = useState<string>(""); // Initial date value as empty
  const [timeValue, setTimeValue] = useState<string>(""); // Initial time range as empty
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null); // Initially no room selected
  const [selectedMeetingType, setSelectedMeetingType] = useState<string>("Hybrid"); // Default meeting type
  const [inputEmailValue, setEmailValue] = useState(""); // Email input value
  const [selectedOption, setSelectedOption] = useState<string>("Never"); // Default radio option
  const [selectedZoomAccount, setSelectedZoomAccount] = useState<string | null>(null); // Initially no Zoom account selected
  const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value

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

  // Handlers
  const handleDateChange = (newDate: string) => {
    setDateValue(newDate);
  };

  const handleTimeChange = (newTime: string) => {
    setTimeValue(newTime);
  };

  const handleRoomChange = (room: string) => {
    setSelectedRoom(room);
  };

  const handleMeetingTypeChange = (type: string) => {
    setSelectedMeetingType(type);
  };

  const handleOptionChange = (option: string) => {
    setSelectedOption(option);
  };

  const handleZoomChange = (email: string) => {
    setSelectedZoomAccount(email);
  };


  const createAdmin = async () => {
    try {
      const newAdmin: IAdmin = {
        uid: `${Math.floor(Math.random() * 100000) + 1}`, // Most likely will be Microsoft ID
        name: "Joseph Ugarte",
        email: "jeu9@cornell.edu"
      }

      const response = await fetch('/api/write/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          newAdmin
        ),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const adminResponse = await response.json();
      console.log(adminResponse);
      alert("Admin created successfully! Please check the Admin collection on MongoDB.")
    } catch (error) {
      console.error('There was an error creating the data:', error);
    }
  };

  const getAdmin = async () => {
    try {
      /* Configure to me an Admin's real email */
      const email = "jeu9@cornell.edu";
      const url = new URL('/api/retrieve/admin', window.location.origin);
      url.searchParams.append('email', email);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const adminResponse = await response.json();
      console.log(adminResponse);
      alert("Admin retrieved successfully! Please check the Admin collection on MongoDB.")
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const deleteAdmin = async () => {
    try {
      /* Configure to me an Admin's real email */
      const email = "jeu9@cornell.edu";
      const response = await fetch("/api/delete/admin", {
        method: "DELETE",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const adminResponse = await response.json();
      console.log(adminResponse);
      alert("Admin deleted successfully! Please check the Admin collection on MongoDB.")
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  /** MEETING TESTING FUNCTIONS */

  const createMeeting = async () => {
    try {
      const newMeeting: IMeeting = {
        title: 'Meeting Title',
        mid: `${Math.floor(Math.random() * 100000) + 1}`,
        description: 'Meeting Description',
        creator: 'Creator',
        group: 'Group',
        startDateTime: new Date(),
        endDateTime: new Date(),
        email: inputEmailValue,
        zoomAccount: 'Zoom Account',
        type: "in-person",
        room: "sunflower"
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
      alert("Meeting created successfully! Please check the Meeting collection on MongoDB.")
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };


  const deleteMeeting = async () => {
    try {
      /* Configure to be a real mid */
      const mid = "84143";

      const response = await fetch('/api/delete/meeting', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mid
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const meetingResponse = await response.json();
      console.log(meetingResponse);
      alert("Meeting deleted successfully! Please check the Meeting collection on MongoDB.")
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };


  const updateMeeting = async () => {
    try {
      /* mid must correspond to a meeting existing in the collection */
      const newMeeting: IMeeting = {
        title: 'Meeting Title',
        mid: '36650',
        description: 'Meeting Description',
        creator: 'Creator',
        group: 'Group',
        startDateTime: new Date(),
        endDateTime: new Date(),
        email: inputEmailValue,
        zoomAccount: 'Zoom Account',
        type: "in-person",
        room: "sunflower"
      };

      const response = await fetch('/api/update/meeting', {
        method: 'PUT',
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
      alert("Meeting updated successfully! Please check the Meeting collection on MongoDB.")
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const getMeeting = async () => {
    const meetingId = "2024-04-29T21:01:39.214Z";
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Meeting Data:", data);
    } catch (error) {
      console.error("Failed to fetch meeting:", error);
    }
  };

  const getMeetingsDay = async () => {
    try {
      const currentDate = new Date('2024-09-10');

      const url = new URL('/api/retrieve/meeting/day', window.location.origin);
      url.searchParams.append('startDate', currentDate.toISOString());
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const meetingResponse = await response.json();
      console.log(meetingResponse);
      alert(`Daily meetings retrieved successfully for ${currentDate.toISOString()}! Please check the console.`)
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const getMeetingsWeek = async () => {
    try {
      const currentDate = new Date('2024-09-10');

      const url = new URL('/api/retrieve/meeting/week', window.location.origin);
      url.searchParams.append('startDate', currentDate.toISOString());
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const meetingResponse = await response.json();
      console.log(meetingResponse);
      alert(`Weekly meetings retrieved successfully for ${currentDate.toISOString()}! Please check the console.`);
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const getMeetingsMonth = async () => {
    try {
      const currentDate = new Date('2024-09-10');

      const url = new URL('/api/retrieve/meeting/month', window.location.origin);
      url.searchParams.append('startDate', currentDate.toISOString());
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const meetingResponse = await response.json();
      console.log(meetingResponse);
      alert(`Monthly meetings retrieved successfully for ${currentDate.toISOString()}! Please check the console.`);
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  /** ZOOM TESTING FUNCTIONS */

  const handleZoomToken = async () => {
    try {
      const response = await fetch('/api/zoom');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const zoomResponse = await response.json();
      console.log(zoomResponse);
      alert("Zoom token retrieved! Please check the console.");
    } catch (error) {
      console.error('Error generating Zoom token:', error);
    }
  };

  /** MICROSOFT ECOSYSTEM TESTING FUNCTIONS */

  const getGroups = async () => {
    try {
      const response = await fetch('/api/microsoft/groups', {
        method: "GET",
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      console.log('Access Token: ', data);
    }
    catch (error) {
      console.error("Error fetching groups: ", error)
    }
  }

  const getCalendars = async () => {
    try {
      const groupId = "123";

      const groupCal = await fetch('/api/microsoft/calendars/getCalendars', {
        method: "GET",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          groupId
        }),
      });
      const groupData = await groupCal.json();
      console.log('Group calendar: ', groupData);
    }
    catch (error) {
      console.error("Error fetching group calendar: ", error)
    }
  }
  /** PANDADOCS FUNCTION */
  const handleFileSelect = (file: File | null) => {
    if (file) {
      console.log('File selected:', file.name);
    } else {
      console.log('No file selected');
    }
  }


  return (
    <div className={styles['apicontainer']}>
      <div>
      </div>
      <div>
      </div>
      <div className={styles.section}>
        <h2>Reccuring Meeting</h2>
        <ReccuringMeeting></ReccuringMeeting>
      </div>
      <div className={styles.section}>
        <h2>Spinner Input</h2>
        <SpinnerInput value={1} onChange={() => { }}></SpinnerInput>
      </div>
      <div className={styles.section}>
        <h2>Admins</h2>
        <TestButton testFunc={createAdmin} text="Call create admin post /api/write/admin" />
        <TestButton testFunc={getAdmin} text="Call get admin /api/retrieve/admin" />
        <TestButton testFunc={deleteAdmin} text="Call delete admin /api/delete/admin" />
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Meetings</h2>
        <TestButton testFunc={createMeeting} text="Call Create Meeting /api/write/meeting" />
        <TestButton testFunc={updateMeeting} text="Call Update meeting /api/update/meeting" />
        <TestButton testFunc={deleteMeeting} text="Call Delete meeting /api/delete/meeting" />
        <TestButton testFunc={getMeeting} text="Call Get meeting /api/retrieve/[id]" />


        <TestButton testFunc={getMeetingsDay} text="Get Meetings (Day) /api/retrieve/meeting/day" />
        <TestButton testFunc={getMeetingsWeek} text="Get Meetings (Week) /api/retrieve/meeting/week" />
        <TestButton testFunc={getMeetingsMonth} text="Get Meetings (Month) /api/retrieve/meeting/month" />
      </div>
      <div className={styles.section + ' ' + styles.zoom}>
        <h2>Zoom Testing</h2>
        <TestButton testFunc={handleZoomToken} text="Generate zoom token" />
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Microsoft Exchange Calendars</h2>
        <TestButton testFunc={getGroups} text="Call get groups /api/groups/routes" />
        <TestButton testFunc={getCalendars} text="Call get calendars /api/calender/getCalendars/routes" />
      </div>
      <div className={styles.section}>
        <h2>Example Text Field & Radio Buttons</h2>
        <TextField
          input="Meeting title"
          value={inputMeetingTitleValue}
          onChange={setMeetingTitleValue}
        />
        <p>Entered Value: {inputMeetingTitleValue}</p>

        <div>
          <RadioGroup
            label="Ends"
            options={["Never", "On", "After"]}
            selectedOption={selectedOption}
            onChange={handleOptionChange}
            name="preferences"
            disabledOptions={["On"]}
          />
          <p>You have selected: {selectedOption}</p>
        </div>
      </div>

      <div className={styles.section + ' ' + styles.meetings}>
        <h2>DatePicker and TimePicker</h2>
        <DatePicker
          label={<TodayIcon />}
          value={dateValue}
          onChange={handleDateChange}
          error={dateValue === '' ? 'Date is required' : undefined} // Example error handling
        />
        <DatePicker
          label="string label"
          value={dateValue}
          onChange={handleDateChange}
          error={dateValue === '' ? 'Date is required' : undefined} // Example error handling
        />
        <TimePicker
          label={<AccessTimeIcon />}
          value={timeValue}
          onChange={handleTimeChange}
          disablePast={true}
          error={timeValue === '' ? 'Time is required' : undefined} // Example error handling
        />
        <TimePicker
          label="string label"
          value={timeValue}
          onChange={handleTimeChange}
          disablePast={true}
          error={timeValue === '' ? 'Time is required' : undefined} // Example error handling
        />
      </div>
      <div className={styles.section}>
        <h2>Spinner Input</h2>
        <SpinnerInput value={1} onChange={() => { }}></SpinnerInput>
      </div>

      <div className={styles.section}>
        <h1>Meetings Filter</h1>
        <MeetingsFilter filters={{
          SerenityRoom: false,
          SeedsofHope: false,
          UnityRoom: false,
          RoomforImprovement: false,
          SmallbutPowerfulRight: false,
          SmallbutPowerfulLeft: false,
          ZoomAccount1: false,
          ZoomAccount2: false,
          ZoomAccount3: false,
          ZoomAccount4: false,
          AA: false,
          AlAnon: false,
          Other: false,
          InPerson: false,
          Hybrid: false,
          Remote: false
        }} onFilterChange={function (name: string, value: boolean): void {
          throw new Error('Function not implemented.');
        }} />
      </div>

      <div className={styles.section}>
        <h1>Test Page for ViewMeetingDetails Component</h1>
        <ViewMeetingDetails {...sampleMeeting} />
      </div>

      {/* <div className={styles.section}>
        <h2>Mini Calendar</h2>
        <MiniCalendar />
      </div> */}

    </div>
  );
}

export default App;