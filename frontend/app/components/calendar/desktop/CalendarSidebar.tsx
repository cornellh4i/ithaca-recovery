import React from 'react';
import TextButton from '../../atoms/TextButton';

import MiniCalendar from '../../atoms/MiniCalendar';
import MeetingsFilter from '../shared/MeetingsFilter';
import { MeetingFilters } from '../../../../util/meetingFilters';
import NewMeetingSidebar from '../../meeting-form/NewMeeting';
import styles from '../../../../styles/components/calendar/desktop/CalendarSidebar.module.scss';
import AddIcon from '@mui/icons-material/Add';
interface CalendarSidebarProps {
  filters: MeetingFilters;
  isNewMeetingOpen: boolean;
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleFilterChange: (name: string, value: boolean) => void;
  handleMiniCalendarSelect: (date: Date) => void;
  selectedDate: Date;
  selectedView: string;
  triggerCalendarRefresh: () => void;
  isAdmin: boolean | null;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  filters,
  isNewMeetingOpen,
  setIsNewMeetingOpen,
  handleFilterChange,
  handleMiniCalendarSelect,
  selectedDate,
  selectedView,
  triggerCalendarRefresh,
  isAdmin,
}) => {
  const handleOpenNewMeeting = () => {
    setIsNewMeetingOpen(true);
  };

  return (
    <div>
      {isNewMeetingOpen && isAdmin ? (
        <NewMeetingSidebar
          setIsNewMeetingOpen={setIsNewMeetingOpen}
          triggerCalendarRefresh={triggerCalendarRefresh}
          selectedDate={selectedDate}
          selectedView={selectedView}
        />
      ) : (
        <>
          {isAdmin && (
            <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<AddIcon />} />
          )}
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
