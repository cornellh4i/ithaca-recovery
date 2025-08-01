"use client";

import React, { useState } from "react";
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { SingleInputTimeRangeField } from '@mui/x-date-pickers-pro/SingleInputTimeRangeField';
import { DateRange } from '@mui/x-date-pickers-pro/models';
import TextField from '@mui/material/TextField';
import dayjs, { Dayjs } from 'dayjs';
import styles from "../../styles/CreateMeetingPage.module.scss";

const CreateMeetingPage = () => {

  const [meetingData, setMeetingData] = useState(null);
  const [title, setTitle] = React.useState('');
  const [value, setValue] = useState<Dayjs | null>(dayjs('2024-08-24'));
  const [time, setTime] = useState<DateRange<Dayjs>>(() => [
    dayjs('2024-08-24T15:30'),
    dayjs('2024-08-24T18:30'),
  ]);
  const [meetingId, setMeetingId] = React.useState('');
  
  const createZoomMeetingRequestBody = () => {
    const startTime = time[0]?.format();

    const defaultDuration = 60;

    let duration = defaultDuration;
    if (time[0] && time[1]) {
      duration = time[1].diff(time[0], 'minute');
    }

    const requestBody = {
      room_name: "Test",
      agenda: title,
      default_password: false,
      duration: duration,
      pre_schedule: false,
      settings: {
        host_video: true,
        participant_video: true,
      },
      start_time: startTime || new Date().toISOString(),
      timezone: "America/Los_Angeles",
      topic: title,
      type: 2,
    };

    return requestBody;
  };

  const handleCreateMeeting = async () => {
    try {
      const response = await fetch('/api/zoom/CreateMeeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createZoomMeetingRequestBody()),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const zoomResponse = await response.json();
      console.log(zoomResponse);
      alert("Zoom meeting created! Please check the console & the icr Zoom account.");
  
      // Re-fetch the meeting data after creation
      const updatedMeetingData = await fetch(`/api/zoom/GetMeeting?id=${zoomResponse.id}`);
      const updatedData = await updatedMeetingData.json();
      setMeetingData(updatedData);  // Update meeting data state
  
    } catch (error) {
      console.error('Error creating Zoom meeting:', error);
    }
  };  

  const handleUpdateMeeting = async () => {
    try {
      const reqBody = { 
        meetingId: meetingId,
        ...createZoomMeetingRequestBody()
      };
  
      const response = await fetch('/api/zoom/UpdateMeeting', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const zoomResponse = await response.json();
      console.log(zoomResponse);
      alert("Zoom meeting updated! Please check the console & the icr Zoom account.");
  
      // Re-fetch the updated meeting data
      const updatedMeetingData = await fetch(`/api/zoom/GetMeeting?id=${meetingId}`);
      const updatedData = await updatedMeetingData.json();
      setMeetingData(updatedData);  // Update meeting data state
  
    } catch (error) {
      console.error('Error updating Zoom meeting:', error);
    }
  };  

  const handleDeleteMeeting = async () => {
    try {
      const url = new URL('/api/zoom/DeleteMeeting', window.location.origin);
      url.searchParams.append('id', meetingId);
  
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const zoomResponse = await response.json();
      console.log(zoomResponse);
      alert("Zoom meeting deleted! Please check the console & the icr Zoom account.");
  
      // Clear the meeting data after deletion
      setMeetingData(null);  // Clear the meeting data state
  
    } catch (error) {
      console.error('Error deleting Zoom meeting:', error);
    }
  };  

  return (
    <div className={styles.base}>
      <h2>Create a meeting</h2>
      <div className={styles.form}>
        <TextField
          id="outlined-controlled"
          label="Title"
          value={title}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setTitle(event.target.value);
          }}
        />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            label="Date"
            value={value}
            onChange={(newValue) => setValue(newValue)}
          />
          <SingleInputTimeRangeField
            label="Time Range"
            value={time}
            onChange={(newValue) => setTime(newValue)}
          />
        </LocalizationProvider>

      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <button className={styles.btn} onClick={handleCreateMeeting}>Create Meeting</button>
        <div>
          <input
            type="text"
            placeholder="Meeting ID"
            value={meetingId}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setMeetingId(event.target.value);
            }}
          />
          <button className={styles.btn} onClick={handleUpdateMeeting}>Update Meeting</button>
          <button className={styles.btn} onClick={handleDeleteMeeting}>Delete Meeting</button>
        </div>
      </div>
    </div>
  );
};

export default CreateMeetingPage;
