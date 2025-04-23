import React, { useState } from 'react';

import TextButton from '../../atoms/textbutton';

import MiniCalendar from '../../atoms/MiniCalendar';
import MeetingsFilter from '../../molecules/MeetingsFilter';
import NewMeetingSidebar from '../NewMeeting';
import styles from '../../../../styles/components/organisms/CalendarSidebar.module.scss';
import AddIcon from '@mui/icons-material/Add';

interface CalendarSidebarProps {
  filters: any;
  setFilters: any;
  selectedDate: Date;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({filters, setFilters, selectedDate, setSelectedDate}) => {
  // State declarations for New Meeting button
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const handleMiniCalendarSelect = (date: Date) => {
    setSelectedDate(date);
  };

  // A unique key for the filter 
  const filterKey = 'meetingFilterState';

  const handleFilterChange = (name: string, value: boolean) => {
    const updatedFilters = { ...filters, [name]: value };
    setFilters(updatedFilters);
  };

  const handleOpenNewMeeting = () => {
    setIsNewMeetingOpen(true);
  };

  return (
    <div>
      {isNewMeetingOpen ? (
        <NewMeetingSidebar
          setIsNewMeetingOpen={setIsNewMeetingOpen}
        />
      ) : (
        <>
          <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<AddIcon />} />
          <div>
            <MiniCalendar selectedDate={selectedDate} onSelect={handleMiniCalendarSelect}/>
          </div>
          <div className={styles.meetingsFilter}>
            <MeetingsFilter filters={filters} onFilterChange={handleFilterChange} />
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarSidebar;