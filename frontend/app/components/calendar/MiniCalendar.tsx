import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import styles from "./MiniCalendar.module.scss";

type MiniCalendarProps = {
  selectedDate: Date
  onSelect: (date: Date) => void;
};

const MiniCalendar: React.FC<MiniCalendarProps> = ({ selectedDate, onSelect }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

  // INVARIANT: date and currentMonth are both local-midnight-anchored Dates from react-day-
  // picker's own (date-fns) calendar generation, not real ET instants -- compare them via local
  // getters, not an ET reformat. Reformatting either side through ET can push a month-boundary
  // cell (e.g. day 1) across a month it didn't actually cross, while a non-boundary reference
  // date shifted by the same offset doesn't. Same reasoning as DatePicker.tsx's stringToDate.
  const isOutsideDay = (date: Date) => {
    // eslint-disable-next-line no-restricted-syntax -- see comment above
    return date.getMonth() !== currentMonth.getMonth();
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && !isOutsideDay(date)) {
      onSelect(date);
    }
  };

  return (
    <div className={styles.container}>
      <DayPicker
        mode="single"
        selected={selectedDate}
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        showOutsideDays={true}
        onSelect={handleDateSelect}
        className={styles.rdpMonth}
        modifiersClassNames={{
          selected: styles.selectedDay,
          outside: styles.dayOutside,
          today: styles.today,
        }}
        defaultMonth={currentMonth}
        formatters={{
          // Same local-semantics reasoning as isOutsideDay above -- these are react-day-picker's
          // own reference dates for the header row, not real ET instants.
          formatWeekdayName: (date: Date) =>
            // eslint-disable-next-line no-restricted-syntax -- see comment above
            date.toLocaleDateString("en-US", { weekday: "short" }).substring(0, 1),
        }}
        required
      />
    </div>
  );
};

export default MiniCalendar;
