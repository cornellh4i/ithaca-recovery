import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "../../../../styles/components/calendar/mobile/DayLandscapeView.module.scss";
import DailyViewRow from "../desktop/DailyViewRow";
import { fetchMeetingsByDay, invalidateCache } from "../desktop/DayView";
import { formatETDateString, getCurrentETMinutesSinceMidnight } from "../../../../util/timeUtils";
import { passesTagFilters, passesRoomFilter, MeetingFilters } from "../../../../util/meetingFilters";
import { defaultRooms } from "../../../../util/rooms";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../../util/meetingOverlapLayout";
import { useElementWidth } from "../../../../hooks/useElementWidth";

interface Meeting extends OverlapMeeting {
  syncError?: boolean;
}

type Room = {
  name: string;
  primaryColor: string;
  meetings: Meeting[];
};

// 7:00-21:00 -- the hours the recovery center actually runs meetings in, per the design
// handoff. A landscape phone's 390-ish px of height has no room for the full 24-hour day
// DayView/WeekView show, and there's nothing to see outside these hours anyway.
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Only 1 meeting ever shows per room/time slot -- at this row height there's no room for a
// second stacked lane, so any overlap folds straight into the "+N" pill (DailyViewRow already
// supports this via layoutOverlappingMeetings' maxVisibleOverlap param).
const MAX_VISIBLE_OVERLAP = 1;

// Fixed regardless of measured width -- only the hour axis (below) compresses to fit, per the
// single-axis design (see the mobile-landscape plan's "One more round after trying the
// artifact" note): letting the room column's own width vary too would reintroduce a second
// axis of layout shifting for no benefit, since 12 room names truncate at any reasonable width.
const ROOM_COL_WIDTH = 72;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 22;

const formatHour = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}${period}`;
};

interface DayLandscapeViewProps {
  filters: MeetingFilters;
  selectedDate: Date;
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  selectedOccurrenceDate?: Date | null;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  setLastClickedDate?: (date: Date) => void;
  refreshTrigger?: number;
  scrollLocked?: boolean;
  conflictMids?: Set<string>;
}

// Landscape phone's default view (see mobile/MultiDayLandscapeView for the alternate):
// reuses desktop DayView's per-room grouping and DailyViewRow's row-stack rendering wholesale
// -- rooms as horizontal rows, a sticky time header on top, at BoxText's subcompact tier. The
// only axis that ever scrolls is the room axis (vertical); the hour axis always compresses to
// fit the measured width instead, so there's never a competing horizontal drag to fight the
// vertical one on a small touchscreen.
const DayLandscapeView: React.FC<DayLandscapeViewProps> = ({
  filters,
  selectedDate,
  selectedMeetingID,
  setSelectedMeetingID,
  selectedOccurrenceDate,
  setSelectedNewMeeting,
  setAnchorEl,
  setLastClickedDate,
  refreshTrigger = 0,
  scrollLocked = false,
  conflictMids,
}) => {
  const [meetings, setMeetings] = useState<Room[]>([]);
  const [currentTimePosition, setCurrentTimePosition] = useState<number | null>(null);
  const [scrollAreaRef, scrollAreaWidth] = useElementWidth<HTMLDivElement>();
  // ResizeObserver's initial callback can lag the first paint by a frame -- clamp to a
  // sensible minimum so the very first render doesn't briefly divide by a near-zero width.
  const hourWidth = Math.max((scrollAreaWidth - ROOM_COL_WIDTH) / HOURS.length, 1);

  const selectedDateRef = useRef(selectedDate);
  const fetchRequestIdRef = useRef(0);

  const updateTimePosition = useCallback(() => {
    const minutesSinceMidnight = getCurrentETMinutesSinceMidnight();
    const hour = minutesSinceMidnight / 60;
    if (hour < START_HOUR || hour > END_HOUR) {
      setCurrentTimePosition(null);
      return;
    }
    setCurrentTimePosition((minutesSinceMidnight - START_HOUR * 60) * (hourWidth / 60));
  }, [hourWidth]);

  const fetchData = useCallback(async (forceFetch = false) => {
    if (forceFetch) {
      invalidateCache(selectedDateRef.current);
    }
    const requestId = ++fetchRequestIdRef.current;
    const data = await fetchMeetingsByDay(selectedDateRef.current);
    if (requestId === fetchRequestIdRef.current) {
      setMeetings(data);
    }
  }, []);

  useLayoutEffect(() => {
    selectedDateRef.current = selectedDate;
    fetchData();
  }, [selectedDate, fetchData]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData(true);
    }
  }, [refreshTrigger, fetchData]);

  useEffect(() => {
    updateTimePosition();
    const intervalId = setInterval(updateTimePosition, 60000);
    return () => clearInterval(intervalId);
  }, [updateTimePosition]);

  const isToday = formatETDateString(selectedDate) === formatETDateString(new Date());

  const combinedRooms = defaultRooms
    .filter((defaultRoom) => passesRoomFilter(defaultRoom.name, filters))
    .map((defaultRoom) => {
      const roomWithMeetings = meetings.find((m) => m.name === defaultRoom.name);
      const roomMeetings = roomWithMeetings?.meetings.filter((m) => passesTagFilters(m.tags, filters)) ?? [];
      return {
        name: defaultRoom.name,
        primaryColor: defaultRoom.primaryColor,
        meetings: layoutOverlappingMeetings(roomMeetings, MAX_VISIBLE_OVERLAP),
      };
    });

  return (
    <div className={styles.outerContainer}>
      <div
        className={styles.scrollArea}
        ref={scrollAreaRef}
        style={scrollLocked ? { overflow: "hidden" } : undefined}
      >
        <div className={styles.headerRow}>
          <div className={styles.headerCorner} style={{ width: ROOM_COL_WIDTH }} />
          {HOURS.map((hour) => (
            <div key={hour} className={styles.hourLabel} style={{ width: hourWidth }}>
              {formatHour(hour)}
            </div>
          ))}
        </div>

        <div className={styles.rowsContainer}>
          {isToday && currentTimePosition !== null && (
            <div
              className={styles.currentTimeLine}
              style={{ left: ROOM_COL_WIDTH + currentTimePosition }}
            />
          )}
          {combinedRooms.map((room) => (
            <div key={room.name} className={styles.roomRow} style={{ height: ROW_HEIGHT }}>
              <div className={styles.roomLabel} style={{ width: ROOM_COL_WIDTH }}>
                <span className={styles.roomDot} style={{ backgroundColor: room.primaryColor }} />
                {room.name}
              </div>
              <div className={styles.roomContent}>
                <DailyViewRow
                  roomColor={room.primaryColor}
                  meetings={room.meetings}
                  selectedMeetingID={selectedMeetingID}
                  setSelectedMeetingID={setSelectedMeetingID}
                  selectedOccurrenceDate={selectedOccurrenceDate}
                  setSelectedNewMeeting={setSelectedNewMeeting}
                  setAnchorEl={setAnchorEl}
                  columnDate={selectedDate}
                  setLastClickedDate={setLastClickedDate}
                  conflictMids={conflictMids}
                  hourWidth={hourWidth}
                  rowHeight={ROW_HEIGHT}
                  startHour={START_HOUR}
                  tier="subcompact"
                  uniformHeight
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DayLandscapeView;
