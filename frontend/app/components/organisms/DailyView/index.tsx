import React from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';
import BoxText from '../../atoms/BoxText';

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12; // Convert to 12-hour format
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 9 }, (_, i) => formatTime(7 + i)); 

const rooms = [
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
  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div className={styles.roomColumn}></div>
        {timeSlots.map((time, index) => (
          <div key={index} className={styles.timeLabel}>
            {time}
          </div>
        ))}
      </div>

      {rooms.map((room, index) => (
        <div key={index} className={styles.gridRow}>
          <div className={styles.roomColumn}>
            <BoxText
              boxType="Room Block"
              title={room.name}
              primaryColor={room.primaryColor}
            />
          </div>
          {timeSlots.map((_, timeIndex) => (
            <div key={timeIndex} className={styles.gridCell}></div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default DailyView;
