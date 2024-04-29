"use client";
import React, { useState } from "react";
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { SingleInputTimeRangeField } from '@mui/x-date-pickers-pro/SingleInputTimeRangeField';
import { DateRange } from '@mui/x-date-pickers-pro/models';
import TextField from '@mui/material/TextField';
import dayjs, { Dayjs } from 'dayjs';
import styles from "../../styles/CreateMeetingPage.module.scss"


const CreateMeetingPage = () => {
  const [title, setTitle] = React.useState('');
  const [value, setValue] = useState<Dayjs | null>(dayjs('2024-04-08'));
  const [time, setTime] = useState<DateRange<Dayjs>>(() => [
    dayjs('2024-04-08T15:30'),
    dayjs('2024-04-08T18:30'),
  ]);

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

  const handleClick = async () => {
    try {
      const newMeeting = {
        title: title,
        mid: new Date().toISOString(),
        description: 'Meeting Description',
        creator: 'creator',
        group: 'Group',
        startDateTime: time[0]?.toISOString(),
        endDateTime: time[1]?.toISOString(),
        zoomAccount: 'Zoom Account',
        zoomLink: 'URL:ZOOM ACCOUTN',
        zid: 'gdjjedhheagjhas',
        type: 'online',
        room: 'Room 135'
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
        console.error('HTTP error during update:', response.statusText);
      }


    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClickDay = async () => {
    try {
      const currentDate = new Date('2024-04-14');
      const response = await fetch('/api/retrieve/meetings/${interval}?date=${encodeURIComponent(currentDate)}', {
        method: 'GET',
      });
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClickMonth = async () => {
    try {
      const startDate = new Date('2024-04-01');
      const endDate = new Date('2024-04-30');
      const currentDate = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
      const response = await fetch('/api/retrieve/meeting/Month', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: currentDate.toISOString() })
      });
      const data = await response.json();
      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClickWeek = async () => {
    try {
      const startDate = new Date('2024-04-14');
      const endDate = new Date('2024-04-20');
      const currentDate = new Date();
      const response = await fetch('/api/retrieve/meeting/Week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate: startDate.toISOString(), endDate: endDate.toISOString() })
      });
      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleCreateMeeting = async () => {
    try {
      const response = await fetch('/api/zoom/CreateMeeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(handleClick()),
      });
      console.log('Meeting created:', response);
    } catch (error) {
      console.error('Error creating Zoom meeting:', error);
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
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <button className={styles.btn} onClick={handleButtonClickDay}>Day</button>
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <button className={styles.btn} onClick={handleButtonClickMonth}>Month</button>
      </div>
      <div className={styles.section + ' ' + styles.meetings}>
        <button className={styles.btn} onClick={handleButtonClickWeek}>Week</button>
      </div>
    </div>
  );
};


export default CreateMeetingPage;
