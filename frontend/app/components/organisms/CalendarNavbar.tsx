import React, { useState } from 'react';
import Dropdown from '../atoms/Dropdown';
import styles from "../../../styles/components/organisms/CalendarNavbar.module.scss";
import { formatMeetingDateLine, monthNameForETDateString, formatMeetingWeekLine } from "../../../util/timeFormat";
import {
  formatETDateString,
  convertETToUTC,
  addDaysToETDateString,
  addMonthsToETDateString,
} from "../../../util/timeUtils";

type CalendarNavbarProps = {
    selectedDate: Date;
    onDateChange: (date : Date) => void;
    onViewChange: (view: string) => void;
  };

const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ selectedDate, onDateChange, onViewChange }) => {
    const [selectedView, setSelectedView] = useState('Day');

    const getDateRange = (date: Date) => {
      if (selectedView === 'Day') {
        return formatMeetingDateLine(date);
      }

      if (selectedView === 'Week') {
        return formatMeetingWeekLine(date);
      }

      // Month
      const etDateStr = formatETDateString(date);
      const [year] = etDateStr.split('-');
      return `${monthNameForETDateString(etDateStr)} ${year}`;
    };
  
    const handleViewChange = (value: string) => {
      setSelectedView(value);
      onViewChange(value); // Call the external function
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
          <div className={styles.viewDropdown}>
            <Dropdown
              key={selectedView}
              label=""
              value={selectedView}
              isVisible={true}
              elements={['Day', 'Week']}
              name="Select view"
              onChange={handleViewChange}
            />
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
  