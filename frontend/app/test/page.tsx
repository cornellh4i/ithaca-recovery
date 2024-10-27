"use client";
import React, { useContext, useState } from 'react';
import { IAdmin, IUser } from '../../util/models'
import { IMeeting } from '../../util/models'
import styles from "../../styles/TestPage.module.scss";
import TestButton from "../components/Test/TestButton"
import BoxText from "../components/atoms/BoxText";
import DatePicker from "../components/atoms/DatePicker";
import RadioGroup from '../components/atoms/RadioGroup';
import TextField from '../components/atoms/TextField';
import TimePicker from "../components/atoms/TimePicker";
import SolidButton from "../components/atoms/solidbutton"
import MeetingsFilter from '../components/molecules/MeetingsFilter';
import TodayIcon from '@mui/icons-material/Today';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const App = () => {

  /** ADMIN TESTING FUNCTIONS  */

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
      const mid = "95992";

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

  const [inputValue, setInputValue] = useState(''); // State to hold the value

  const [selectedOption, setSelectedOption] = useState<string>("Option 1");

  // Function to handle the change in radio button selection
  const handleOptionChange = (option: string) => {
    setSelectedOption(option);
  };

  // Define handler functions for button click events
  const handleCreateMeetingClick = (): void => {
    console.log('Create Meeting button clicked');
  };

  const handleGenerateLinkClick = (): void => {
    console.log('Generate Meeting Link button clicked');
  };

  return (
    <div className={styles['apicontainer']}>
      <div>
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

        <TestButton testFunc={getMeetingsDay} text="Get Meetings (Day) /api/retrieve/meeting/day" />
        <TestButton testFunc={getMeetingsWeek} text="Get Meetings (Week) /api/retrieve/meeting/week" />
        <TestButton testFunc={getMeetingsMonth} text="Get Meetings (Month) /api/retrieve/meeting/month" />

        <SolidButton text="Create Meeting" bgColor="#D95372" onClick={handleCreateMeetingClick} ></SolidButton>
        <SolidButton text="Generate Meeting Link" bgColor="#D95372" onClick={handleGenerateLinkClick} ></SolidButton>

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
          label="Meeting title"
          value={inputValue}
          onChange={setInputValue}
          underlineOnFocus={false} />
        <p>Entered Value: {inputValue}</p>

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

      <div className={styles.section}>
        <h2>Meeting Block & Room Block</h2>
        <div className="meeting-blocks">
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#b3ea75" time="9am-10am" tags={['Hybrid', 'AA']} />
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#f7e57b" time="9am-10am" tags={['Hybrid', 'AA']} />
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#96dbfe" time="9am-10am" tags={['Hybrid', 'AA']} />
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#ffae73" time="9am-10am" tags={['Hybrid', 'AA']} />
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#d2afff" time="9am-10am" tags={['Hybrid', 'AA']} />
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#ffa3c2" time="9am-10am" tags={['Hybrid', 'AA']} />
          <BoxText boxType="Meeting Block" title="Meeting Name" primaryColor="#cecece" time="9am-10am" tags={['Hybrid', 'AA']} />
        </div>

        <div className="room-blocks">
          <BoxText boxType="Room Block" title="Serenity Room" primaryColor="#b3ea75" />
          <BoxText boxType="Room Block" title="Seeds of Hope" primaryColor="#f7e57b" />
          <BoxText boxType="Room Block" title="Small but Powerful - Left" primaryColor="#96dbfe" />
          <BoxText boxType="Room Block" title="Unity Room" primaryColor="#ffae73" />
          <BoxText boxType="Room Block" title="Room for Improvement" primaryColor="#d2afff" />
          <BoxText boxType="Room Block" title="Zoom Account" primaryColor="#ffa3c2" />
          <BoxText boxType="Room Block" title="Zoom Account" primaryColor="#cecece" />
        </div>
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>DatePicker and TimePicker</h2>
        <DatePicker label={<TodayIcon />} value={"Value"} />
        <DatePicker label={"string label"} value={"Value"} />
        <TimePicker label={<AccessTimeIcon />} value={"Value"} disablePast={true} />
        <TimePicker label={"string label"} value={"Value"} disablePast={true} />
      </div>
      <div>
        <h1>Meetings Filter</h1>
        <MeetingsFilter />
      </div>
    </div>
  );
}

export default App;

