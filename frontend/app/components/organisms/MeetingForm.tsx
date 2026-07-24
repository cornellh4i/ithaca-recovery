// General component for EditMeeting and NewMeeting

import React from 'react';
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
  zoomRoomDropdown: React.ReactElement;
  emailTextField: React.ReactElement;
  descriptionTextField: React.ReactElement;
  handleMeetingSubmit: () => Promise<void>;
  buttonText: string
  isSubmitting?: boolean
  // "wide" is a two-column layout for wider embedding contexts (e.g. an inline edit panel),
  // vs. the default single-column "sidebar" layout used in the Main Calendar sidebar.
  layout?: "sidebar" | "wide";
}

// Wraps a field slot with an uppercase caption above it, in addition to that field's own
// inline icon -- both together, matching the design mockup this form is based on.
const Field: React.FC<{ caption?: string; className?: string; children: React.ReactNode }> = ({
  caption,
  className,
  children,
}) => (
  <div className={className ?? styles.fieldSlot}>
    {caption && <span className={styles.fieldCaption}>{caption}</span>}
    {children}
  </div>
);

export const MeetingForm: React.FC<MeetingFormProps> = ({
  meetingTitleTextField,
  modeTypeButtons,
  selectedMode,
  DatePicker,
  TimePicker,
  RecurringMeeting,
  roomSelectionDropdown,
  meetingTypeDropdown,
  zoomRoomDropdown,
  emailTextField,
  descriptionTextField,
  handleMeetingSubmit,
  buttonText,
  isSubmitting = false,
  layout = "sidebar",
}) => {
  const containerClassName = `${styles.newMeetingSidebar} ${layout === "wide" ? styles.wide : ""}`.trim();

  return (
    <div className={containerClassName}>
        <Field caption="Meeting name" className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {meetingTitleTextField}
        </Field>
        <div className={`${styles.meetingButtons} ${styles.fieldFullWidth}`}>
          <span className={styles.fieldCaption}>Mode</span>
          {modeTypeButtons}
        </div>
        {layout === "wide" ? (
          <div className={`${styles.dummyComponent} ${styles.fieldFullWidth} ${styles.dateTimeRow}`}>
            <Field caption="Date">{DatePicker}</Field>
            <Field caption="Time">{TimePicker}</Field>
          </div>
        ) : (
          <>
            <Field caption="Date" className={styles.dummyComponent}>
              {DatePicker}
            </Field>
            <Field caption="Time" className={styles.dummyComponent}>
              {TimePicker}
            </Field>
          </>
        )}
        <div className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {RecurringMeeting}
        </div>
        <Field caption="Categories" className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {meetingTypeDropdown}
        </Field>
        {(selectedMode === "Hybrid" || selectedMode === "In Person") && (
        <Field caption="Room" className={styles.dummyComponent}>
          {roomSelectionDropdown}
        </Field>
        )}
        {(selectedMode === "Hybrid" || selectedMode === "Remote") && (
        <Field caption="Zoom room" className={styles.dummyComponent}>
          {zoomRoomDropdown}
        </Field>
        )}
        <Field caption="Email" className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {emailTextField}
        </Field>
        <Field caption="Description" className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {descriptionTextField}
        </Field>
        <button className={`${styles.createMeetingButton} ${styles.fieldFullWidth}`} onClick={handleMeetingSubmit} disabled={isSubmitting}>{buttonText}</button>
      </div>
  );
};