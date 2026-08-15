"use client";

import React, { useState, useEffect, useRef } from 'react';
import RadioGroup from '../ui/inputs/RadioGroup';
import LabeledCheckbox from '../ui/inputs/CheckBox';
import SpinnerInput from '../ui/inputs/SpinnerInput';
import DatePicker from '../ui/pickers/DatePicker';
import Dropdown from '../ui/inputs/Dropdown';
import styles from "./RecurringMeeting.module.scss";

import CheckButton from '../ui/buttons/CheckButton';
import { IRecurrencePattern } from "../../../types/models";
import { convertETToUTC, convertUTCToET, formatETDateString, getETDayOfWeek } from "../../../util/date/timeUtils";


interface RecurringMeetingFormProps {
  onChange: (data: {
    isRecurring: boolean;
    recurrencePattern: IRecurrencePattern | null;
  }) => void;
  startDate?: string;
  initialValue?: {
    isRecurring: boolean;
    recurrencePattern: IRecurrencePattern | null;
  };
  // "wide" narrows the Repeats/monthly-option dropdowns so they don't stretch full-width in
  // wider embedding contexts (e.g. an inline edit panel) -- see MeetingForm's layout prop.
  layout?: "sidebar" | "wide";
}

// Full day name → abbreviated ID used by the day-picker buttons
const fullDayToId: Record<string, string> = {
  Sunday: 'sun', Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed',
  Thursday: 'thu', Friday: 'fri', Saturday: 'sat',
};

// Module-level (not component-body) so these have a stable reference across renders —
// needed for correct useEffect dependency arrays below.
const dayMapping: Record<string, string> = {
  'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
  'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday',
};

const days = [
  { id: 'sun', label: 'S' }, { id: 'mon', label: 'M' }, { id: 'tue', label: 'T' },
  { id: 'wed', label: 'W' }, { id: 'thu', label: 'T' }, { id: 'fri', label: 'F' },
  { id: 'sat', label: 'S' },
];

const ordinals = ["1st", "2nd", "3rd", "4th"];
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function inferEndOption(pattern: IRecurrencePattern | null): string {
  if (pattern?.numberOfOccurrences != null) return 'After';
  if (pattern?.endDate != null) return 'On';
  return 'Never';
}

// Format a Date (or ISO string) to "MM/DD/YYYY". Reads back via ET, not raw UTC getters —
// startDate/endDate are ET-midnight-anchored UTC instants (see etMidnightUTC below).
function toDatePickerString(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date as string);
  if (isNaN(d.getTime())) return "";
  const etDateString = convertUTCToET(d.toISOString()); // "MM/DD/YYYY, hh:mm:ss AM/PM"
  return etDateString.split(',')[0];
}

// Converts "MM/DD/YYYY" into a UTC Date at ET midnight for that day — matching how the
// meeting's own start/end times are built, independent of the browser's local timezone.
function etMidnightUTC(datePickerString: string): Date {
  const match = datePickerString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return new Date(NaN);
  const [, month, day, year] = match;
  return new Date(convertETToUTC(`${year}-${month}-${day}T00:00:00`));
}

// Derives the dropdown options for monthly recurrence from the meeting's start date.
// A 5th weekday is always the last, so we show "last" instead of "5th".
function getMonthlyOptions(startDateStr: string): string[] {
  // startDateStr is the DatePicker's raw "MM/DD/YYYY" value (see NewMeeting/EditMeeting's
  // dateValue), not an ISO instant -- parse via etMidnightUTC (regex-based, same as
  // toDatePickerString's round-trip above), not new Date(string), whose non-ISO MM/DD/YYYY
  // parsing behavior isn't reliably specified across engines.
  const date = etMidnightUTC(startDateStr);
  if (isNaN(date.getTime())) return [];
  const [year, month, day] = formatETDateString(date).split('-').map(Number);
  const dayOfMonth = day;
  const weekdayName = weekdayNames[getETDayOfWeek(date)];
  const nth = Math.ceil(dayOfMonth / 7);
  // Date.UTC(year, month, 0) is the last day of `month` (1-indexed here, so this is
  // deliberately not month - 1) -- same proleptic-Gregorian-calculator use as weekDates.ts.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isLast = dayOfMonth + 7 > daysInMonth;

  const options: string[] = [`Monthly on day ${dayOfMonth}`];
  if (nth <= 4) options.push(`Monthly on the ${ordinals[nth - 1]} ${weekdayName}`);
  if (isLast) options.push(`Monthly on the last ${weekdayName}`);
  return options;
}

