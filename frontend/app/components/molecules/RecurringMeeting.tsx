"use client";

import React, { useState, useEffect, useRef } from 'react';
import RadioGroup from '../atoms/RadioGroup';
import LabeledCheckbox from '../atoms/checkbox';
import SpinnerInput from '../atoms/SpinnerInput';
import DatePicker from '../atoms/DatePicker';
import Dropdown from '../atoms/dropdown';
import styles from "../../../styles/components/molecules/RecurringMeeting.module.scss";

import CheckButton from '../atoms/CheckButton';
import { IRecurrencePattern } from "../../../util/models";
import { convertETToUTC } from "../../../util/timeUtils";


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
}

// Full day name → abbreviated ID used by the day-picker buttons
const fullDayToId: Record<string, string> = {
  Sunday: 'sun', Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed',
  Thursday: 'thu', Friday: 'fri', Saturday: 'sat',
};

const ordinals = ["1st", "2nd", "3rd", "4th"];
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function inferEndOption(pattern: IRecurrencePattern | null): string {
  if (pattern?.numberOfOccurrences != null) return 'After';
  if (pattern?.endDate != null) return 'On';
  return 'Never';
}

// Format a Date (or ISO string) to "MM/DD/YYYY" for the DatePicker. Formats
// in ET (not raw UTC getters) so the displayed day is correct regardless of
// what time of day the underlying timestamp carries — e.g. an endDate stored
// at 23:59:59 ET would otherwise read back as the following day via UTC getters.
function toDatePickerString(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date as string);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Parses a DatePicker "MM/DD/YYYY" value as 23:59:59 ET on that calendar date
// via convertETToUTC, so the end date is inclusive of its full day even
// against a naive instant comparison. new Date("MM/DD/YYYY") parses in the
// browser's local timezone, which can roll the date back a day once read back
// in ET for browsers ahead of ET (e.g. UTC, Europe).
function parseETDatePickerValue(value: string): Date {
  const [month, day, year] = value.split('/');
  return new Date(convertETToUTC(`${year}-${month}-${day}T23:59:59`));
}

// Derives the dropdown options for monthly recurrence from the meeting's start date.
// A 5th weekday is always the last, so we show "last" instead of "5th".
function getMonthlyOptions(startDateStr: string): string[] {
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) return [];
  const dayOfMonth = date.getDate();
  const weekdayName = weekdayNames[date.getDay()];
  const nth = Math.ceil(dayOfMonth / 7);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
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

  const dayMapping: Record<string, string> = {
    'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
    'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday',
  };

  const days = [
    { id: 'sun', label: 'S' }, { id: 'mon', label: 'M' }, { id: 'tue', label: 'T' },
    { id: 'wed', label: 'W' }, { id: 'thu', label: 'T' }, { id: 'fri', label: 'F' },
    { id: 'sat', label: 'S' },
  ];

  // Seed default day when enabling weekly recurrence
  useEffect(() => {
    if (isRecurring && recurrenceType === "weekly" && startDate) {
      try {
        const date = new Date(startDate);
        if (!isNaN(date.getTime()) && selectedDays.length === 0) {
          setSelectedDays([days[date.getDay()].id]);
        }
      } catch (error) {
        console.error("Error parsing date:", error);
      }
    }
  }, [isRecurring, recurrenceType, startDate]);

  // Seed default monthly option when switching to monthly
  useEffect(() => {
    if (isRecurring && recurrenceType === "monthly" && !monthlyOption && startDate) {
      const options = getMonthlyOptions(startDate);
      if (options.length > 0) setMonthlyOption(options[0]);
    }
  }, [isRecurring, recurrenceType, startDate]);

  // Reset monthly option when startDate changes so stale options don't persist
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (recurrenceType === "monthly" && startDate) {
      const options = getMonthlyOptions(startDate);
      if (options.length > 0) setMonthlyOption(options[0]);
    }
  }, [startDate]);

  useEffect(() => {
    if (!isRecurring) {
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
        let daysOfWeek: string[] = []; // For monthly we only have one day of week chosen

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
          startDate: startDate ? new Date(startDate) : new Date(),
          firstDayOfWeek: "Sunday",
          daysOfWeek,
          weekOfMonth,
          dayOfMonth,
          endDate: endOption === 'On' && endDate ? parseETDatePickerValue(endDate) : null,
          numberOfOccurrences: endOption === 'After' ? occurrences : null,
        };
      } else {
        recurrencePattern = {
          type: "weekly",
          interval: frequency,
          startDate: startDate ? new Date(startDate) : new Date(),
          firstDayOfWeek: "Sunday",
          daysOfWeek: selectedDays.map(day => dayMapping[day]),
          endDate: endOption === 'On' && endDate ? parseETDatePickerValue(endDate) : null,
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
        />
      </div>

      {isRecurring && (
        <div>
          <div className={styles.isRecurring}>
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
            />

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
              <Dropdown
                key={startDate}
                label=""
                value={monthlyOption}
                isVisible={true}
                elements={monthlyOptions}
                name="Select recurrence"
                onChange={setMonthlyOption}
              />
            )}

            <RadioGroup
              label="Ends"
              options={endOptions}
              selectedOption={endOption}
              onChange={handleEndOptionChange}
              name="recurrence-end"
            />

            {endOption === 'On' && (
              <DatePicker
                label={"Ends On:"}
                value={endDate}
                onChange={(val) => setEndDate(val)}
              />
            )}

            {endOption === 'After' && (
              <div className={styles['spinner-group']}>
                <div className={styles['spinner-container']}>
                  <label style={{ marginRight: '5px' }}>Ends after</label>
                  <SpinnerInput
                    value={occurrences}
                    min={1}
                    step={1}
                    onChange={setOccurrences}
                  />
                  <label style={{ marginLeft: '5px' }}>occurrences(s)</label>
                </div>
                {(!occurrences || occurrences < 1) && (
                  <div className={styles['error-message']}>
                    Please enter at least one occurrence.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.separator}></div>
        </div>
      )}
    </div>
  );
};

export default RecurringMeetingForm;
