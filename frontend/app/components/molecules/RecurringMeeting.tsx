"use client";

import React, { useState } from 'react';
import RadioGroup from '../atoms/RadioGroup';
import LabeledCheckbox from '../atoms/checkbox';
import SpinnerInput from '../atoms/SpinnerInput';
import DatePicker from '../atoms/DatePicker';
import styles from "../../../styles/components/molecules/RecurringMeeting.module.scss";

const RecurringMeetingForm: React.FC = () => {
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState(1);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endOption, setEndOption] = useState('Never');
  const [endDate, setEndDate] = useState<string | undefined>("");
  const [occurrences, setOccurrences] = useState(1);

  const days = [
    { id: 'sun', label: 'S' },
    { id: 'mon', label: 'M' },
    { id: 'tue', label: 'T' },
    { id: 'wed', label: 'W' },
    { id: 'thu', label: 'T' },
    { id: 'fri', label: 'F' },
    { id: 'sat', label: 'S' },
  ];

  const handleRecurringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsRecurring(e.target.checked);
  };

  const toggleDay = (dayId: string) => {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((id) => id !== dayId) : [...prev, dayId]
    );
  };

  const handleFrequencyChange = (value: number) => {
    setFrequency(value);
  };

  const handleEndOptionChange = (option: string) => {
    setEndOption(option);
  
    // If "On" is selected, reset specificDate
    if (option !== 'On') {
      setEndDate("");
    }

    // If "After" is selected, reset occurrences
    if (option !== "After") {
      setOccurrences(1);
    }
  };

  const endOptions = ['Never', 'On', 'After'];

  return (
    <div className={styles.container}>
      <div>
        <LabeledCheckbox
          label={`This meeting is recurring`}
          checked={isRecurring}
          onChange={handleRecurringChange}
          color= "#848484"
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
              {days.map((day, index) => (
                  <button
                  key={day.id} 
                  type="button"
                  className={`${styles.dayButton} ${selectedDays.includes(day.id) ? styles.active : ''}`}
                  onClick={() => toggleDay(day.id)}
                  >
                    {day.label}
                  </button>
              ))}
            </div>

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
                onChange={setEndDate}
                error={endDate === '' ? 'Date is required' : undefined}
              />
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