function inferMonthlyOption(pattern: IRecurrencePattern): string {
  if (pattern.weekOfMonth === -1) {
    return `Monthly on the last ${(pattern.daysOfWeek ?? [])[0] ?? ""}`;
  }
  if (pattern.weekOfMonth != null) {
    const ordinal = ordinals[pattern.weekOfMonth - 1] ?? `${pattern.weekOfMonth}th`;
    return `Monthly on the ${ordinal} ${(pattern.daysOfWeek ?? [])[0] ?? ""}`;
  }
  if (pattern.dayOfMonth != null) {
    return `Monthly on day ${pattern.dayOfMonth}`;
  }
  return "";
}

const RecurringMeetingForm: React.FC<RecurringMeetingFormProps> = ({
  onChange,
  startDate,
  initialValue,
  layout = "sidebar",
}) => {
  const initPattern = initialValue?.recurrencePattern ?? null;

  const [isRecurring, setIsRecurring] = useState(initialValue?.isRecurring ?? false);
  const [recurrenceType, setRecurrenceType] = useState<string>(initPattern?.type ?? "weekly");
  const [frequency, setFrequency] = useState(initPattern?.interval ?? 1);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    (initPattern?.daysOfWeek ?? []).map(d => fullDayToId[d] ?? d)
  );
  const [monthlyOption, setMonthlyOption] = useState<string>(
    initPattern?.type === "monthly" ? inferMonthlyOption(initPattern) : ""
  );
  const [endOption, setEndOption] = useState(inferEndOption(initPattern));
  const [endDate, setEndDate] = useState<string | undefined>(toDatePickerString(initPattern?.endDate));
  const [occurrences, setOccurrences] = useState(initPattern?.numberOfOccurrences ?? 1);
  const [touched, setTouched] = useState<boolean>(false);
  const isFirstRender = useRef(true);

  // Seed default day when enabling weekly recurrence. Guarded default-seed (only fires
  // when selectedDays is still empty), not a prop mirror, so this stays an effect rather
  // than the render-time-adjustment pattern used elsewhere in this pass.
  useEffect(() => {
    if (isRecurring && recurrenceType === "weekly" && startDate) {
      try {
        // startDate is the DatePicker's raw "MM/DD/YYYY" value -- see getMonthlyOptions'
        // comment on why this goes through etMidnightUTC, not new Date(string).
        const date = etMidnightUTC(startDate);
        if (!isNaN(date.getTime()) && selectedDays.length === 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSelectedDays([days[getETDayOfWeek(date)].id]);
        }
      } catch (error) {
        console.error("Error parsing date:", error);
      }
    }
  }, [isRecurring, recurrenceType, startDate, selectedDays.length]);

  // Seed default monthly option when switching to monthly. Guarded by !monthlyOption, so
  // including monthlyOption below is safe — it can't retrigger itself once set.
  useEffect(() => {
    if (isRecurring && recurrenceType === "monthly" && !monthlyOption && startDate) {
      const options = getMonthlyOptions(startDate);
      if (options.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMonthlyOption(options[0]);
      }
    }
  }, [isRecurring, recurrenceType, startDate, monthlyOption]);

  // Reset monthly option when startDate changes so stale options don't persist.
  // recurrenceType is deliberately excluded from deps: toggling recurrenceType away from
  // and back to "monthly" is already handled by the seed effect above and the Dropdown's
  // own onChange — adding it here would additionally force-reset a user's chosen
  // monthlyOption on every such toggle, not just on a real startDate edit.
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (recurrenceType === "monthly" && startDate) {
      const options = getMonthlyOptions(startDate);
      if (options.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMonthlyOption(options[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  // Resets the whole recurrence sub-form when recurrence is turned off.
  useEffect(() => {
    if (!isRecurring) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFrequency(1);
      setSelectedDays([]);
      setEndOption('Never');
      setEndDate("");
      setOccurrences(1);
    }
  }, [isRecurring]);

  useEffect(() => {
    let recurrencePattern: IRecurrencePattern | null = null;

    if (isRecurring) {
      if (recurrenceType === "monthly") {
        let weekOfMonth: number | null = null;
        let dayOfMonth: number | null = null;
        let daysOfWeek: string[] = [];

        if (monthlyOption.startsWith("Monthly on day ")) {
          dayOfMonth = parseInt(monthlyOption.replace("Monthly on day ", ""), 10);
        } else if (monthlyOption.startsWith("Monthly on the last ")) {
          weekOfMonth = -1;
          daysOfWeek = [monthlyOption.replace("Monthly on the last ", "")];
        } else if (monthlyOption.startsWith("Monthly on the ")) {
          const rest = monthlyOption.replace("Monthly on the ", "");
          const spaceIdx = rest.indexOf(" ");
          weekOfMonth = ordinals.indexOf(rest.slice(0, spaceIdx)) + 1;
          daysOfWeek = [rest.slice(spaceIdx + 1)];
        }

        recurrencePattern = {
          type: "monthly",
          interval: 1,
          startDate: startDate ? etMidnightUTC(startDate) : new Date(),
          firstDayOfWeek: "Sunday",
          daysOfWeek,
          weekOfMonth,
          dayOfMonth,
          endDate: endOption === 'On' && endDate ? etMidnightUTC(endDate) : null,
          numberOfOccurrences: endOption === 'After' ? occurrences : null,
        };
      } else {
        recurrencePattern = {
          type: "weekly",
          interval: frequency,
          startDate: startDate ? etMidnightUTC(startDate) : new Date(),
          firstDayOfWeek: "Sunday",
          daysOfWeek: selectedDays.map(day => dayMapping[day]),
          endDate: endOption === 'On' && endDate ? etMidnightUTC(endDate) : null,
          numberOfOccurrences: endOption === 'After' ? occurrences : null,
        };
      }
    }

    onChange({ isRecurring, recurrencePattern });
  }, [isRecurring, recurrenceType, frequency, selectedDays, monthlyOption, endOption, endDate, occurrences, onChange, startDate]);

  const handleRecurringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsRecurring(e.target.checked);
  };

  const toggleDay = (dayId: string) => {
    setTouched(true);
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((id) => id !== dayId) : [...prev, dayId]
    );
  };

  const handleEndOptionChange = (option: string) => {
    setEndOption(option);
    if (option !== 'On') setEndDate("");
    if (option !== "After") setOccurrences(1);
  };

  const endOptions = ['Never', 'On', 'After'];
  const monthlyOptions = startDate ? getMonthlyOptions(startDate) : [];

  return (
    <div className={styles.container}>
      <div>
        <LabeledCheckbox
          label={`This meeting is recurring`}
          checked={isRecurring}
          onChange={handleRecurringChange}
          color="#848484"
          uncheckedBg="#fff"
          compact={layout === "sidebar"}
        />
      </div>

      {isRecurring && (
        <div>
          <div className={styles.isRecurring}>
            <div className={layout === "wide" ? styles.compactField : undefined}>
              <Dropdown
                label="Repeats"
                value={recurrenceType === "monthly" ? "Monthly" : "Weekly"}
                isVisible={true}
                elements={['Weekly', 'Monthly']}
                name="Select frequency"
                onChange={(val) => {
                  const type = val.toLowerCase();
                  setRecurrenceType(type);
                  if (type === "monthly" && startDate && !monthlyOption) {
                    const opts = getMonthlyOptions(startDate);
                    if (opts.length > 0) setMonthlyOption(opts[0]);
                  }
                }}
                compact={layout === "sidebar"}
              />
            </div>

            {recurrenceType === "weekly" && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px' }}>
                  <label style={{ marginRight: '5px' }}>Every</label>
                  <SpinnerInput
                    value={frequency}
                    min={1}
                    step={1}
                    onChange={setFrequency}
                  />
                  <label style={{ marginLeft: '5px' }}>week(s)</label>
                </div>

                {(!frequency || frequency < 1) && (
                  <div className={styles['error-message']}>
                    Please specify a number of weeks.
                  </div>
                )}

                <div className={styles.dayButtons}>
                  <label style={{ marginRight: '5px' }}>On</label>
                  {days.map((day) => (
                    <CheckButton
                      key={day.id}
                      label={day.label}
                      checked={selectedDays.includes(day.id)}
                      onClick={() => toggleDay(day.id)}
                      compact={layout === "sidebar"}
                    />
                  ))}
                </div>

                {touched && selectedDays.length === 0 && (
                  <div className={styles['error-message']}>
                    Please select at least one day.
                  </div>
                )}
              </>
            )}

            {recurrenceType === "monthly" && (
              <div className={layout === "wide" ? styles.compactField : undefined}>
                <Dropdown
                  key={startDate}
                  label=""
                  value={monthlyOption}
                  isVisible={true}
                  elements={monthlyOptions}
                  name="Select recurrence"
                  onChange={setMonthlyOption}
                  compact={layout === "sidebar"}
                />
              </div>
            )}

            <RadioGroup
              label="Ends"
              options={endOptions}
              selectedOption={endOption}
              onChange={handleEndOptionChange}
              name="recurrence-end"
              optionContent={{
                On: (
                  <DatePicker
                    label={""}
                    value={endDate}
                    onChange={(val) => setEndDate(val)}
                    compact={layout === "sidebar"}
                  />
                ),
                After: (
                  <div className={styles['spinner-group']}>
                    <div className={styles['spinner-container']}>
                      <SpinnerInput
                        value={occurrences}
                        min={1}
                        step={1}
                        onChange={setOccurrences}
                      />
                      <label style={{ marginLeft: '5px' }}>occurrence(s)</label>
                    </div>
                    {(!occurrences || occurrences < 1) && (
                      <div className={styles['error-message']}>
                        Please enter at least one occurrence.
                      </div>
                    )}
                  </div>
                ),
              }}
            />
          </div>
          <div className={styles.separator}></div>
        </div>
      )}
    </div>
  );
};

export default RecurringMeetingForm;
