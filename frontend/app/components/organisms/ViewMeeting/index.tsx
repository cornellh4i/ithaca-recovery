import React from 'react'
import styles from '../../../../styles/ViewMeeting.module.scss';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';

type ViewMeetingDetailsProps = {
  id: string; // Maps to 'id' in the model (ObjectId, but treated as string here)
  mid: string; // Maps to 'mid' in the model
  title: string; // Maps to 'title' in the model
  description?: string; // Maps to 'description' in the model
  creator: string; // Maps to 'creator' in the model
  group: string; // Maps to 'group' in the model
  startDateTime: Date; // Maps to 'startDateTime' in the model (use string or Date, depending on your frontend handling)
  endDateTime: Date; // Maps to 'endDateTime' in the model
  zoomAccount?: string; // Maps to 'zoomAccount' in the model (optional)
  zoomLink?: string; // Maps to 'zoomLink' in the model (optional)
  zid?: string; // Maps to 'zid' in the model (optional)
  type: string; // Maps to 'type' in the model
  room: string; // Maps to 'room' in the model
  recurrence?: string; // Remains as optional if required
  onBack: () => void;
  onEdit: () => void;
  onDelete: (mid: string) => void;
};

const ViewMeetingDetails: React.FC<ViewMeetingDetailsProps> = ({
  id,
  mid,
  title,
  description,
  creator,
  group,
  startDateTime,
  endDateTime,
  zoomAccount,
  zoomLink,
  zid,
  type,
  room,
  recurrence,
  onBack,
  onEdit,
  onDelete,
}) => {

  const handleDelete = () => {
    onDelete(mid);
  }

  return (
    <div className={styles.meetingDetails}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>←</button>
        <h1>{title}</h1>
        <span className={styles.settingLabel}>{type}</span>
        <div className={styles.moreOptions}>
          <button>⋮</button>
          <div className={styles.optionsMenu}>
            <button onClick={onEdit}>Edit Meeting</button>
            <button onClick={handleDelete}>Delete Meeting</button>
          </div>
        </div>
      </div>
      <div className={styles.details}>
        <p style={{ color: 'gray' }}>
          <CalendarTodayIcon />&nbsp;
          {startDateTime.getDate()} {startDateTime.toLocaleString('default', { month: 'long' })} {startDateTime.getFullYear()}
          {!(
            startDateTime.getFullYear() === endDateTime.getFullYear() &&
            startDateTime.getMonth() === endDateTime.getMonth() &&
            startDateTime.getDate() === endDateTime.getDate()
          ) && (
              <> - {endDateTime.getDate()} {endDateTime.toLocaleString('default', { month: 'long' })} {endDateTime.getFullYear()}</>
            )}
        </p>
        <p style={{ color: 'gray' }}>
          <AccessTimeIcon />&nbsp;{`${startDateTime.getHours()}:${startDateTime.getMinutes().toString().padStart(2, '0')}`}
          -
          {`${endDateTime.getHours()}:${endDateTime.getMinutes().toString().padStart(2, '0')}`}
        </p>
        {recurrence && <p>{recurrence}</p>}
        <hr className={styles.divider} />

        <p><strong>Calendar:</strong>&nbsp;{group}</p>
        <p><strong>Location:</strong>&nbsp;{room}</p>
        {zoomAccount && <p><strong>Zoom Account:</strong>&nbsp;{zoomAccount}</p>}
        {zoomLink && <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}>
          <VideoCameraFrontIcon /> {zoomLink}
        </a>}
        <p><strong>PandaDocs Form</strong></p>
        <div className={styles.pandaDocs}>

          <a href={'https://Google.com'} download className={styles.pandaDocsLink}>
            <div className={styles.docsEmoji}><InsertDriveFileIcon /></div>
            <div className={styles.pandaDocsText}>
              <div className={styles.pandaDocsName}>{"Dummy Name"}</div>
              <div className={styles.pandaDocsSize}>{"1.2 MB"}</div>
            </div>
            <div className={styles.downloadEmoji}><DownloadForOfflineIcon /></div>
          </a>
        </div>

        <hr className={styles.divider} />

        {description && <p className={styles.placeholderText}>{description}</p>}
        <hr className={styles.divider} />

      </div>
    </div>
  );
};

export default ViewMeetingDetails;
