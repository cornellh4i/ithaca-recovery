import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import styles from "./MiniCalendar.module.scss";
import { formatETWeekdayShort, isSameETMonth } from "../../../util/date/timeUtils";

type MiniCalendarProps = {
  selectedDate: Date
  onSelect: (date: Date) => void;
};

const MiniCalendar: React.FC<MiniCalendarProps> = ({ selectedDate, onSelect }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

  const isOutsideDay = (date: Date) => {
    return !isSameETMonth(date, currentMonth);
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
          formatWeekdayName: (date: Date) =>
            formatETWeekdayShort(date).substring(0, 1),
        }}
        required
      />
    </div>
  );
};

export default MiniCalendar;
