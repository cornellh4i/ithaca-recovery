// General component for EditMeeting and NewMeeting

import React, { useState } from 'react';
import styles from "../../../styles/components/organisms/MeetingForm.module.scss";

export interface MeetingFormProps {
  meetingTitleTextField: React.ReactElement;
  modeTypeButtons: React.ReactElement;
  selectedMode: string;
  DatePicker: React.ReactElement;
  TimePicker: React.ReactElement;
  RecurringMeeting: React.ReactElement;
  roomSelectionDropdown: React.ReactElement;
  meetingTypeDropdown: React.ReactElement;
  zoomAccountDropdown: React.ReactElement;
  emailTextField: React.ReactElement;
  descriptionTextField: React.ReactElement;
  handleMeetingSubmit: () => Promise<void>;
  buttonText: string
}

export const MeetingForm: React.FC<MeetingFormProps> = ({
  meetingTitleTextField,
  modeTypeButtons,
  selectedMode,
  DatePicker,
  TimePicker,
  RecurringMeeting,
  roomSelectionDropdown,
  meetingTypeDropdown,
  zoomAccountDropdown,
  emailTextField,
  descriptionTextField,
  handleMeetingSubmit,
  buttonText
}) => {

  return (
    <div className={styles.newMeetingSidebar}>
        <div className={styles.dummyComponent}>
          {meetingTitleTextField}
        </div>
        <div className={styles.meetingButtons}>
          {modeTypeButtons}
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
        {(selectedMode === "Hybrid" || selectedMode === "In Person") && (
        <div className={styles.dummyComponent}>
          {roomSelectionDropdown}
        </div>
        )}
        <div className={styles.dummyComponent}>
          {meetingTypeDropdown}
        </div>
        {(selectedMode === "Hybrid" || selectedMode === "Remote") && (
        <div className={styles.dummyComponent}>
          {zoomAccountDropdown}
        </div>
        )}
        <div className={styles.dummyComponent}>
          {emailTextField}
        </div>
        <div className={styles.dummyComponent}>
          {descriptionTextField}
        </div>
        <button className={styles.createMeetingButton} onClick={handleMeetingSubmit}>{buttonText}</button>
      </div>
  );
};