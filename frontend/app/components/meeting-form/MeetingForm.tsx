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
  // Discards the form -- the caller owns the unsaved-changes confirmation, since only it
  // knows what closing the panel means in its host (sidebar, mobile sheet, inline card).
  onCancel: () => void;
  buttonText: string
  isSubmitting?: boolean
  // Cross-field start/end error, and the non-error note shown for an accepted overnight
  // range. Rendered in one always-present line under the time row so that showing or
  // clearing either can't shift every control below it.
  timeError?: string;
  timeNote?: string;
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
  // One line of plain-language context under the caption -- for fields whose behavior isn't
  // obvious from the label alone (e.g. what "Automatic assignment" does). Kept short by
  // convention; not a substitute for FormValidationBanner's error messaging.
  hint?: string;
  children: React.ReactNode;
}> = ({ caption, htmlFor, required = false, asGroup = false, className, hint, children }) => {
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
      {hint && <span className={styles.fieldHint}>{hint}</span>}
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
  onCancel,
  buttonText,
  isSubmitting = false,
  layout = "sidebar",
  timeError,
  timeNote,
}) => {
  const containerClassName = `${styles.newMeetingSidebar} ${layout === "wide" ? styles.wide : ""}`.trim();
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  // Always rendered (never conditionally mounted) so its height stays reserved whether or
  // not there's currently something to say.
  const timeMessage = (
    <span
      className={`${styles.fieldMessage} ${timeError ? styles.fieldMessageError : ""}`.trim()}
      role={timeError ? "alert" : undefined}
    >
      {timeError ?? timeNote ?? " "}
    </span>
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleMeetingSubmit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    // A textarea's Enter is a newline and never submits natively; an open Dropdown's Enter
    // picks the focused option (see ui/inputs/Dropdown.tsx). Everything else keeps the
    // browser's own implicit submission from a text field. Deliberately not keyed off the
    // trigger's aria-expanded: preventing default there would also swallow the Enter that
    // closes the dropdown, and that trigger is a type="button" that can't submit anyway.
    if (target.closest('[role="listbox"]')) {
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
          hint="Hybrid needs both a physical Room and a Zoom Room."
          className={`${styles.meetingButtons} ${styles.fieldFullWidth}`}
        >
          {modeTypeButtons}
        </Field>
        {layout === "wide" ? (
          <div className={`${styles.dummyComponent} ${styles.fieldFullWidth} ${styles.dateTimeRow}`}>
            <Field caption="Date" htmlFor={fieldId("date")} required>
              {withFieldProps(DatePicker, { id: fieldId("date"), required: true, "aria-required": true })}
            </Field>
            <Field caption="Time" asGroup required>
              {TimePicker}
              {timeMessage}
            </Field>
          </div>
        ) : (
          <>
            <Field caption="Date" htmlFor={fieldId("date")} required className={styles.dummyComponent}>
              {withFieldProps(DatePicker, { id: fieldId("date"), required: true, "aria-required": true })}
            </Field>
            <Field caption="Time" asGroup required className={styles.dummyComponent}>
              {TimePicker}
              {timeMessage}
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
        <Field
          caption="Zoom host"
          asGroup
          hint="Automatic assignment picks the least-busy Zoom account from the org's pool."
          className={styles.dummyComponent}
        >
          {zoomHostDropdown}
        </Field>
        )}
        <Field
          caption="Group contact email"
          htmlFor={fieldId("email")}
          required
          hint="The group's point of contact, shown to admins only -- not used for invites or notifications."
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
        <div className={`${styles.formActions} ${styles.fieldFullWidth}`}>
          <button
            type="button"
            className={styles.cancelMeetingButton}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.createMeetingButton}
            disabled={isSubmitting}
          >
            {buttonText}
          </button>
        </div>
      </form>
  );
};
