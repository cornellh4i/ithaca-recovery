"use client";
import React from 'react';
import { IUser } from '../../util/models'
import { IMeeting } from '../../util/models'
import styles from "../../styles/TestPage.module.scss";

const App = () => {

  /** ADMIN TESTING FUNCTIONS  */

  const createAdmin = async () => {
    try {
      const response = await fetch('/api/write/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          { "uid": "4iN010DwUFVMMMO6BxIuC6XVMG93", "name": "Joseph Ugarte", "email": "ju24@gmail.com", "privilegeMode": "Admin" }
        ),
      });


      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const getAdmin = async () => {
    try {

      const response = await fetch('/api/retrieve/admin');
      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const deleteAdmin = async () => {
    try {
      const response = await fetch("/api/delete/admin", {
        method: "DELETE",
      });
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  /** MEETING TESTING FUNCTIONS */


  const CreateMeeting = async () => {
    try {
      const newMeeting = {
        title: 'Meeting Title',
        mid: 'Meeting ID',
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


      if (response.ok) {
        const meetingResponse = await response.json();
        console.log(meetingResponse);
      } else {
        console.error('HTTP error:', response.statusText);
      }


    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };


  const DeleteMeeting = async () => {
    try {
      const newMeeting = {
        title: 'Meeting Title',
        mid: 'Meeting ID',
        description: 'Meeting Description',
        creator: 'Creator',
        group: 'Group',
        date: new Date(),
        startTime: new Date(),
        fromTime: new Date(),
        zoomAccount: 'Zoom Account',
      };
      const response = await fetch('/api/delete/meeting', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          newMeeting
        ),
      });




      if (response.ok) {
        const meetingResponse = await response.json();
        console.log(meetingResponse);
      } else {
        console.error('HTTP error during update:', response.statusText);
      }




    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };


  const UpdateMeeting = async () => {
    try {
      const newMeeting = {
        title: 'Meeting Title',
        mid: 'Meeting ID',
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
      if (response.ok) {
        const meetingResponse = await response.json();
        console.log(meetingResponse);
      } else {
        console.error('HTTP error during update:', response.statusText);
      }
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  /** ZOOM TESTING FUNCTIONS */

  const handleZoomToken = async () => {
    try {
      const response = await fetch('/api/zoom');
      const data = await response.json();
      console.log('Access Token:', data.access_token);
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
        },
        body: JSON.stringify(
          accessToken
        ),
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
      const groupCal = await fetch('/api/microsoft/calendars/getCalendars', {
        method: "GET",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          accessToken, groupId
        ),
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
        <button className={styles.btn} onClick={createAdmin}>Call create admin post /api/write/admin</button>
        <button className={styles.btn} onClick={getAdmin}>Call get admin /api/retrieve/admin</button>
        <button className={styles.btn} onClick={deleteAdmin}>Call delete admin /api/delete/admin</button>
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Meetings</h2>
        <button className={styles.btn} onClick={CreateMeeting}>Call create Meeting /api/write/meeting</button>
        <button className={styles.btn} onClick={UpdateMeeting}>Call Update meeting /api/update/meeting</button>
        <button className={styles.btn} onClick={DeleteMeeting}>Call Delete meeting /api/delete/meeting</button>
      </div>
      <div className={styles.section + ' ' + styles.zoom}>
        <h2>Zoom Testing</h2>
        <button className={`${styles.btn} ${styles['btn-active']} ${styles['btn-secondary']}`} onClick={handleZoomToken}>Generate zoom token</button>
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Microsoft Exchange Calendars</h2>
        <button className={styles.btn} onClick={getGroups}>Call get groups /api/groups/routes</button>
        <button className={styles.btn} onClick={getCalendars}>Call get calendars /api/calender/getCalendars/routes</button>
      </div>
    </div>
  );
}

export default App;