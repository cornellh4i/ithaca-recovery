import React, { useState } from 'react';
import styles from "../../../../styles/components/organisms/NewMeeting.module.scss";
import { IMeeting } from '../../../../util/models';

interface NewMeetingSidebarProps {
  meetingTitleTextField: React.ReactElement;
  DatePicker: React.ReactElement;
  TimePicker: React.ReactElement;
  RadioGroup: React.ReactElement;
  roomSelectionDropdown: React.ReactElement;
  meetingTypeDropdown: React.ReactElement;
  zoomAccountDropdown: React.ReactElement;
  emailTextField: React.ReactElement;
  uploadPandaDocsForm: React.ReactElement;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({
  meetingTitleTextField,
  DatePicker,
  TimePicker,
  RadioGroup,
  roomSelectionDropdown,
  meetingTypeDropdown,
  zoomAccountDropdown,
  emailTextField,
  uploadPandaDocsForm,
}) => {

  const [meetingTitle, setMeetingTitle] = useState<string>('');
  const [startDateTime, setStartDateTime] = useState<Date | null>(null);
  const [endDateTime, setEndDateTime] = useState<Date | null>(null);
  const [meetingType, setMeetingType] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [zoomAccount, setZoomAccount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [pandaDoc, setPandaDoc] = useState<File | null>(null);

  const createMeeting = async () => {
    try {
      const newMeeting: IMeeting = {
        title: meetingTitle,
        mid: `${Math.floor(Math.random() * 100000) + 1}`,
        description: description,
        creator: 'Creator',
        group: 'Group',
        startDateTime: startDateTime || new Date(),
        endDateTime: endDateTime || new Date(),
        zoomAccount: zoomAccount, //zoomLink, zid, zoomAccount - note these are optional
        type: meetingType,
        room: room,
        pandaDoc: pandaDoc, //this is optional
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

  return (
    <div className={styles.newMeetingSidebar}>
      {/* Bind form fields to state */}
      <div className={styles.dummyComponent}>
        {React.cloneElement(meetingTitleTextField, {
          value: meetingTitle,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMeetingTitle(e.target.value),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(DatePicker, {
          value: startDateTime,
          onChange: (date: Date) => setStartDateTime(date),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(TimePicker, {
          value: endDateTime,
          onChange: (time: Date) => setEndDateTime(time),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(RadioGroup, {
          value: meetingType,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMeetingType(e.target.value),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(roomSelectionDropdown, {
          value: room,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setRoom(e.target.value),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(meetingTypeDropdown, {
          value: meetingType,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setMeetingType(e.target.value),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(zoomAccountDropdown, {
          value: zoomAccount,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setZoomAccount(e.target.value),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(emailTextField, {
          value: description,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value),
        })}
      </div>
      <div className={styles.dummyComponent}>
        {React.cloneElement(uploadPandaDocsForm, {
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPandaDoc(e.target.files ? e.target.files[0] : null),
        })}
      </div>
      <button className={styles.createMeetingButton} onClick={createMeeting}>
        Create Meeting
      </button>
    </div>
  );
};

export default NewMeetingSidebar;

//-----------------------------------------------------------------------------

/*
const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({
meetingTitleTextField,
DatePicker,
TimePicker,
RadioGroup,
roomSelectionDropdown,
meetingTypeDropdown,
zoomAccountDropdown,
emailTextField,
uploadPandaDocsForm,
}) => {
const [meetingTitle, setMeetingTitle] = useState('');
const [startDateTime, setStartDateTime] = useState<Date | null>(null);
const [endDateTime, setEndDateTime] = useState<Date | null>(null);
const [room, setRoom] = useState('');
const [meetingType, setMeetingType] = useState('');
const [zoomAccount, setZoomAccount] = useState('');
const [pandaDoc, setPandaDoc] = useState<File | null>(null);
const [description, setDescription] = useState('');

// Handle form submission
const handleCreateMeeting = async () => {
  const newMeeting: IMeeting = {
    title: meetingTitle,
    mid: `${Math.floor(Math.random() * 100000) + 1}`,
    description: description,
    creator: 'Creator',
    group: 'Group',
    startDateTime: startDateTime || new Date(),
    endDateTime: endDateTime || new Date(),
    zoomAccount: zoomAccount,
    type: meetingType,
    room: room,
    pandaDoc: pandaDoc,
  };

  // Call the createMeeting function with the form data
  await createMeeting(newMeeting);
};

return (
  <div className={styles.newMeetingSidebar}>
    {/* Bind form fields to state 
    <div className={styles.dummyComponent}>
      {React.cloneElement(meetingTitleTextField, {
        value: meetingTitle,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMeetingTitle(e.target.value),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(DatePicker, {
        value: startDateTime,
        onChange: (date: Date) => setStartDateTime(date),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(TimePicker, {
        value: endDateTime,
        onChange: (time: Date) => setEndDateTime(time),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(RadioGroup, {
        value: meetingType,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMeetingType(e.target.value),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(roomSelectionDropdown, {
        value: room,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setRoom(e.target.value),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(meetingTypeDropdown, {
        value: meetingType,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setMeetingType(e.target.value),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(zoomAccountDropdown, {
        value: zoomAccount,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setZoomAccount(e.target.value),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(emailTextField, {
        value: description,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value),
      })}
    </div>
    <div className={styles.dummyComponent}>
      {React.cloneElement(uploadPandaDocsForm, {
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPandaDoc(e.target.files ? e.target.files[0] : null),
      })}
    </div>
    <button className={styles.createMeetingButton} onClick={handleCreateMeeting}>
      Create Meeting
    </button>
  </div>
);
};




return (
  <div className={styles.newMeetingSidebar}>
    <div className={styles.dummyComponent}>
      {meetingTitleTextField}
    </div>
    <div className={styles.dummyComponent}>
      {DatePicker}
    </div>
    <div className={styles.dummyComponent}>
      {TimePicker}
    </div>
    <div className={styles.dummyComponent}>
      {RadioGroup}
    </div>
    <div className={styles.dummyComponent}>
      {roomSelectionDropdown}
    </div>
    <div className={styles.dummyComponent}>
      {meetingTypeDropdown}
    </div>
    <div className={styles.dummyComponent}>
      {zoomAccountDropdown}
    </div>
    <div className={styles.dummyComponent}>
      {emailTextField}
    </div>
    <div className={styles.dummyComponent}>
      {uploadPandaDocsForm}
    </div>
    <button className={styles.createMeetingButton}>Create Meeting</button>
  </div>
);
*/