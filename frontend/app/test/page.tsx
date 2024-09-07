"use client";

import React from 'react';
import { IAdmin, IUser } from '../../util/models'
import { IMeeting } from '../../util/models'
import styles from "../../styles/TestPage.module.scss";
import TestButton from "../components/Test/TestButton"

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
        date: new Date(),
        startTime: new Date(),
        fromTime: new Date(),
        zoomAccount: 'Zoom Account',
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
      const mid = '96160';

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
      const newMeeting = {
        title: 'Meeting Title',
        mid: '96160',
        description: 'Meeting Description',
        creator: 'Creator',
        group: 'Group',
        date: new Date(),
        startTime: new Date(),
        fromTime: new Date(),
        zoomAccount: 'Zoom Account',
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
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const graphResponse = await response.json();
      console.log(graphResponse.value[0]);
      alert(`Recovery organization group retrieved: ${graphResponse.value[0].mail}`);
    }
    catch (error) {
      console.error("Error fetching groups: ", error)
    }
  }

  const getCalendars = async () => {
    try {
      /* Recovery Group ID */
      const groupId = "ad5a4776-6e1e-41f3-8a1e-7d9737bff0d1";
      // const groupId = "ad5a47766e1e41f38a1e7d9737bff0d1";

      const url = new URL('/api/microsoft/calendars/getCalendars', window.location.origin);
      url.searchParams.append('groupId', groupId);
      const response = await fetch(url);

      // const response = await fetch('/api/microsoft/calendars/getCalendars', {
      //   method: "GET",
      //   headers: {
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify({
      //     groupId
      //   }),
      // });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const graphResponse = await response.json();
      console.log(graphResponse);
      alert(`Calendar retrieved!`);
    }
    catch (error) {
      console.error("Error fetching group calendar: ", error)
    }
  }

  return (
    <div className={styles['apicontainer']}>
      <div className={styles.section}>
        <h2>Admins</h2>
        <TestButton testFunc={createAdmin} text="Call create admin post /api/write/admin"/>
        <TestButton testFunc={getAdmin} text="Call get admin /api/retrieve/admin" />
        <TestButton testFunc={deleteAdmin} text="Call delete admin /api/delete/admin" />
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Meetings</h2>
        <TestButton testFunc={createMeeting} text="Call create Meeting /api/write/meeting" />
        <TestButton testFunc={updateMeeting} text="Call Update meeting /api/update/meeting" />
        <TestButton testFunc={deleteMeeting} text="Call Delete meeting /api/delete/meeting" />
      </div>
      <div className={styles.section + ' ' + styles.zoom}>
        <h2>Zoom Testing</h2>
        <TestButton testFunc={handleZoomToken} text="Generate zoom token" />
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Microsoft Exchange Calendars</h2>
        <TestButton testFunc={getGroups} text="Call get groups /api/microsoft/groups" />
        <TestButton testFunc={getCalendars} text="Call get calendars /api/microsoft/calender/getCalendars" />
      </div>
    </div>
  );
}

export default App;