import React, { useState } from 'react';
import styles from "../../../../styles/components/organisms/CalendarNavbar.module.scss";

type CalendarNavbarProps = {
    selectedDate: Date;
    onPreviousDay: () => void;
    onNextDay: () => void;
    onDateChange: (date: Date) => void;

  };
  
const CalendarNavbar: React.FC<CalendarNavbarProps> = ({ selectedDate, onPreviousDay, onNextDay, onDateChange }) => {
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
  
    const handleViewChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
      setSelectedView(event.target.value);
      onDateChange(new Date());
    };
  
    const handleToday = () => {
      setSelectedView("Day");
      onDateChange(new Date());
      // onToday(); // Call the external function as well
    };
  
    const handleCombinedPrevious = () => {
      handlePrevious(); // Local function logic
      onPreviousDay(); // External function from DailyView
    };
  
    const handleCombinedNext = () => {
      handleNext(); // Local function logic
      onNextDay(); // External function from DailyView
    };

    const testData = [
      { date: '2025-03-20', event: 'Team Meeting', attendees: 8, status: 'Completed' },
      { date: '2025-03-21', event: 'Client Presentation', attendees: 4, status: 'Scheduled' },
      { date: '2025-03-22', event: 'Sprint Planning', attendees: 12, status: 'Scheduled' },
      { date: '2025-03-25', event: 'Code Review', attendees: 6, status: 'Pending' },
      { date: '2025-03-28', event: 'Release Day', attendees: 15, status: 'Scheduled' }
    ];
      
    // Helper function to convert array to CSV format
    const convertToCSV = (objArray: any) => {
      const array = [Object.keys(objArray[0])].concat(objArray);
      
      return array.map(row => {
        return Object.values(row)
          .map(value => {
            // Handle values containing commas or quotes
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(',');
      }).join('\n');
    };
    
    // Function to download CSV file
    const downloadCSV = (csvContent: any, fileName: any) => {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const handleExportCSV = () => {
      const csvContent = convertToCSV(testData);
      const fileName = `calendar-export-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(csvContent, fileName);
    };
  
    return (
      <div className={styles.navbarContainer}>
        <h2 className={styles.navbarContainerRight}>{getDateRange(selectedDate)}</h2>
        <div className={styles.navbarContainerLeft}>
          <div className={styles.box} onClick={handleExportCSV} >
            Export CSV
          </div>
          <div className={styles.box}>
            {/* Temporary dropdown component */}
            <select id="view-select" value={selectedView} onChange={handleViewChange}>
              <option value="Day">Day</option>
              <option value="Week">Week</option>
              <option value="Month">Month</option>
            </select>
          </div>
          <div className={styles.box}>
            <a href="#" onClick={() => onDateChange(new Date())}>Today</a>
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
  