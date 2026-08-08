import React, { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import styles from '../../../../styles/components/calendar/desktop/DayView.module.scss';
import BoxText from '../../atoms/BoxText';
import DailyViewRow from "./DailyViewRow";
import { formatETDateString, getCurrentETMinutesSinceMidnight, getETDayBounds } from "../../../../util/date/timeUtils";
import { IMeeting } from "../../../../types/models";
import { passesTagFilters, passesRoomFilter, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { createCache } from "../../../../util/common/simpleCache";
import { defaultRooms } from "../../../../util/rooms/rooms";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../../util/meetings/meetingOverlapLayout";

interface Meeting extends OverlapMeeting {
  syncError?: boolean;
}

type Room = {
  name: string;
  primaryColor: string;
  meetings: Meeting[];
};

const dayMeetingCache = createCache<Room[]>();

// Extracts ET wall-clock time as "HH:MM" (24hr) -- the format layoutOverlappingMeetings'
// clustering math (and WeekView's equivalent startTime/endTime) expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export const fetchMeetingsByDay = async (date: Date): Promise<Room[]> => {
  const formattedDate = formatETDateString(date); // ET calendar date, e.g. "2025-04-09"

  return dayMeetingCache.getOrFetch(formattedDate, async () => {
    try {
      const response = await fetch(`/api/retrieve/meeting/day?startDate=${formattedDate}`);
      const data: IMeeting[] = await response.json();
      console.log("[DayView] Raw API response for", formattedDate, ":", data);

      // ET day boundaries, not local-timezone midnight — the backend selected meetings
      // using ET day bounds, so clipping must line up with the same boundaries.
      const [dayStart, dayEnd] = getETDayBounds(formattedDate);

      // Clipping replaces startDateTime/endDateTime with this day's bounds for positioning —
      // trueStartDateTime/trueEndDateTime keep the actual times, for the label below.
      const clipped = data.flatMap(meeting => {
        const start = new Date(meeting.startDateTime);
        const end = new Date(meeting.endDateTime);
        const trueStartDateTime = meeting.startDateTime;
        const trueEndDateTime = meeting.endDateTime;

        //Case 1: Meeting spans into today from before; start it at 12:00 AM today
        if (start < dayStart && end > dayStart) {
          return [{
            ...meeting,
            startDateTime: dayStart,
            endDateTime: end < dayEnd ? meeting.endDateTime : dayEnd,
            trueStartDateTime,
            trueEndDateTime,
          }];
        }

        //Case 2: Meeting starts today, goes past midnight; end it at 11:59 PM today
        if (start < dayEnd && end > dayEnd) {
          return [{
            ...meeting,
            startDateTime: meeting.startDateTime,
            endDateTime: dayEnd,
            trueStartDateTime,
            trueEndDateTime,
          }];
        }

        //Case 3: Fully inside today
        if (start >= dayStart && end <= dayEnd) {
          return [{ ...meeting, trueStartDateTime, trueEndDateTime }];
        }
        return [];
      })

      const groupedRooms: { [key: string]: Meeting[] } = {};

      clipped.forEach((meeting: IMeeting & { trueStartDateTime: Date; trueEndDateTime: Date }) => {
        // Convert meeting times from UTC to EDT for display
        const startUTC = new Date(meeting.startDateTime);
        const endUTC = new Date(meeting.endDateTime);

        const startEDT = etTimeFmt.format(startUTC);
        const endEDT = etTimeFmt.format(endUTC);

        const meetingEntry = {
          id: meeting.mid,
          title: meeting.title,
          startTime: startEDT,
          endTime: endEDT,
          displayStartTime: etTimeFmt.format(new Date(meeting.trueStartDateTime)),
          displayEndTime: etTimeFmt.format(new Date(meeting.trueEndDateTime)),
          date: formattedDate,
          tags: [...meeting.calType, meeting.modeType],
          syncError: meeting.googleSyncStatus === 'error' || meeting.zoomSyncStatus === 'error',
        };

        // A Hybrid meeting occupies both its physical room and its Zoom room; In Person
        // only has a physical room. Remote has neither (util/rooms.ts's defaultRooms has
        // no per-room Zoom pairing for it -- there's nothing to auto-select) so it's
        // bucketed into the virtual "Remote" room instead, or it would never render here.
        const roomNames: string[] = meeting.modeType === "Remote"
          ? ["Remote"]
          : [meeting.room, meeting.zoomRoom].filter(
              (room): room is string => Boolean(room)
            );
        roomNames.forEach((roomName: string) => {
          if (!groupedRooms[roomName]) {
            groupedRooms[roomName] = [];
          }
          // Own copy per room bucket -- a Hybrid meeting appears in both its physical
          // room and Zoom room rows, and each row lays out overlap independently, so
          // they can't share one `room` field value.
          groupedRooms[roomName].push({ ...meetingEntry, room: roomName });
        });
      });

      const structuredData: Room[] = Object.keys(groupedRooms).map((roomName) => {
        const defaultRoom = defaultRooms.find((r) => r.name === roomName);
        return {
          name: roomName,
          primaryColor: defaultRoom?.primaryColor || "#ffffff",
          meetings: groupedRooms[roomName],
        };
      });

      return structuredData;
    } catch (error) {
      // error objects don't serialize over CDP -- log the message directly so it's
      // actually visible in the piped-through e2e console output.
      console.error("[DayView] Error fetching meetings for", formattedDate, ":", error instanceof Error ? error.message : String(error));
      return [];
    }
  });
};

// Function to invalidate the cache for a specific date
export const invalidateCache = (date: Date) => {
  dayMeetingCache.invalidate(formatETDateString(date));
};

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

interface DayViewProps {
  filters: MeetingFilters;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  selectedOccurrenceDate?: Date | null;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  setLastClickedDate?: (date: Date) => void;
  refreshTrigger?: number;
  // Disables scrolling this view while the ViewMeeting popup is open -- it's anchored to
  // the clicked box's on-screen position, so scrolling underneath it while open just
  // fights the popup's own reposition-on-scroll logic instead of being useful.
  scrollLocked?: boolean;
  // Admin-only (see hooks/useConflictMids) -- mids of meetings with an unresolved
  // room/zoomRoom/zoomHost conflict, for the card's conflict badge. Omitted entirely by
  // /signage's public kiosk render, which defaults to no badges ever showing.
  conflictMids?: Set<string>;
}

const DayView: React.FC<DayViewProps> = ({
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
  const [currentTimePosition, setCurrentTimePosition] = useState(0);
  const [meetings, setMeetings] = useState<Room[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Guards against out-of-order responses: rapid date/filter changes can fire overlapping
  // fetches, and without this a slower-but-stale response can overwrite a newer one.
  const fetchRequestIdRef = useRef(0);

  // Ref instead of a `selectedDate` closure/dependency so fetchData's identity stays
  // stable across date changes — needed so the refreshTrigger effect below doesn't fire
  // an extra forced fetch every time the date changes (see that effect's comment). Synced
  // inside the useLayoutEffect below (not a separate useEffect) -- layout effects always
  // run before passive effects regardless of declaration order, so a separate useEffect
  // here would sync the ref *after* that layout effect's fetchData() already read it.
  const selectedDateRef = useRef(selectedDate);

  // ET wall-clock, not the browser's local timezone -- meeting boxes are positioned via
  // timeToPixels() against their ET-clipped startTime (see DailyViewRow.tsx), so a viewer
  // whose local zone isn't ET (any CI runner, or any real user outside America/New_York)
  // would otherwise draw this line at the wrong x-position relative to the boxes it's
  // supposed to line up with.
  const updateTimePosition = useCallback(() => {
    const position = getCurrentETMinutesSinceMidnight() * (155 / 60);
    setCurrentTimePosition(position);
  }, []);

  const scrollToCurrentTime = useCallback(() => {
    if (scrollContainerRef.current) {
      const currentHour = Math.floor(getCurrentETMinutesSinceMidnight() / 60);
      const scrollOffset = (currentHour * 155) - 300;
      const scrollPosition = Math.max(0, scrollOffset);
      scrollContainerRef.current.scrollLeft = scrollPosition;
    }
  }, []);

  const fetchData = useCallback(async (forceFetch = false) => {
    // Clear the entire cache so stale data on other dates is also dropped.
    if (forceFetch) {
      dayMeetingCache.clear();
    }

    const requestId = ++fetchRequestIdRef.current;
    const data = await fetchMeetingsByDay(selectedDateRef.current);
    if (requestId === fetchRequestIdRef.current) {
      setMeetings(data);
      updateTimePosition();
    }
  }, [updateTimePosition]);

  // Gates .viewContainer's visibility until the very first scroll-to-current-time
  // completes -- without this there's a beat of the wrong scroll position visible before JS
  // jumps it to "now". One-way: only ever flips true once, on this view's first mount --
  // later date changes reset scroll position same as always but don't re-hide already-
  // visible content.
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  // useLayoutEffect (not useEffect) so the scroll jump happens before paint.
  useLayoutEffect(() => {
    selectedDateRef.current = selectedDate;
    fetchData();
    scrollToCurrentTime();
    setInitialScrollDone(true);

    const intervalId = setInterval(updateTimePosition, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedDate, fetchData, scrollToCurrentTime, updateTimePosition]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      console.log("Refreshing calendar due to trigger change:", refreshTrigger);
      fetchData(true); // Force fetch (invalidate cache)
    }
  }, [refreshTrigger, fetchData]);

  // filter meetings based on meeting type and room filters, then lay out any that overlap
  // in time within this room (stacked top/bottom, capped at 2, folded into a "+N" beyond that)
  const filterMeetings = (room: Room): Room => ({
    ...room,
    meetings: layoutOverlappingMeetings(
      room.meetings.filter(meeting => passesTagFilters(meeting.tags, filters))
    ),
  });

  // First filter rooms by room name, then filter meetings within each room by meeting type
  const combinedRooms = defaultRooms
    .filter((defaultRoom) => passesRoomFilter(defaultRoom.name, filters))
    .map((defaultRoom) => {
      const roomWithMeetings = meetings.find((meetingRoom) => meetingRoom.name === defaultRoom.name);
      if (roomWithMeetings) {
        // Apply meeting type filters to the meetings in this room
        return filterMeetings(roomWithMeetings);
      } else {
        return { ...defaultRoom, meetings: [] };
      }
    });

  return (
    <div className={styles.outerContainer}>
      <div
        ref={scrollContainerRef}
        className={styles.viewContainer}
        style={{
          ...(scrollLocked ? { overflow: 'hidden' } : undefined),
          visibility: initialScrollDone ? 'visible' : 'hidden',
        }}
      >
        <div className={styles.roomContainer}>
          <div className={styles.roomCorner} />
          {combinedRooms.map((room, index) => (
            <div key={index} className={styles.roomColumn}>
              <BoxText
                boxType="Room Block"
                title={room.name}
                primaryColor={room.primaryColor}
                meetingId={room.meetings[0]?.id || ""}
                // onClick={() => handleMeetingChange(room.meetings[0]?.id || "")}
                onClick={() => console.log(`Clicked on room: ${room.name}`)}
              />
            </div>
          ))}
        </div>

        <div className={styles.scrollContainer}>
          <div className={styles.headerRow}>
            {timeSlots.map((time, index) => (
              <div key={index} className={styles.timeLabel}>{time}</div>
            ))}
          </div>

          {combinedRooms.map((room, rowIndex) => {
            const isToday = formatETDateString(selectedDate) === formatETDateString(new Date());
            return (
              <div key={rowIndex} className={styles.gridRow}>
                <div className={styles.gridMeetingRow}>
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
                  />
                </div>
                {timeSlots.map((_, colIndex) => (
                  <div key={colIndex} className={styles.gridCell}></div>
                ))}
                {isToday && (
                  <div
                    className={styles.currentTimeLine}
                    style={{ left: `${currentTimePosition}px` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DayView;