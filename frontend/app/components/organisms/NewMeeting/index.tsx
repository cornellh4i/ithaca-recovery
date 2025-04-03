import React, { useState } from 'react';
import TextButton from "../../atoms/textbutton"
import { convertESTToUTC, convertUTCToEST } from "../../../../util/timeUtils";
import styles from "../../../../styles/components/organisms/NewMeeting.module.scss";

interface NewMeetingSidebarProps {
  meetingTitleTextField: React.ReactElement;
  DatePicker: React.ReactElement;
  TimePicker: React.ReactElement;
  RecurringMeeting: React.ReactElement;
  roomSelectionDropdown: React.ReactElement;
  meetingTypeDropdown: React.ReactElement;
  zoomAccountDropdown: React.ReactElement;
  emailTextField: React.ReactElement;
  uploadPandaDocsForm: React.ReactElement;
  descriptionTextField: React.ReactElement;
  onCreateMeeting: (meetingData: any) => Promise<void>;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({
  meetingTitleTextField,
  DatePicker,
  TimePicker,
  RecurringMeeting,
  roomSelectionDropdown,
  meetingTypeDropdown,
  zoomAccountDropdown,
  emailTextField,
  uploadPandaDocsForm,
  descriptionTextField,
  onCreateMeeting
}) => {
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  const handleCreateMeeting = async () => {
    if (startTime && endTime) {
      const utcStartTime = convertESTToUTC(startTime.toISOString());
      const utcEndTime = convertESTToUTC(endTime.toISOString());

      const meetingData = {
        title: "Meeting Title",
        startTime: utcStartTime,
        endTime: utcEndTime,
      };

      try {
        await onCreateMeeting(meetingData);
      } catch (error) {
        console.error("Failed to create meeting:", error);
      }
    } else {
      console.error("Start time or end time is not set.");
    }
  };

  return (
    <div className={styles.newMeetingSidebar}>
      <div className={styles.dummyComponent}>
        {meetingTitleTextField}
      </div>
      <div className={styles.meetingButtons}>
        <button className={styles.button} autoFocus>Hybrid</button>
        <button className={styles.button}>In Person</button>
        <button className={styles.button}>Remote</button>
      </div>
      <div className={styles.dummyComponent}>
        {DatePicker}
      </div>
      <div className={styles.dummyComponent}>
        {TimePicker}
      </div>
      <div className={styles.dummyComponent}>
        {RecurringMeeting}
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
      <div className={styles.dummyComponent}>
        {descriptionTextField}
      </div>
      <button className={styles.createMeetingButton} onClick={handleCreateMeeting}>
        Create Meeting
      </button>
    </div>
  );
};

export default NewMeetingSidebar;