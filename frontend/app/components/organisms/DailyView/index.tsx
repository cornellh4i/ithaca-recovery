import React, { useEffect, useState, useRef } from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';
import BoxText from '../../atoms/BoxText';
import DailyViewRow from "../../molecules/DailyViewRow";
import { convertUTCToET } from "../../../../util/timeUtils";

type Meeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  tags: string[];
};

type Room = {
  name: string;
  primaryColor: string;
  meetings: Meeting[];
};

const meetingCache = new Map<string, Room[]>();

const fetchMeetingsByDay = async (date: Date): Promise<Room[]> => {
  // Step 1: Format the date in local time (EDT) to ensure correct calendar day
  const formattedDate = date.toLocaleDateString("en-CA"); // e.g., "2025-04-09"

  if (meetingCache.has(formattedDate)) {
    return meetingCache.get(formattedDate) || [];
  }
  try {
    const response = await fetch(`/api/retrieve/meeting/day?startDate=${formattedDate}`);
    const data = await response.json();
    console.log("Raw API response:", data);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const clipped: IMeeting[] = data.flatMap(meeting => {
      const start = new Date(meeting.startDateTime);
      const end   = new Date(meeting.endDateTime);

      // Case 1: meeting spans into today from before; start it at 12:00 AM today
      if (start < dayStart && end > dayStart) {
        return [{
          ...meeting,
          startDateTime: dayStart.toISOString(),
          endDateTime:   end < dayEnd ? meeting.endDateTime : dayEnd.toISOString(),
        }];
      }
      // Case 2: starts today, goes past midnight; end it at 11:59 PM today
      if (start < dayEnd && end > dayEnd) {
        return [{
          ...meeting,
          startDateTime: meeting.startDateTime,
          endDateTime:   dayEnd.toISOString(),
        }];
      }
      // Case 3: fully inside today
      if (start >= dayStart && end <= dayEnd) {
        return [meeting];
      }
      return [];
    });

    const groupedRooms: { [key: string]: Meeting[] } = {};

    clipped.forEach((meeting: any) => {
      const roomName = meeting.room;
      if (!groupedRooms[roomName]) {
        groupedRooms[roomName] = [];
      }

      // Convert meeting times from UTC to EDT for display
      const startUTC = new Date(meeting.startDateTime);
      const endUTC = new Date(meeting.endDateTime);

      const startEDT = convertUTCToET(startUTC.toISOString());
      const endEDT = convertUTCToET(endUTC.toISOString());

      groupedRooms[roomName].push({
        id: meeting.mid,
        title: meeting.title,
        startTime: startEDT,
        endTime: endEDT,
        tags: [meeting.calType, meeting.modeType],
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
    console.error("Error fetching meetings:", error);
    return [];
  }
};



const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

// Default room layout
const defaultRooms = [
  { name: 'Serenity Room', primaryColor: '#b3ea75' },
  { name: 'Seeds of Hope', primaryColor: '#f7e57b' },
  { name: 'Unity Room', primaryColor: '#96dbfe' },
  { name: 'Room for Improvement', primaryColor: '#ffae73' },
  { name: 'Small but Powerful - Right', primaryColor: '#d2afff' },
  { name: 'Small but Powerful - Left', primaryColor: '#ffa3c2' },
  { name: 'Zoom Account 1', primaryColor: '#cecece' },
  { name: 'Zoom Account 2', primaryColor: '#cecece' },
  { name: 'Zoom Account 3', primaryColor: '#cecece' },
  { name: 'Zoom Account 4', primaryColor: '#cecece' },
];

interface DailyViewProps {
  filters: any;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
}

const DailyView: React.FC<DailyViewProps> = ({ filters, selectedDate, setSelectedDate, setSelectedMeetingID, setSelectedNewMeeting }) => {
  const [currentTimePosition, setCurrentTimePosition] = useState(0);
  const [meetings, setMeetings] = useState<Room[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  function getTodayDate(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  const handleDateChange = async (selected: Date) => {
    const adjustedDate = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate()
    ); // this creates local midnight
  
    const data = await fetchMeetingsByDay(adjustedDate);
    setMeetings(data);
  };

  const updateTimePosition = () => {
    const now = new Date(selectedDate); // Use selectedDate instead of current date
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const position = (currentHour * 60 + currentMinutes) * (155 / 60);
    setCurrentTimePosition(position);
  };
  const scrollToCurrentTime = () => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();

      // Calculate the scroll position - set it slightly to the left of the current time
      // to ensure the current time is visible with some context
      const scrollOffset = (currentHour * 155) - 300; // 155px per hour, scroll 300px to the left for context

      // Ensure we don't scroll to a negative position
      const scrollPosition = Math.max(0, scrollOffset);

      scrollContainerRef.current.scrollLeft = scrollPosition;
    }
  };
  useEffect(() => {
    handleDateChange(selectedDate);
    updateTimePosition();

    // Set up interval for updating time position
    const intervalId = setInterval(updateTimePosition, 60000);
    // Scroll to current time after the component has fully rendered and data is loaded
    const timeoutId = setTimeout(() => {
      scrollToCurrentTime();
    }, 300); // Small delay to ensure content is rendered

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [selectedDate]);

  // Dummy function for onClick prop
  const handleBoxClick = (meetingId: string) => {
    console.log(`Meeting ${meetingId} clicked`);
  };

  const handleRowNotBoxClick = () => {
    // TODO: Check if the target is a BoxText element
    console.log("Grid row clicked");
  };

  // filter meetings based on meeting type and room filters
  const filterMeetings = (room: Room): Room => {
    // filter meetings based on  tags (meeting type)
    const filteredMeetings = room.meetings.filter(meeting => {
      // check if all tags for this meeting are enabled in filters
      return meeting.tags.every(tag => {
        // normalize tag name to match filter names (removing spaces and special chars)
        const normalizedTag = tag.replace(/[-\s]+/g, '').replace(/\s+/g, '');
        // ff filter for this tag exists and is true, or if filter doesn't exist, keep the meeting
        return filters[normalizedTag] !== false;
      });
    });

    // return the room with filtered meetings
    return {
      ...room,
      meetings: filteredMeetings
    };
  };

  // First filter rooms by room name, then filter meetings within each room by meeting type
  const combinedRooms = defaultRooms
    .filter((defaultRoom) => {
      const normalizedRoomName = defaultRoom.name.replace(/[-\s]+/g, '').replace(/\s+/g, '');
      return filters[normalizedRoomName] !== false;
    })
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
                onClick={handleBoxClick}
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

          {combinedRooms.map((room, rowIndex) => (
            <div key={rowIndex} className={styles.gridRow} onClick={handleRowNotBoxClick}>
              <div className={styles.gridMeetingRow}>
                <DailyViewRow roomColor={room.primaryColor} meetings={room.meetings} setSelectedMeetingID={setSelectedMeetingID} setSelectedNewMeeting={setSelectedNewMeeting}/>
              </div>
              {timeSlots.map((_, colIndex) => (
                <div key={colIndex} className={styles.gridCell}></div>
              ))}
              <div
                className={styles.currentTimeLine}
                style={{ left: `${currentTimePosition}px` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyView;