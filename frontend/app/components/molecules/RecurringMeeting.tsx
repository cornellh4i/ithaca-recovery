"use client";

import React, { useState } from 'react';
import RadioGroup from '../atoms/RadioGroup';
import Checkbox from '../atoms/checkbox';
import SpinnerInput from '../atoms/SpinnerInput';
import styles from "../../../styles/components/organisms/RecurringMeeting.module.scss";

const RecurringMeetingForm: React.FC = () => {
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState(1);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endOption, setEndOption] = useState('Never');

  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const handleRecurringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsRecurring(e.target.checked);
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleFrequencyChange = (value: number) => {
    setFrequency(value);
  };

  const endOptions = ['Never', 'On a specific date', 'After X occurrences'];

  return (
    <div className={styles.container}>
      <Checkbox
        label={`This meeting is recurring`}
        checked={isRecurring}
        onChange={handleRecurringChange}
        color="blue"
      />

      {isRecurring && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <label style={{ marginRight: '5px', fontWeight: 'bold' }}>Every</label>
              <SpinnerInput
                value={frequency}
                min={1}
                step={1}
                onChange={handleFrequencyChange}
              />
              <span>week(s)</span>
        </div>

          <div className={styles.dayButtons}>
            <p>On:</p>
            {days.map((day, index) => (
                <button
                key={`${day}-${index}`} 
                type="button"
                className={`${styles.dayButton} ${selectedDays.includes(day) ? styles.active : ''}`}
                onClick={() => toggleDay(day)}
                >
                {day}
                </button>
            ))}
            </div>

          <RadioGroup
            label="Ends"
            options={endOptions}
            selectedOption={endOption}
            onChange={setEndOption}
            name="recurrence-end"
          />
        </div>
      )}
    </div>
  );
};

export default RecurringMeetingForm;
