import React from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';
import BoxText from '../../atoms/BoxText';
import DailyViewRow from "../../molecules/DailyViewRow";

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12; 
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

// Dummy Data
const rooms = [
    { name: 'Serenity Room', primaryColor: '#b3ea75', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Seeds of Hope', primaryColor: '#f7e57b', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Unity Room', primaryColor: '#96dbfe', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Room for Improvement', primaryColor: '#ffae73', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Small but Powerful - Right', primaryColor: '#d2afff', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Small but Powerful - Left', primaryColor: '#ffa3c2', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Zoom Email 1', primaryColor: '#cecece', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Zoom Email 2', primaryColor: '#cecece', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Zoom Email 3', primaryColor: '#cecece', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
    { name: 'Zoom Email 4', primaryColor: '#cecece', meetings: [{ title: 'Meeting 1', startTime: '7:00', endTime: '8:00', tags: ['AA', 'Hybrid'] }] },
];

const DailyView: React.FC = () => {
  return (
    <div className={styles.outerContainer}>
      <div className={styles.roomContainer}>
        {rooms.map((room, index) => (
          <div key={index} className={styles.roomColumn}>
            <BoxText boxType="Room Block" title={room.name} primaryColor={room.primaryColor} />
          </div>
        ))}
      </div>

      <div className={styles.scrollContainer}>
        <div className={styles.headerRow}>
          {timeSlots.map((time, index) => (
            <div key={index} className={styles.timeLabel}>{time}</div>
          ))}
        </div>

        {rooms.map((room, rowIndex) => (
          <div key={rowIndex} className={styles.gridRow}>
            <div className={styles.gridMeetingRow}>
              <DailyViewRow roomColor={room.primaryColor} meetings={room.meetings} />
            </div>
            {timeSlots.map((_, colIndex) => (
              <div key={colIndex} className={styles.gridCell}></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DailyView;
