// General component for EditMeeting and NewMeeting

import React, { useId } from 'react';
import styles from "./MeetingForm.module.scss";

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
  // Self-contained: renders the dropdown, its "Check host availability" action, and any
  // busy-host warning together (see molecules/ZoomHostField.tsx) -- not just a bare dropdown
  // like the other *Dropdown props.
  zoomHostDropdown: React.ReactElement;
  emailTextField: React.ReactElement;
  descriptionTextField: React.ReactElement;
  handleMeetingSubmit: () => Promise<void>;
  buttonText: string
  isSubmitting?: boolean
  // "wide" is a two-column layout for wider embedding contexts (e.g. an inline edit panel),
  // vs. the default single-column "sidebar" layout used in the Main Calendar sidebar.
  layout?: "sidebar" | "wide";
}

// Field slots receive their control as an element prop, so the <label> and the control it
// names are assembled in different components -- this injects the id (plus the required
// attributes) the label points at, rather than making every call site thread ids through.
type InjectableProps = { id?: string; required?: boolean; "aria-required"?: boolean };
function withFieldProps(element: React.ReactElement, props: InjectableProps): React.ReactElement {
  return React.cloneElement(element as React.ReactElement<InjectableProps>, props);
}

// Wraps a field slot with an uppercase caption above it, in addition to that field's own
// inline icon -- both together, matching the design mockup this form is based on. The caption
// is the control's real <label> whenever the slot holds a single control (`htmlFor`); slots
// holding several controls (the mode buttons, the category checkboxes) name themselves as a
// group instead, since a <label> can only point at one control.
const Field: React.FC<{
  caption?: string;
  htmlFor?: string;
  required?: boolean;
  asGroup?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ caption, htmlFor, required = false, asGroup = false, className, children }) => {
  const captionId = useId();
  const marker = required ? <span className={styles.requiredMark} aria-hidden="true">*</span> : null;

  const captionNode = caption
    ? htmlFor
      ? <label className={styles.fieldCaption} htmlFor={htmlFor}>{caption}{marker}</label>
      : <span className={styles.fieldCaption} id={asGroup ? captionId : undefined}>{caption}{marker}</span>
    : null;

  return (
    <div
      className={className ?? styles.fieldSlot}
      role={asGroup ? "group" : undefined}
      aria-labelledby={asGroup && caption ? captionId : undefined}
    >
      {captionNode}
      {children}
    </div>
  );
};

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
  zoomHostDropdown,
  emailTextField,
  descriptionTextField,
  handleMeetingSubmit,
  buttonText,
  isSubmitting = false,
  layout = "sidebar",
}) => {
  const containerClassName = `${styles.newMeetingSidebar} ${layout === "wide" ? styles.wide : ""}`.trim();
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleMeetingSubmit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    // A textarea's Enter is a newline and never submits natively; an open Dropdown's Enter
    // picks the focused option (see ui/inputs/Dropdown.tsx). Everything else keeps the
    // browser's own implicit submission from a text field.
    if (target.closest('[role="listbox"], [aria-expanded="true"]')) {
      event.preventDefault();
    }
  };

  return (
    // noValidate: this form's own validation (hooks/useMeetingForm.ts) owns rejection and
    // messaging -- native constraint bubbles would pre-empt the validation banner while
    // saying less about what's wrong. The `required` attributes stay for assistive tech.
    <form className={containerClassName} onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
        <p className={`${styles.requiredLegend} ${styles.fieldFullWidth}`}>
          <span className={styles.requiredMark} aria-hidden="true">*</span> Required
        </p>
        <Field
          caption="Meeting name"
          htmlFor={fieldId("title")}
          required
          className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}
        >
          {withFieldProps(meetingTitleTextField, { id: fieldId("title"), required: true, "aria-required": true })}
        </Field>
        <Field
          caption="Mode"
          asGroup
          required
          className={`${styles.meetingButtons} ${styles.fieldFullWidth}`}
        >
          {modeTypeButtons}
        </Field>
        {layout === "wide" ? (
          <div className={`${styles.dummyComponent} ${styles.fieldFullWidth} ${styles.dateTimeRow}`}>
            <Field caption="Date" htmlFor={fieldId("date")} required>
              {withFieldProps(DatePicker, { id: fieldId("date"), required: true, "aria-required": true })}
            </Field>
            <Field caption="Time" asGroup required>{TimePicker}</Field>
          </div>
        ) : (
          <>
            <Field caption="Date" htmlFor={fieldId("date")} required className={styles.dummyComponent}>
              {withFieldProps(DatePicker, { id: fieldId("date"), required: true, "aria-required": true })}
            </Field>
            <Field caption="Time" asGroup required className={styles.dummyComponent}>
              {TimePicker}
            </Field>
          </>
        )}
        <div className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {RecurringMeeting}
        </div>
        <Field caption="Categories" asGroup required className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}>
          {meetingTypeDropdown}
        </Field>
        {(selectedMode === "Hybrid" || selectedMode === "In Person") && (
        <Field caption="Room" asGroup required className={styles.dummyComponent}>
          {roomSelectionDropdown}
        </Field>
        )}
        {selectedMode === "Hybrid" && (
        <Field caption="Zoom room" asGroup required className={styles.dummyComponent}>
          {zoomRoomDropdown}
        </Field>
        )}
        {(selectedMode === "Hybrid" || selectedMode === "Remote") && (
        <Field caption="Zoom host" asGroup className={styles.dummyComponent}>
          {zoomHostDropdown}
        </Field>
        )}
        <Field
          caption="Group contact email"
          htmlFor={fieldId("email")}
          required
          className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}
        >
          {withFieldProps(emailTextField, { id: fieldId("email"), required: true, "aria-required": true })}
        </Field>
        <Field
          caption="Description"
          htmlFor={fieldId("description")}
          className={`${styles.dummyComponent} ${styles.fieldFullWidth}`}
        >
          {withFieldProps(descriptionTextField, { id: fieldId("description") })}
        </Field>
        <button
          type="submit"
          className={`${styles.createMeetingButton} ${styles.fieldFullWidth}`}
          disabled={isSubmitting}
        >
          {buttonText}
        </button>
      </form>
  );
};
