import React from 'react';
import styles from "../../../../styles/organisms/NewMeeting.module.scss";

interface NewMeetingSidebarProps {
  checkbox: React.ReactElement;
}

const NewMeetingSidebar: React.FC<NewMeetingSidebarProps> = ({ checkbox }) => {
  return (
    <div className={styles.newMeetingSidebar}>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <div className={styles.dummyComponent}>
        {checkbox}
      </div>
      <button className={styles.createMeetingButton}>Create Meeting</button>
    </div>
  );
};

export default NewMeetingSidebar;
