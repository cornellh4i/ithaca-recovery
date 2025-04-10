import React, { useEffect, useState } from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';
import BoxText from '../../atoms/BoxText';
import DailyViewRow from "../../molecules/DailyViewRow";
import { convertUTCToEST } from "../../../../util/timeUtils";

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
  // Step 1: Ensure the date is in EDT and adjust to UTC properly
  
  const localDate = new Date(date);

  // Get the timezone offset for localDate in minutes (difference between local time and UTC)
  const localOffset = localDate.getTimezoneOffset();  // in minutes
  
  // Step 2: Adjust the local date to UTC
  const utcDate = new Date(localDate.getTime() - localOffset * 60000); // subtract offset (milliseconds)
  
  // Step 3: Format the UTC date to a "yyyy-mm-dd" string for API fetching
  const formattedDate = utcDate.toISOString().split('T')[0];  // e.g., '2025-04-09'

  console.log("Formatted date for fetching meetings (in UTC):", formattedDate);
  
  // Check if we already have cached data for the date
  if (meetingCache.has(formattedDate)) {
    console.log("Using cached data for date:", formattedDate);
    return meetingCache.get(formattedDate) || [];
  }

  console.log("Fetching meetings for date:", formattedDate);

  try {
    const response = await fetch(`/api/retrieve/meeting/day?startDate=${formattedDate}`);
    const data = await response.json();
    console.log("Raw API response:", data);

    const groupedRooms: { [key: string]: Meeting[] } = {};
    data.forEach((meeting: any) => {
      const roomName = meeting.room;
      console.log("Processing meeting for room:", roomName);

      if (!groupedRooms[roomName]) {
        groupedRooms[roomName] = [];
      }

      // Convert meeting times (stored in UTC in the API) to EDT for display
      const start = new Date(meeting.startDateTime.replace("Z", ""));
      const end = new Date(meeting.endDateTime.replace("Z", ""));

      console.log(`Start time (before conversion): ${start}, End time (before conversion): ${end}`);
      
      // Convert the UTC times to EDT (local time)
      const startEDT = convertUTCToEST(start.toISOString());  // adjust conversion method as needed
      const endEDT = convertUTCToEST(end.toISOString());  // adjust conversion method as needed

      console.log(`Converted Start Time: ${startEDT}, Converted End Time: ${endEDT}`);

      groupedRooms[roomName].push({
        id: meeting.mid,
        title: meeting.title,
        startTime: startEDT,
        endTime: endEDT,
        tags: [meeting.type, meeting.group],
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

    console.log("Processed room data:", structuredData);

    // Cache the result to avoid unnecessary refetching
    meetingCache.set(formattedDate, structuredData);
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

  function getTodayDate(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  const handleDateChange = async (date: Date) => {
    console.log("Handling date change, selected date:", date);
    const data = await fetchMeetingsByDay(date);
    console.log("Meetings fetched for selected date:", data);
    setMeetings(data);
  };

  const updateTimePosition = () => {
    const now = new Date(selectedDate); // Use selectedDate instead of current date
    console.log("Updating time position based on selected date:", now);
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const position = (currentHour * 60 + currentMinutes) * (155 / 60);
    console.log("Current time position:", position);
    setCurrentTimePosition(position);
  };

  useEffect(() => {
    console.log("Component mounted or selectedDate changed:", selectedDate);
    handleDateChange(selectedDate);
    updateTimePosition();

    const intervalId = setInterval(updateTimePosition, 60000);
    return () => {
      console.log("Clearing interval for time position update");
      clearInterval(intervalId);
    };
  }, [selectedDate]);

  const handleBoxClick = (meetingId: string) => {
    console.log(`Meeting ${meetingId} clicked`);
  };

  const handleRowNotBoxClick = () => {
    // TODO: Check if the target is a BoxText element
    console.log("Grid row clicked");
  };

  const combinedRooms = defaultRooms
    .filter((defaultRoom) => filters[defaultRoom.name.replace(/[-\s]+/g, '').replace(/\s+/g, '')])
    .map((defaultRoom) => {
      const roomWithMeetings = meetings.find((meetingRoom) => meetingRoom.name === defaultRoom.name);
      return roomWithMeetings || { ...defaultRoom, meetings: [] }; 
    });

  console.log("Combined rooms to render:", combinedRooms);

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

        <div className={styles.scrollContainer}>
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
