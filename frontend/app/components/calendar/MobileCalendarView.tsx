import React, { useMemo, useRef } from "react";
import WeekStrip from "./WeekStrip";
import CalendarHeader from "./CalendarHeader";
import DayColumn from "./DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../util/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../util/filterColors";
import { formatETDateString } from "../../../util/timeUtils";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../util/meetingOverlapLayout";
import { getFirstDayOfWeek } from "../../../util/weekDates";
import { useWeekMeetings } from "../../../hooks/useWeekMeetings";
import { useCalendarContext } from "../../context/CalendarProvider";
import styles from "../../../styles/components/calendar/MobileCalendarView.module.scss";

interface Meeting extends OverlapMeeting {
  syncError?: boolean;
}

// Mobile shows up to 4 overlapping meetings side by side before folding into a "+N"
// indicator, vs. desktop WeeklyView's default of 2 (see util/meetingOverlapLayout.ts).
const MOBILE_MAX_VISIBLE_OVERLAP = 4;

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

// A small downward/upward scroll delta before toggling nav visibility, so tiny scroll
// jitter (e.g. rubber-banding at the top) doesn't flicker the navbar in and out.
const SCROLL_HIDE_THRESHOLD_PX = 4;

interface MobileCalendarViewProps {
  filters: MeetingFilters;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  refreshTrigger?: number;
  scrollLocked?: boolean;
  conflictMids?: Set<string>;
  isAdmin: boolean | null;
}

// Mobile portrait day view: WeekStrip + CalendarHeader stay in place (plain flex siblings
// above the scroll area, not competing for the same scroll container DayColumn uses) while
// DayColumn's own wrapper scrolls independently underneath -- also where the mobile navbar's
// scroll-hide listener attaches (writes navHidden to CalendarProvider, read by
// MobileAppNavbar).
const MobileCalendarView: React.FC<MobileCalendarViewProps> = ({
  filters,
  selectedDate,
  setSelectedDate,
  selectedMeetingID,
  setSelectedMeetingID,
  setSelectedNewMeeting,
  setAnchorEl,
  refreshTrigger = 0,
  scrollLocked = false,
  conflictMids,
  isAdmin,
}) => {
  const { setNavHidden } = useCalendarContext();
  const weekStartDate = getFirstDayOfWeek(selectedDate);
  const allMeetings = useWeekMeetings(weekStartDate, refreshTrigger);

  const getRoomColor = (meeting: Meeting) => {
    if (meeting.tags.includes("Remote")) return REMOTE_COLOR;
    return ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR;
  };

  const dayMeetings = useMemo(() => {
    const filtered = filterMeetingsForDate(allMeetings, selectedDate, filters);
    return layoutOverlappingMeetings(filtered, MOBILE_MAX_VISIBLE_OVERLAP).map((meeting) => ({
      ...meeting,
      primaryColor: getRoomColor(meeting),
      overflowMeetings: meeting.overflowMeetings?.map((m) => ({ ...m, primaryColor: getRoomColor(m) })),
    }));
  }, [allMeetings, filters, selectedDate]);

  const isToday = formatETDateString(selectedDate) === formatETDateString(new Date());

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);

  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const delta = el.scrollTop - lastScrollTopRef.current;
    if (delta > SCROLL_HIDE_THRESHOLD_PX) {
      setNavHidden(true);
    } else if (delta < -SCROLL_HIDE_THRESHOLD_PX) {
      setNavHidden(false);
    }
    lastScrollTopRef.current = el.scrollTop;
  };

  return (
    <div className={styles.container}>
      <WeekStrip selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
      <CalendarHeader selectedDate={selectedDate} selectedView="Day" isAdmin={isAdmin} />

      <div
        className={styles.scrollArea}
        ref={scrollAreaRef}
        onScroll={handleScroll}
        style={scrollLocked ? { overflow: "hidden" } : undefined}
      >
        <div className={styles.timeColumn}>
          {timeSlots.map((time, index) => (
            <div key={index} className={styles.timeSlot}>
              {time}
            </div>
          ))}
        </div>

        <div className={styles.dayColumnWrapper}>
          <DayColumn
            roomColor={ZOOM_ROOM_COLOR} // Unused fallback: every meeting sets primaryColor via getRoomColor
            meetings={dayMeetings}
            selectedMeetingID={selectedMeetingID}
            setSelectedMeetingID={setSelectedMeetingID}
            setSelectedNewMeeting={setSelectedNewMeeting}
            setAnchorEl={setAnchorEl}
            conflictMids={conflictMids}
          />
          {isToday && (
            <div
              className={styles.currentTimeIndicator}
              style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) * 2}px` }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileCalendarView;
