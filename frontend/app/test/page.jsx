"use client"

import React from 'react';
import { IUser } from '../../util/models'
import { IMeeting } from '../../util/models'
import styles from "../../styles/TestPage.module.scss"

function App() {
  const handleButtonClick = async () => {
    try {
      const response = await fetch('/api/write/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          { "uid": "f04nf0483fjffg", "name": "Hello" }
        ),
      });

      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClick2 = async () => {
    try {

      const response = await fetch('/api/retrieve');
      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClick3 = async () => {
    try {
      const response = await fetch("/api/delete", {
        method: "POST",
      });
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  const handleButtonClick4 = async () => {
    try {
      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'Hello World!' }),
      });

      if (response.ok) {
        console.log('Success');
      } else {
        console.error('Error:', response.statusText);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleUpdate = async () => {
    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          { "uid": "4iN010DwUFVMMMO6BxIuC6XVMG93", "name": "Sanya Mahajan" }
        ),
      });
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

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


  return (
    <div className={styles['apicontainer']}>
      <div className={styles.section + ' ' + styles['test-users']}>
        <h2>Users</h2>
        <button className={styles.btn} onClick={handleButtonClick}>Call create users post /api/write/user</button>
        <button className={styles.btn} onClick={handleButtonClick2}>Call get all users /api/retrieve</button>
        <button className={styles.btn} onClick={handleButtonClick3}>Call delete user /api/delete</button>
        <button className={styles.btn} onClick={handleUpdate}>Call create User /api/update/</button>
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <h2>Meetings</h2>
        <button className={styles.btn} onClick={CreateMeeting}>Call create Meeting /api/write/meeting</button>
        <button className={styles.btn} onClick={UpdateMeeting}>Call Update meeting /api/update/meeting</button>
        <button className={styles.btn} onClick={DeleteMeeting}>Call Delete meeting /api/delete/meeting</button>
      </div>
      <div className={styles.section + ' ' + styles.webhook}>
        <h2>Wehbooks</h2>
        <button className={`${styles.btn} ${styles['btn-active']} ${styles['btn-secondary']}`} onClick={handleButtonClick4}>Call webhook post /api/webhook</button>
      </div>
    </div>
  );
}

export default App;