import React from "react";
import { getFirstDayOfWeek, getDaysOfWeek } from "../../../util/weekDates";
import { formatETDateString } from "../../../util/timeUtils";
import styles from "../../../styles/components/calendar/WeekStrip.module.scss";

interface WeekStripProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
}

// 1-letter weekday abbreviation, ET-explicit like the rest of this calendar's date handling
// (a local-timezone toLocaleDateString call could disagree with the real ET calendar day near
// midnight ET on a UTC-default runtime, same class of bug the ET-safe helpers elsewhere guard
// against).
const weekdayLetterFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});
const formatWeekdayLetter = (date: Date): string => weekdayLetterFormatter.format(date).charAt(0);

const formatDayNumber = (date: Date): string => formatETDateString(date).split("-")[2].replace(/^0/, "");

const WeekStrip: React.FC<WeekStripProps> = ({ selectedDate, setSelectedDate }) => {
  const days = getDaysOfWeek(getFirstDayOfWeek(selectedDate));
  const todayEtDateStr = formatETDateString(new Date());
  const selectedEtDateStr = formatETDateString(selectedDate);

  return (
    <div className={styles.strip}>
      {days.map((day) => {
        const dayEtDateStr = formatETDateString(day);
        const isToday = dayEtDateStr === todayEtDateStr;
        const isSelected = dayEtDateStr === selectedEtDateStr;

        const circleClass = [
          styles.circle,
          isSelected && isToday && styles.selectedToday,
          isSelected && !isToday && styles.selectedNotToday,
          !isSelected && isToday && styles.today,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={dayEtDateStr}
            type="button"
            className={styles.dayButton}
            aria-pressed={isSelected}
            onClick={() => setSelectedDate(day)}
          >
            <span className={styles.weekday}>{formatWeekdayLetter(day)}</span>
            <span className={circleClass}>{formatDayNumber(day)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default WeekStrip;
