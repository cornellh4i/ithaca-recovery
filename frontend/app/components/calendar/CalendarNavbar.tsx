import React, { useState } from 'react';
import Dropdown from '../atoms/Dropdown';
import CalendarHeader from './CalendarHeader';
import styles from "../../../styles/components/calendar/CalendarNavbar.module.scss";
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
    isAdmin: boolean;
  };

const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ selectedDate, onDateChange, onViewChange, isAdmin }) => {
    const [selectedView, setSelectedView] = useState('Day');

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
      <>
        <div className={styles.navbarContainer}>
          <CalendarHeader selectedDate={selectedDate} selectedView={selectedView} />
          <div className={styles.navbarControls}>
            <div className={styles.viewDropdown}>
              <Dropdown
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
        {!isAdmin && (
          <div className={styles.viewOnlyPill}>
            <img src="/svg/lock-icon.svg" alt="" className={styles.viewOnlyIcon} />
            <span>View only - sign in as Admin to manage meetings</span>
          </div>
        )}
      </>
    );
  };
  
  export default CalendarNavbar;
  