import React from 'react';
import TextButton from "../../atoms/textbutton"
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
  onCreateMeeting: () => Promise<void>;
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
      <button className={styles.createMeetingButton} onClick={onCreateMeeting}>Create Meeting</button>
    </div>
  );
};

export default NewMeetingSidebar;