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
  groupId: string;
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
  onCreateMeeting,
  groupId
}) => {
  const handleCreateMeeting = async () => {
    try {
      await onCreateMeeting();

      const eventData = {
        title: meetingTitleTextField.props.value,
        description: descriptionTextField.props.value,
        startDateTime: new Date(DatePicker.props.value).toISOString(),
        endDateTime: new Date(TimePicker.props.value).toISOString(),
        groupId: groupId,
        attendees: [{ email: emailTextField.props.value }]
      };

      const response = await fetch('/api/microsoft/calendars/createEvent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to create meeting:',errorData);
        alert('Meeting failed to add to calendar.');
      }
    } catch (error) {
      console.error('Error creating meeting:', error);
      alert('Error creating meeting.');
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
      <button className={styles.createMeetingButton} onClick={handleCreateMeeting}>Create Meeting</button>
    </div>
  );
};

export default NewMeetingSidebar;