import React from "react";
import styles from '../../../../styles/organisms/DailyView.module.scss';

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12; // Convert to 12-hour format
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 8 }, (_, i) => formatTime(7 + i)); // Time labels from 7 AM to 3 PM

const DailyView: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.timeLabels}>
        <div className={styles.timeHeader}></div>
        {timeSlots.map((time) => (
          <div key={time} className={styles.timeSlot}>
            {time}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.roomColumn}></div>
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className={styles.gridCell}></div>
        ))}
      </div>
    </div>
  );
};

export default DailyView;
