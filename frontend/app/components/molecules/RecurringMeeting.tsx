"use client";

import React, { useState, useEffect } from 'react';
import RadioGroup from '../atoms/RadioGroup';
import LabeledCheckbox from '../atoms/checkbox';
import SpinnerInput from '../atoms/SpinnerInput';
import DatePicker from '../atoms/DatePicker';
import styles from "../../../styles/components/molecules/RecurringMeeting.module.scss";

import CheckButton from '../atoms/CheckButton';
import { IRecurrencePattern } from "../../../util/models";


interface RecurringMeetingFormProps {
  onChange: (data: {
    isRecurring: boolean;
    recurrencePattern: IRecurrencePattern | null;
  }) => void;
  startDate?: string;
  showValidation?: boolean;
}

const RecurringMeetingForm: React.FC<RecurringMeetingFormProps> = ({ 
  onChange, 
  startDate,
  showValidation = false 
}) => {
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState(1);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endOption, setEndOption] = useState('Never');
  const [endDate, setEndDate] = useState<string | undefined>("");
  const [occurrences, setOccurrences] = useState(1);
  
  // Map day abbreviations to full day names for Microsoft Graph API compatibility
  const dayMapping: Record<string, string> = {
    'sun': 'Sunday',
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
  };

  const days = [
    { id: 'sun', label: 'S' },
    { id: 'mon', label: 'M' },
    { id: 'tue', label: 'T' },
    { id: 'wed', label: 'W' },
    { id: 'thu', label: 'T' },
    { id: 'fri', label: 'F' },
    { id: 'sat', label: 'S' },
  ];

  // Set default day when recurring mode is enabled and startDate changes
  useEffect(() => {
    if (isRecurring && startDate) {
      try {
        const date = new Date(startDate);
        // Check if date is valid
        if (!isNaN(date.getTime())) {
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const dayId = days[dayOfWeek].id;
          
          // Only set the day if no days are selected yet
          if (selectedDays.length === 0) {
            setSelectedDays([dayId]);
          }
        }
      } catch (error) {
        console.error("Error parsing date:", error);
      }
    }
  }, [isRecurring, startDate]);

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
    const recurrencePattern: IRecurrencePattern | null = isRecurring 
      ? {
          type: "weekly",
          interval: frequency,
          startDate: startDate ? new Date(startDate) : new Date(),
          firstDayOfWeek: "Sunday",
          daysOfWeek: selectedDays.map(day => dayMapping[day]),
          endDate: endOption === 'On' && endDate ? new Date(endDate) : null,
          numberOfOccurrences: endOption === 'After' ? occurrences : null,
        }
      : null;

    onChange({
      isRecurring,
      recurrencePattern
    });
  }, [isRecurring, frequency, selectedDays, endOption, endDate, occurrences, onChange, startDate]);

  const handleRecurringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsRecurring(e.target.checked);
  };

  const toggleDay = (dayId: string) => {
    setSelectedDays((prev) => {
      const newSelectedDays = prev.includes(dayId) 
        ? prev.filter((id) => id !== dayId) 
        : [...prev, dayId];
      
      return newSelectedDays;
    });
  };

  const handleFrequencyChange = (value: number) => {
    setFrequency(value);
  };

  const handleEndOptionChange = (option: string) => {
    setEndOption(option);
    
    if (option !== 'On') {
      setEndDate("");
    }
    
    if (option !== "After") {
      setOccurrences(1);
    } else {
      setOccurrences(1);
    }
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  const endOptions = ['Never', 'On', 'After'];

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
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px' }}>
              <label style={{ marginRight: '5px'}}>Every</label>
              <SpinnerInput
                value={frequency}
                min={1}
                step={1}
                onChange={handleFrequencyChange}
              />
              <label style={{ marginLeft: '5px'}}>week(s)</label>
            </div>

            <div className={styles.dayButtons}>
              <label style={{ marginRight: '5px'}}>On</label>
              {days.map((day) => (
                <CheckButton
                  key={day.id}
                  label={day.label}
                  checked={selectedDays.includes(day.id)}
                  onClick={() => toggleDay(day.id)}
                />
              ))}
            </div>
            
            {showValidation && selectedDays.length === 0 && (
              <div style={{ 
                color: 'red', 
                fontSize: '14px', 
                marginTop: '5px', 
                marginBottom: '10px',
                textAlign: 'center',
                width: '100%'
              }}>
                Please select at least one day
              </div>
            )}

            <RadioGroup
              label="Ends"
              options={endOptions}
              selectedOption={endOption}
              onChange={handleEndOptionChange}
              name="recurrence-end"
            />

            {endOption === 'On' && (
              <>
                <DatePicker
                  label={"Ends On:"}
                  value={endDate}
                  onChange={handleEndDateChange}
                  error={showValidation && !endDate ? 'Date is required' : undefined}
                />
              </>
            )}

            {endOption === 'After' && (
              <div style={{ display: 'flex', alignItems: 'center'}}>
                <label style={{ marginRight: '5px'}}>Ends after</label>
                <SpinnerInput
                  value={occurrences}
                  min={1}
                  step={1}
                  onChange={setOccurrences}
                />
                <label style={{ marginLeft: '5px'}}>occurrences(s)</label>
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