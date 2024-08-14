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
  const [title, setTitle] = React.useState('');
  const [value, setValue] = useState<Dayjs | null>(dayjs('2024-04-08'));
  const [time, setTime] = useState<DateRange<Dayjs>>(() => [
    dayjs('2024-04-08T15:30'),
    dayjs('2024-04-08T18:30'),
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
      console.log('Meeting created:', response);
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
      console.log('Meeting updated:', response);
    } catch (error) {
      console.error('Error updating Zoom meeting:', error);
    }
  }


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
        </div>
      </div>
    </div>
  );
};

export default CreateMeetingPage;
