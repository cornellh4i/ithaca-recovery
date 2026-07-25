import React, { useCallback, useEffect, useState, useRef } from "react";
import styles from '../../../styles/components/organisms/DailyView.module.scss';
import BoxText from '../atoms/BoxText';
import DailyViewRow from "../molecules/DailyViewRow";
import { convertUTCToET, formatETDateString, getETDayBounds } from "../../../util/timeUtils";
import { IMeeting } from "../../../util/models";
import { passesTagFilters, passesRoomFilter, MeetingFilters } from "../../../util/meetingFilters";
import { createCache } from "../../../util/simpleCache";
import { defaultRooms } from "../../../util/rooms";

type Meeting = {
  id: string;
  title: string;
  startTime: string; // clipped to this day, for positioning
  endTime: string; // clipped to this day, for positioning
  displayStartTime: string; // true time, for the label
  displayEndTime: string; // true time, for the label
  tags: string[];
  syncError?: boolean;
};

type Room = {
  name: string;
  primaryColor: string;
  meetings: Meeting[];
};

const dayMeetingCache = createCache<Room[]>();

export const fetchMeetingsByDay = async (date: Date): Promise<Room[]> => {
  const formattedDate = formatETDateString(date); // ET calendar date, e.g. "2025-04-09"

  return dayMeetingCache.getOrFetch(formattedDate, async () => {
    try {
      const response = await fetch(`/api/retrieve/meeting/day?startDate=${formattedDate}`);
      const data: IMeeting[] = await response.json();
      console.log("[DailyView] Raw API response for", formattedDate, ":", data);

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

        const startEDT = convertUTCToET(startUTC.toISOString());
        const endEDT = convertUTCToET(endUTC.toISOString());

        const meetingEntry: Meeting = {
          id: meeting.mid,
          title: meeting.title,
          startTime: startEDT,
          endTime: endEDT,
          displayStartTime: convertUTCToET(new Date(meeting.trueStartDateTime).toISOString()),
          displayEndTime: convertUTCToET(new Date(meeting.trueEndDateTime).toISOString()),
          tags: [...meeting.calType, meeting.modeType],
          syncError: meeting.syncStatus === 'error' || meeting.zoomSyncStatus === 'error',
        };

        // A Hybrid meeting occupies both its physical room and its Zoom room;
        // Remote only has a Zoom room, In Person only has a physical room.
        const roomNames: string[] = [meeting.room, meeting.zoomRoom].filter(
          (room): room is string => Boolean(room)
        );
        roomNames.forEach((roomName: string) => {
          if (!groupedRooms[roomName]) {
            groupedRooms[roomName] = [];
          }
          groupedRooms[roomName].push(meetingEntry);
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
      console.error("[DailyView] Error fetching meetings for", formattedDate, ":", error instanceof Error ? error.message : String(error));
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

interface DailyViewProps {
  filters: MeetingFilters;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  refreshTrigger?: number;
}

const DailyView: React.FC<DailyViewProps> = ({
  filters,
  selectedDate,
  selectedMeetingID,
  setSelectedMeetingID,
  setSelectedNewMeeting,
  setAnchorEl,
  refreshTrigger = 0
}) => {
  const [currentTimePosition, setCurrentTimePosition] = useState(0);
  const [meetings, setMeetings] = useState<Room[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Guards against out-of-order responses: rapid date/filter changes can fire overlapping
  // fetches, and without this a slower-but-stale response can overwrite a newer one.
  const fetchRequestIdRef = useRef(0);

  // Ref instead of a `selectedDate` closure/dependency so fetchData's identity stays
  // stable across date changes — needed so the refreshTrigger effect below doesn't fire
  // an extra forced fetch every time the date changes (see that effect's comment).
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const updateTimePosition = useCallback(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const position = (currentHour * 60 + currentMinutes) * (155 / 60);
    setCurrentTimePosition(position);
  }, []);

  const scrollToCurrentTime = useCallback(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
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

  useEffect(() => {
    fetchData();
    scrollToCurrentTime();

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

  // filter meetings based on meeting type and room filters
  const filterMeetings = (room: Room): Room => ({
    ...room,
    meetings: room.meetings.filter(meeting => passesTagFilters(meeting.tags, filters)),
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
      <div className={styles.viewContainer}>
        <div className={styles.roomContainer}>
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

        <div ref={scrollContainerRef} className={styles.scrollContainer}>
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
                    setSelectedNewMeeting={setSelectedNewMeeting}
                    setAnchorEl={setAnchorEl}
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

export default DailyView;