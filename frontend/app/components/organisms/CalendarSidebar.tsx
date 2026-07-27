import React from 'react';
import TextButton from '../atoms/TextButton';
import IconButton from '../atoms/IconButton';

import MiniCalendar from '../atoms/MiniCalendar';
import MeetingsFilter from '../molecules/MeetingsFilter';
import { MeetingFilters } from '../../../util/meetingFilters';
import NewMeetingSidebar from './NewMeeting';
import { useSidebar } from '../../context/SidebarContext';
import styles from '../../../styles/components/organisms/CalendarSidebar.module.scss';
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
}) => {
  const { collapseSidebar } = useSidebar();

  const handleOpenNewMeeting = () => {
    setIsNewMeetingOpen(true);
  };

  return (
    <div>
      <div className={styles.collapseButtonWrapper}>
        <IconButton
          icon={<img src="/svg/chevron-left-icon.svg" alt="" />}
          ariaLabel="Collapse sidebar"
          tooltip="Collapse sidebar"
          size="compact"
          onClick={collapseSidebar}
        />
      </div>
      {isNewMeetingOpen ? (
        <NewMeetingSidebar
          setIsNewMeetingOpen={setIsNewMeetingOpen}
          triggerCalendarRefresh={triggerCalendarRefresh}
          selectedDate={selectedDate}
          selectedView={selectedView}
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
