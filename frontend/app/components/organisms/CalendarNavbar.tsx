import React, { useState } from 'react';
import styles from "../../../styles/components/organisms/CalendarNavbar.module.scss";
import PandaDocButton from '../molecules/PandaDocButton';

type CalendarNavbarProps = {
    selectedDate: Date;
    onDateChange: (date : Date) => void;
    onViewChange: (view: string) => void;
  };
  
const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ selectedDate, onDateChange, onViewChange }) => {
    const [selectedView, setSelectedView] = useState('Day');
  
    const getDateRange = (date: Date) => {
      let startDate, endDate;
  
      switch (selectedView) {
        case 'Day':
          startDate = new Date(date);
          endDate = new Date(date);
          break;
  
        case 'Week':
          const firstDayOfWeek = date.getDate() - date.getDay(); // Sunday
          const lastDayOfWeek = firstDayOfWeek + 6; // Saturday
  
          startDate = new Date(date);
          startDate.setDate(firstDayOfWeek);
  
          endDate = new Date(date);
          endDate.setDate(lastDayOfWeek);
          break;
  
        case 'Month':
          startDate = new Date(date.getFullYear(), date.getMonth(), 1);
          endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0); // Last day of the month
          break;
  
        default:
          startDate = endDate = date; // Default to current date
      }

      const startMonth = startDate.toLocaleDateString('en-US', { month: 'long' });
      const startDay = startDate.getDate();
      const startYear = startDate.getFullYear();
  
      const endMonth = endDate.toLocaleDateString('en-US', { month: 'long' });
      const endDay = endDate.getDate();
      const endYear = endDate.getFullYear();
  
      // Format the output depending on whether the months or years are the same
      if (selectedView === 'Day') {
        return `${startMonth} ${startDay}, ${startYear}`;
      } else if (selectedView === 'Month') {
        return `${startMonth} ${startYear}`;
      } else if (startMonth === endMonth && startYear === endYear) {
        return `${startMonth} ${startDay}-${endDay}, ${startYear}`;
      } else {
        return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
      }
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

    const handlePrevious = () => {
      const newDate = new Date(selectedDate);
      switch (selectedView) {
        case 'Day':
          newDate.setDate(newDate.getDate() - 1);
          break;
        case 'Week':
          newDate.setDate(newDate.getDate() - 7);
          break;
        case 'Month':
          newDate.setMonth(newDate.getMonth() - 1);
          break;
        default:
          break;
      }
      onDateChange(newDate);
    };
  
    const handleNext = () => {
      const newDate = new Date(selectedDate);
      switch (selectedView) {
        case 'Day':
          newDate.setDate(newDate.getDate() + 1);
          break;
        case 'Week':
          newDate.setDate(newDate.getDate() + 7);
          break;
        case 'Month':
          newDate.setMonth(newDate.getMonth() + 1);
          break;
        default:
          break;
      }
      onDateChange(newDate);
    };

    return (
      <div className={styles.navbarContainer}>
        <h2 className={styles.navbarContainerRight}>{getDateRange(selectedDate)}</h2>
        <div className={styles.navbarContainerLeft}>
          <PandaDocButton className={styles.box} />
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
            <img src="/left-arrow.svg" alt="Left Arrow" width={24} height={24} onClick={handlePrevious} />
            <img src="/right-arrow.svg" alt="Right Arrow" width={24} height={24} onClick={handleNext} />
          </div>
        </div>
      </div>
    );
  };
  
  export default CalendarNavbar;
  