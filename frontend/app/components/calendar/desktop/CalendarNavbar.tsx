import React, { useState } from 'react';
import Dropdown from '../../atoms/Dropdown';
import CalendarHeader from '../shared/CalendarHeader';
import styles from "../../../../styles/components/calendar/desktop/CalendarNavbar.module.scss";
import {
  formatETDateString,
  convertETToUTC,
  addDaysToETDateString,
  addMonthsToETDateString,
} from "../../../../util/date/timeUtils";

// view_timeline / calendar_view_week (Material Symbols) -- same icons and same renderElement
// pattern MobileAppNavbar's own Day/Multi-Day dropdown uses (icon-only in the closed button
// via .viewOptionText's display:none, icon+label in the open list).
const VIEW_ICONS: Record<string, string> = {
  Day: "/svg/view-timeline-icon.svg",
  Week: "/svg/calendar-view-week-icon.svg",
};

type CalendarNavbarProps = {
    selectedDate: Date;
    onDateChange: (date : Date) => void;
    onViewChange: (view: string) => void;
    // Optional: signage (a public kiosk with no sign-in concept at all) renders this without
    // ever resolving a real admin status, CalendarHeader treats the resulting null the same as 
    // "not yet known" and skips the View-only pill either way, whereas the main calendar always 
    // supplies its resolved (or still-loading) boolean | null.
    isAdmin?: boolean | null;
  };

const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ selectedDate, onDateChange, onViewChange, isAdmin = null }) => {
    const [selectedView, setSelectedView] = useState('Day');

    const handleViewChange = (value: string) => {
      setSelectedView(value);
      onViewChange(value); // Call the external function
      onDateChange(new Date());
    };
  
    // Jumps to today's date within whatever view is currently active -- must not touch
    // selectedView (previously forced this to "Day" without telling the parent via
    // onViewChange, desyncing CalendarHeader's date-range label and shiftSelectedDate's own
    // day-vs-week step from whatever view was actually still rendered underneath).
    const handleToday = () => {
      onDateChange(new Date());
    };

    // Shifts the ET calendar date `selectedDate` represents by a day count (Day/Week) or month
    // count (Month), then hands back an ET-noon Date for the result -- noon (not midnight) so
    // re-deriving the ET date string from it later can't roll back a day, matching
    // WeekView.tsx's getFirstDayOfWeek/getDaysOfWeek convention.
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
      <CalendarHeader selectedDate={selectedDate} selectedView={selectedView} isAdmin={isAdmin}>
        <div className={styles.navbarControls}>
          <div className={styles.viewDropdown}>
            <Dropdown
              label=""
              value={selectedView}
              isVisible={true}
              elements={['Day', 'Week']}
              name="Select view"
              ariaLabel={selectedView}
              onChange={handleViewChange}
              renderElement={(element) => (
                <span className={styles.viewOption}>
                  <img src={VIEW_ICONS[element]} alt="" className={styles.viewOptionIcon} />
                  <span className={styles.viewOptionText}>{element}</span>
                </span>
              )}
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
      </CalendarHeader>
    );
  };
  
  export default CalendarNavbar;
  