import React, { useEffect, useState } from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';
import BoxText from '../../atoms/BoxText';
import DailyViewRow from "../../molecules/DailyViewRow";

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
  const formattedDate = date.toISOString().split('T')[0];

  if (meetingCache.has(formattedDate)) {
    return meetingCache.get(formattedDate)!;
  }

  const response = await fetch(`/api/retrieve/meeting/day?date=${formattedDate}`);
  const data = await response.json();

  const groupedRooms: { [key: string]: Meeting[] } = {};
  data.forEach((meeting: any) => {
    const roomName = meeting.room;
    if (!groupedRooms[roomName]) {
      groupedRooms[roomName] = [];
    }

    const start = new Date(meeting.startDateTime.replace("Z", ""));
    const end = new Date(meeting.endDateTime.replace("Z", ""));

    groupedRooms[roomName].push({
      id: meeting._id,
      title: meeting.title,
      startTime: start.toLocaleTimeString('en-GB', { hour12: false }),
      endTime: end.toLocaleTimeString('en-GB', { hour12: false }),
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

  meetingCache.set(formattedDate, structuredData);
  return structuredData;
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
  { name: 'Zoom Email 1', primaryColor: '#cecece' },
  { name: 'Zoom Email 2', primaryColor: '#cecece' },
  { name: 'Zoom Email 3', primaryColor: '#cecece' },
  { name: 'Zoom Email 4', primaryColor: '#cecece' },
];

const DailyView: React.FC = () => {
  const [currentTimePosition, setCurrentTimePosition] = useState(0);
  const [meetings, setMeetings] = useState<Room[]>([]);
  const [currentDate, setCurrentDate] = useState(getTodayDate());

  function getTodayDate(): Date {
    return new Date();
  }

  const handleDateChange = async (date: Date) => {
    const data = await fetchMeetingsByDay(date);
    setMeetings(data);
    setCurrentDate(date);
  };

  const updateTimePosition = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const position = (currentHour * 60 + currentMinutes) * (155 / 60);
    setCurrentTimePosition(position);
  };

  const handlePreviousDay = () => {
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    handleDateChange(prevDate);
  };

  const handleNextDay = () => {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    handleDateChange(nextDate);
  };

  useEffect(() => {
    handleDateChange(currentDate);
    updateTimePosition();

    const intervalId = setInterval(updateTimePosition, 60000);
    return () => clearInterval(intervalId);
  }, [currentDate]);
  
  // Dummy function for onClick prop
  const handleBoxClick = (meetingId: string) => {
    console.log(`Meeting ${meetingId} clicked`);
  };

  const combinedRooms = defaultRooms.map((defaultRoom) => {
    const roomWithMeetings = meetings.find((meetingRoom) => meetingRoom.name === defaultRoom.name);
    return roomWithMeetings || { ...defaultRoom, meetings: [] }; 
  });

  console.log(meetings)

  return (
    <div className={styles.outerContainer}>
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
          <div key={rowIndex} className={styles.gridRow}>
            <div className={styles.gridMeetingRow}>
              <DailyViewRow roomColor={room.primaryColor} meetings={room.meetings} />
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
  );
};

export default DailyView;
