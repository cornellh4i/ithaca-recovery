import React, { useState } from 'react';
import styles from "../../../../styles/components/organisms/CalendarNavbar.module.scss";

type CalendarNavbarProps = {
    onPreviousDay: () => void;
    onNextDay: () => void;
    onToday: () => void;
  };
  
  const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ onPreviousDay, onNextDay, onToday }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
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
  
    const handlePrevious = () => {
      const newDate = new Date(currentDate);
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
      setCurrentDate(newDate);

    };
  
    const handleNext = () => {
      const newDate = new Date(currentDate);
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
      setCurrentDate(newDate);
    };
  
    const handleViewChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
      setSelectedView(event.target.value);
      setCurrentDate(new Date());
    };
  
    const handleToday = () => {
      setSelectedView("Day");
      setCurrentDate(new Date());
      onToday(); // Call the external function as well
    };
  
    const handleCombinedPrevious = () => {
      handlePrevious(); // Local function logic
      onPreviousDay(); // External function from DailyView
    };
  
    const handleCombinedNext = () => {
      handleNext(); // Local function logic
      onNextDay(); // External function from DailyView
    };
  
    return (
      <div className={styles.navbarContainer}>
        <h2 className={styles.navbarContainerRight}>{getDateRange(currentDate)}</h2>
        <div className={styles.navbarContainerLeft}>
          <img src="/search-icon.svg" alt="Search Icon" width={36} height={36} />
          <div className={styles.box}>
            {/* Temporary dropdown component */}
            <select id="view-select" value={selectedView} onChange={handleViewChange}>
              <option value="Day">Day</option>
              <option value="Week">Week</option>
              <option value="Month">Month</option>
            </select>
          </div>
          <div className={styles.box}>
            <a href="#" onClick={handleToday}>Today</a>
          </div>
          <div className={styles.dateToggle}>
            <img src="/left-arrow.svg" alt="Left Arrow" width={24} height={24} onClick={handleCombinedPrevious} />
            <img src="/right-arrow.svg" alt="Right Arrow" width={24} height={24} onClick={handleCombinedNext} />
          </div>
        </div>
      </div>
    );
  };
  
  export default CalendarNavbar;
  