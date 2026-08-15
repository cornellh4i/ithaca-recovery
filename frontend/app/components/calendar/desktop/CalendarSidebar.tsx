import React from 'react';
import TextButton from '../../ui/buttons/TextButton';

import MiniCalendar from '../MiniCalendar';
import MeetingsFilter from '../shared/MeetingsFilter';
import { MeetingFilters } from '../../../../util/filters/meetingFilters';
import NewMeetingSidebar from '../../meeting-form/NewMeeting';
import styles from './CalendarSidebar.module.scss';
import Icon from '../../ui/displays/Icon';
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
            <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<Icon name="plus" />} />
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
