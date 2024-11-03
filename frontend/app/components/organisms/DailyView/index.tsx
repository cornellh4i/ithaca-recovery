import React from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';
import BoxText from '../../atoms/BoxText';

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12; // Convert to 12-hour format
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

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

        {rooms.map((_, rowIndex) => (
          <div key={rowIndex} className={styles.gridRow}>
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
