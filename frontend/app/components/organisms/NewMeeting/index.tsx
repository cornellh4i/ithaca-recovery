import React from 'react';
import styles from "../../../../styles/organisms/NewMeeting.module.scss";

interface NewMeetingSidebarProps {
  TextField: React.ReactElement;
  DatePicker: React.ReactElement;
  TimePicker: React.ReactElement;
  RadioGroup: React.ReactElement;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({ TextField, DatePicker, TimePicker, RadioGroup }) => {
  return (
    <div className={styles.newMeetingSidebar}>
      <div className={styles.dummyComponent}>
        {TextField}
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
      <button className={styles.createMeetingButton}>Create Meeting</button>
    </div>
  );
};

export default NewMeetingSidebar;
