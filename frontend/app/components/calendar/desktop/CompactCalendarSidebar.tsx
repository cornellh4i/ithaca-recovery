import React, { useEffect, useRef, useState } from 'react';
import IconButton from '../../ui/buttons/IconButton';
import MiniCalendar from '../MiniCalendar';
import FilterGroup from '../../shared/FilterGroup';
import { LOCATION_ITEMS, ZOOM_ITEMS, CALENDAR_ITEMS, MODE_ITEMS } from '../shared/MeetingsFilter';
import { MeetingFilters } from '../../../../util/filters/meetingFilters';
import styles from '../../../../styles/components/calendar/desktop/CompactCalendarSidebar.module.scss';

type FlyoutKey = 'calendar' | 'location' | 'video' | 'group';

interface CompactCalendarSidebarProps {
  filters: MeetingFilters;
  handleFilterChange: (name: string, value: boolean) => void;
  selectedDate: Date;
  handleMiniCalendarSelect: (date: Date) => void;
  onOpenNewMeeting: () => void;
  isAdmin: boolean | null;
}

const CompactCalendarSidebar: React.FC<CompactCalendarSidebarProps> = ({
  filters,
  handleFilterChange,
  selectedDate,
  handleMiniCalendarSelect,
  onOpenNewMeeting,
  isAdmin,
}) => {
  const [openFlyout, setOpenFlyout] = useState<FlyoutKey | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const toggleFlyout = (key: FlyoutKey) => {
    setOpenFlyout((prev) => (prev === key ? null : key));
  };

  // Same pattern as DatePicker's outside-click handling: a mousedown anywhere outside the
  // rail (the icons and their flyouts) closes whichever flyout is open. Clicks on a rail icon
  // or inside a flyout's own content stay inside railRef, so they're left to their own click
  // handlers (toggleFlyout, checkbox onChange, etc.) instead of being fought here.
  useEffect(() => {
    if (!openFlyout) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!railRef.current?.contains(event.target as Node)) {
        setOpenFlyout(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openFlyout]);

  return (
    <div className={styles.rail} ref={railRef}>
      {isAdmin && (
        <IconButton
          name="plus"
          ariaLabel="New Meeting"
          tooltip="New Meeting"
          tooltipAlign="left"
          variant="filled"
          backgroundColor="#CC3366"
          onClick={onOpenNewMeeting}
        />
      )}

      <div className={styles.flyoutAnchor}>
        <IconButton
          name="calendar"
          ariaLabel="Show mini calendar"
          tooltip="Calendar"
          tooltipAlign="left"
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
          name="location"
          ariaLabel="Show location filters"
          tooltip="Location"
          tooltipAlign="left"
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
          name="video-call"
          ariaLabel="Show Zoom Room filters"
          tooltip="Zoom Rooms"
          tooltipAlign="left"
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
          name="group"
          ariaLabel="Show calendar and mode filters"
          tooltip="Calendar & Mode"
          tooltipAlign="left"
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
