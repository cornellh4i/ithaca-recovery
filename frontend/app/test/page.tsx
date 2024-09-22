"use client";

import React from 'react';
import { IAdmin, IUser } from '../../util/models'
import { IMeeting } from '../../util/models'
import styles from "../../styles/TestPage.module.scss";
import TestButton from "../components/Test/TestButton"

const App = () => {

  /** ADMIN TESTING FUNCTIONS  */
  const updateAdmin = async () => {
    try {
      const newAdmin: IAdmin = { 
        uid: `hr392fb93bf932f`, // Most likely will be Microsoft ID
        name: "Phoebe Qian", 
        email: "pq29@cornell.edu"
      }

      const response = await fetch('/api/update/admin', {
        method: 'PUT',
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
      alert("Admin updated successfully! Please check the Admin collection on MongoDB.")
    } catch (error) {
      console.error('There was an error updating the data:', error);
    }
  };

  const createAdmin = async () => {
    try {
      const newAdmin: IAdmin = { 
        uid: `${Math.floor(Math.random() * 100000) + 1}`, // Most likely will be Microsoft ID
        name: "Phoebe Qian 2", 
        email: "178@cornell.edu"
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

  return (
    <div className={styles['apicontainer']}>
      <div className={styles.section}>
        <h2>Admins</h2>
        <TestButton testFunc={updateAdmin} text="Call create admin put /api/update/admin"/>
        <TestButton testFunc={createAdmin} text="Call create admin post /api/write/admin"/>
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
    </div>
  );
}

export default App;