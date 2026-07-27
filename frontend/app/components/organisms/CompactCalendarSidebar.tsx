import React, { useState } from 'react';
import IconButton from '../atoms/IconButton';
import MiniCalendar from '../atoms/MiniCalendar';
import FilterGroup from '../molecules/FilterGroup';
import { LOCATION_ITEMS, ZOOM_ITEMS, CALENDAR_ITEMS, MODE_ITEMS } from '../molecules/MeetingsFilter';
import { MeetingFilters } from '../../../util/meetingFilters';
import styles from '../../../styles/components/organisms/CompactCalendarSidebar.module.scss';

type FlyoutKey = 'calendar' | 'location' | 'video' | 'group';

interface CompactCalendarSidebarProps {
  filters: MeetingFilters;
  handleFilterChange: (name: string, value: boolean) => void;
  selectedDate: Date;
  handleMiniCalendarSelect: (date: Date) => void;
  onOpenNewMeeting: () => void;
}

const CompactCalendarSidebar: React.FC<CompactCalendarSidebarProps> = ({
  filters,
  handleFilterChange,
  selectedDate,
  handleMiniCalendarSelect,
  onOpenNewMeeting,
}) => {
  const [openFlyout, setOpenFlyout] = useState<FlyoutKey | null>(null);

  const toggleFlyout = (key: FlyoutKey) => {
    setOpenFlyout((prev) => (prev === key ? null : key));
  };

  return (
    <div className={styles.rail}>
      <IconButton
        icon={<img src="/svg/plus-icon-white.svg" alt="" />}
        ariaLabel="New Meeting"
        tooltip="New Meeting"
        variant="filled"
        backgroundColor="#CC3366"
        onClick={onOpenNewMeeting}
      />

      <div className={styles.flyoutAnchor}>
        <IconButton
          icon={<img src="/svg/calendar-icon.svg" alt="" />}
          ariaLabel="Show mini calendar"
          tooltip="Calendar"
          onClick={() => toggleFlyout('calendar')}
        />
        {openFlyout === 'calendar' && (
          <div className={styles.flyout}>
            <MiniCalendar selectedDate={selectedDate} onSelect={handleMiniCalendarSelect} />
          </div>
        )}
      </div>

      <div className={styles.flyoutAnchor}>
        <IconButton
          icon={<img src="/svg/location-icon.svg" alt="" />}
          ariaLabel="Show location filters"
          tooltip="Location"
          onClick={() => toggleFlyout('location')}
        />
        {openFlyout === 'location' && (
          <div className={styles.flyout}>
            <FilterGroup
              title="Location"
              items={LOCATION_ITEMS}
              checked={filters}
              onToggle={handleFilterChange}
              headingVariant="title"
            />
          </div>
        )}
      </div>

      <div className={styles.flyoutAnchor}>
        <IconButton
          icon={<img src="/svg/video-call-icon.svg" alt="" />}
          ariaLabel="Show Zoom Room filters"
          tooltip="Zoom Rooms"
          onClick={() => toggleFlyout('video')}
        />
        {openFlyout === 'video' && (
          <div className={styles.flyout}>
            <FilterGroup
              title="Zoom Rooms"
              items={ZOOM_ITEMS}
              checked={filters}
              onToggle={handleFilterChange}
              headingVariant="title"
            />
          </div>
        )}
      </div>

      <div className={styles.flyoutAnchor}>
        <IconButton
          icon={<img src="/svg/group-icon.svg" alt="" />}
          ariaLabel="Show calendar and mode filters"
          tooltip="Calendar & Mode"
          onClick={() => toggleFlyout('group')}
        />
        {openFlyout === 'group' && (
          <div className={styles.flyout}>
            <FilterGroup
              title="Calendar"
              items={CALENDAR_ITEMS}
              checked={filters}
              onToggle={handleFilterChange}
              headingVariant="title"
            />
            <FilterGroup
              title="Mode"
              items={MODE_ITEMS}
              checked={filters}
              onToggle={handleFilterChange}
              headingVariant="title"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CompactCalendarSidebar;
