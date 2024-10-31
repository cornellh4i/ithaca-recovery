import React from 'react'
import styles from '../../../../styles/ViewMeeting.module.scss';

type ViewMeetingDetailsProps = {
  title: string;
  setting: string;
  date: string;
  time: string;
  recurrence?: string;
  calendar: string;
  location: string;
  zoomAccount: number;
  zoomLink: string;
  pandaDocsName: string;
  pandaDocsSize: string;
  pandaDocsLink: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const ViewMeetingDetails: React.FC<ViewMeetingDetailsProps> = ({
  title,
  setting,
  date,
  time,
  recurrence,
  calendar,
  location,
  zoomAccount,
  zoomLink,
  pandaDocsName,
  pandaDocsSize,
  pandaDocsLink,
  onBack,
  onEdit,
  onDelete,
}) => {
  return (
    <div className={styles.meetingDetails}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>←</button>
        <h1>{title}</h1>
        <span className={styles.settingLabel}>{setting}</span>
        <div className={styles.moreOptions}>
          <button>⋮</button>
          <div className={styles.optionsMenu}>
            <button onClick={onEdit}>Edit Meeting</button>
            <button onClick={onDelete}>Delete Meeting</button>
          </div>
        </div>
      </div>
      <div className={styles.details}>
        <p style={{ color: 'gray' }}>📅 {date}</p>
        <p style={{ color: 'gray' }}>🕒 {time}</p>
        {recurrence && <p>{recurrence}</p>}
        <hr className={styles.divider} />

        <p><strong>Calendar:</strong>&nbsp;{calendar}</p>
        <p><strong>Location:</strong>&nbsp;{location}</p>
        <p><strong>Zoom Account:</strong>&nbsp;{zoomAccount}</p>
        <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}>
        🎥 {zoomLink}
        </a>
        <p><strong>PandaDocs Form</strong></p>
        <div className={styles.pandaDocs}>

          <a href={pandaDocsLink} download className={styles.pandaDocsLink}>
            <div className={styles.docsEmoji}>📄</div>
            <div className={styles.pandaDocsText}>
              <div className={styles.pandaDocsName}>{pandaDocsName}</div>
              <div className={styles.pandaDocsSize}>{pandaDocsSize}</div>
            </div>
            <div className={styles.downloadEmoji}>📥</div>
          </a>
        </div>

        <hr className={styles.divider} />

        <p className={styles.placeholderText}>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
        </p>
        <hr className={styles.divider} />

      </div>
    </div>
  );
};

export default ViewMeetingDetails;
