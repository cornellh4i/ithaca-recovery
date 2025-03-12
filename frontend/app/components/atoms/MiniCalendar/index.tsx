import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import styles from "../../../../styles/components/atoms/MiniCalendar.module.scss";

type MiniCalendarProps = {
  selectedDate: Date
  onSelect: (date: Date) => void;
};

const MiniCalendar: React.FC<MiniCalendarProps> = ({ selectedDate, onSelect }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));  

  const isOutsideDay = (date: Date) => {
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
          formatWeekdayName: (date: Date) => date.toLocaleDateString("en-US", { weekday: "short" })[0],
        }}
        required
      />
    </div>
  );
};

export default MiniCalendar;
