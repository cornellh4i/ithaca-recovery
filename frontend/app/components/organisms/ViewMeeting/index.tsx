import React, { useState } from 'react';
import styles from '../../../../styles/ViewMeeting.module.scss';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';
import DeleteRecurringModal from '../../molecules/DeleteRecurringModal';

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
  isRecurring: boolean;
  recurrencePattern?: {
    type: string;
    interval: number;
    daysOfWeek: string[];
    startDate?: Date;
    endDate?: Date | null;
    numberOfOccurences?: number | null;
    firstDayOfWeek?: string;
  };
  currentOccurrenceDate?: Date; // Handles the specific occurrence date
  onBack: () => void;
  onEdit: () => void;
  onDelete: (mid: string, deleteOption?: 'this' | 'thisAndFollowing' | 'all') => void;
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
  isRecurring,
  recurrencePattern,
  currentOccurrenceDate, // This is the selected date from the calendar view
  onBack,
  onEdit,
  onDelete,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const doesMeetingOccurOnDate = (date: Date): boolean => {
    if (!isRecurring || !recurrencePattern) {
      const meetingDate = new Date(startDateTime);
      return (
        meetingDate.getFullYear() === date.getFullYear() &&
        meetingDate.getMonth() === date.getMonth() &&
        meetingDate.getDate() === date.getDate()
      );
    }

    if (recurrencePattern.type === "weekly") {
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
      if (!recurrencePattern.daysOfWeek.includes(dayOfWeek)) {
        return false;
      }

      const originalDate = new Date(startDateTime);
      const diffTime = Math.abs(date.getTime() - originalDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      
      return diffWeeks % recurrencePattern.interval === 0;
    }

    return true;
  };

  let displayStartDate = startDateTime;
  let displayEndDate = endDateTime;

  if (isRecurring && currentOccurrenceDate && doesMeetingOccurOnDate(currentOccurrenceDate)) {
    const newStartDate = new Date(startDateTime);
    newStartDate.setFullYear(currentOccurrenceDate.getFullYear());
    newStartDate.setMonth(currentOccurrenceDate.getMonth());
    newStartDate.setDate(currentOccurrenceDate.getDate());
    
    displayStartDate = newStartDate;
    
    const duration = endDateTime.getTime() - startDateTime.getTime();
    displayEndDate = new Date(displayStartDate.getTime() + duration);
  }

  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRecurring) {
      setShowDeleteModal(true);
    } else {
      onDelete(mid);
    }
  };

  const handleModalDelete = (option: 'this' | 'thisAndFollowing' | 'all') => {
    console.log("Deleting recurring meeting with option:", option); 
    onDelete(mid, option);
    setShowDeleteModal(false);
  };

  
  const getRecurrenceText = () => {
    if (recurrencePattern) {
      const { type, interval, daysOfWeek } = recurrencePattern;

      let intervalText = "regularly";
      if (type === "weekly") {
        if (interval === 1) intervalText = "weekly";
        else if (interval === 2) intervalText = "biweekly";
        else if (interval === 3) intervalText = "triweekly";
        else intervalText = `every ${interval} weeks`;
      }

      let daysText = "";
      if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
        daysText = ` on ${daysOfWeek.join(', ')}`;
      }

      return `Repeats ${intervalText}${daysText}`;
    }

    return "Repeats regularly";
  };

  console.log("Rendering ViewMeetingDetails with dates:", {
    startDateTime,
    endDateTime,
    displayStartDate,
    displayEndDate,
    currentOccurrenceDate,
    doesOccur: currentOccurrenceDate ? doesMeetingOccurOnDate(currentOccurrenceDate) : false
  });

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
            <button onClick={handleDeleteClick}>Delete Meeting</button>
          </div>
        </div>
      </div>
      <div className={styles.details}>
      <p style={{ color: 'gray' }}>
          <CalendarTodayIcon />&nbsp;
          {displayStartDate.getDate()} {displayStartDate.toLocaleString('default', { month: 'long' })} {displayStartDate.getFullYear()}
        </p>
        <p style={{ color: 'gray' }}>
          <AccessTimeIcon />&nbsp;
          {`${displayStartDate.getHours()}:${displayStartDate.getMinutes().toString().padStart(2, '0')}`} - {`${displayEndDate.getHours()}:${displayEndDate.getMinutes().toString().padStart(2, '0')}`}
        </p>

        {isRecurring && (
          <p className={styles.recurringInfo}>
            {getRecurrenceText()}
          </p>
        )}

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
      <DeleteRecurringModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDelete={handleModalDelete}
      />
    </div>
  );
};

export default ViewMeetingDetails;
