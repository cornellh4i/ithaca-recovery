import React from "react";
import styles from '../../../../styles/components/atoms/BoxText.module.scss';

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  bgColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  [key: string]: any;
};

const BoxText: React.FC<BoxProps> = ({ boxType, title, bgColor, time, tags }) => {
  return (
    <div
      className={`${styles.box} ${boxType === 'Meeting Block' ? styles.meeting : styles.room}`}
      style={{ backgroundColor: bgColor }}
    >
      <h3 className={styles.title}>{title}</h3>

      {boxType === 'Meeting Block' && <p className={styles.time}>{time}</p>}
      {tags && tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((tag, index) => (
            <span key={index} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default BoxText;