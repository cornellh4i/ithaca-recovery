import React, { useState } from 'react';
import styles from "../../../styles/components/organisms/CalendarNavbar.module.scss";
import { formatMeetingDateLine } from "../../../util/timeFormat";
import {
  formatETDateString,
  convertETToUTC,
  getWeekDatesET,
  addDaysToETDateString,
  addMonthsToETDateString,
} from "../../../util/timeUtils";

type CalendarNavbarProps = {
    selectedDate: Date;
    onDateChange: (date : Date) => void;
    onViewChange: (view: string) => void;
  };

// Calendar-only month name for an ET "YYYY-MM-DD" string -- formatted with a UTC-pinned Intl
// formatter on a UTC-constructed Date, so the label matches the string's own y/m/d without ever
// being reinterpreted through a real timezone (same Date.UTC-as-calculator pattern used by
// util/timeUtils.ts's getWeekDatesET and WeeklyView.tsx's getFirstDayOfWeek/getDaysOfWeek).
const monthNameForETDate = (etDateStr: string): string => {
  const [year, month, day] = etDateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
};

const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ selectedDate, onDateChange, onViewChange }) => {
    const [selectedView, setSelectedView] = useState('Day');

    const getDateRange = (date: Date) => {
      const etDateStr = formatETDateString(date);

      if (selectedView === 'Day') {
        return formatMeetingDateLine(date);
      }

      if (selectedView === 'Week') {
        const week = getWeekDatesET(etDateStr);
        const [startYear, , startDayStr] = week[0].split('-');
        const [endYear, , endDayStr] = week[6].split('-');
        const startMonth = monthNameForETDate(week[0]);
        const endMonth = monthNameForETDate(week[6]);
        const startDay = Number(startDayStr);
        const endDay = Number(endDayStr);

        if (startMonth === endMonth && startYear === endYear) {
          return `${startMonth} ${startDay}-${endDay}, ${startYear}`;
        }
        return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
      }

      // Month
      const [year] = etDateStr.split('-');
      return `${monthNameForETDate(etDateStr)} ${year}`;
    };
  
    const handleViewChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
      setSelectedView(event.target.value);
      onViewChange(event.target.value); // Call the external function
      onDateChange(new Date());
    };
  
    const handleToday = () => {
      setSelectedView("Day");
      onDateChange(new Date()); // Call the external function as well
    };

    // Shifts the ET calendar date `selectedDate` represents by a day count (Day/Week) or month
    // count (Month), then hands back an ET-noon Date for the result -- noon (not midnight) so
    // re-deriving the ET date string from it later can't roll back a day, matching
    // WeeklyView.tsx's getFirstDayOfWeek/getDaysOfWeek convention.
    const shiftSelectedDate = (direction: 1 | -1) => {
      const etDateStr = formatETDateString(selectedDate);
      let newEtDateStr: string;
      switch (selectedView) {
        case 'Day':
          newEtDateStr = addDaysToETDateString(etDateStr, direction);
          break;
        case 'Week':
          newEtDateStr = addDaysToETDateString(etDateStr, direction * 7);
          break;
        case 'Month':
          newEtDateStr = addMonthsToETDateString(etDateStr, direction);
          break;
        default:
          newEtDateStr = etDateStr;
      }
      onDateChange(new Date(convertETToUTC(`${newEtDateStr}T12:00:00`)));
    };

    const handlePrevious = () => shiftSelectedDate(-1);
    const handleNext = () => shiftSelectedDate(1);

    return (
      <div className={styles.navbarContainer}>
        <h2 className={styles.navbarContainerRight}>{getDateRange(selectedDate)}</h2>
        <div className={styles.navbarContainerLeft}>
          <div className={styles.box}>
            {/* Temporary dropdown component */}
            <select id="view-select" value={selectedView} onChange={handleViewChange}>
              <option value="Day">Day</option>
              <option value="Week">Week</option>
            </select>
          </div>
          <div className={styles.box}>
            <a href="#" onClick={handleToday}>Today</a>
          </div>
          <div className={styles.dateToggle}>
            <img src="/svg/left-arrow.svg" alt="Left Arrow" width={24} height={24} onClick={handlePrevious} />
            <img src="/svg/right-arrow.svg" alt="Right Arrow" width={24} height={24} onClick={handleNext} />
          </div>
        </div>
      </div>
    );
  };
  
  export default CalendarNavbar;
  