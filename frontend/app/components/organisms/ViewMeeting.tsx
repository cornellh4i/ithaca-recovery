import React, { useState } from 'react';
import styles from '../../../styles/ViewMeeting.module.scss';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';
import RecurringModal from '../molecules/RecurringModal';
import { IRecurrencePattern } from '../../../util/models';
import { convertUTCToET } from "../../../util/timeUtils";


type ViewMeetingDetailsProps = {
  mid: string; // Maps to 'mid' in the model
  title: string; // Maps to 'title' in the model
  modeType: string; // Maps to 'modeType' in the model
  description?: string; // Maps to 'description' in the model
  creator: string; // Maps to 'creator' in the model
  group: string; // Maps to 'group' in the model
  startDateTime: Date; // Maps to 'startDateTime' in the model (use string or Date, depending on your frontend handling)
  endDateTime: Date; // Maps to 'endDateTime' in the model
  email: string;
  zoomAccount?: string | null; // Maps to 'zoomAccount' in the model (optional)
  zoomLink?: string | null; // Maps to 'zoomLink' in the model (optional)
  zid?: string | null; // Maps to 'zid' in the model (optional)
  calType: string; // Maps to 'calType' in the model
  room: string; // Maps to 'room' in the model
  recurrence?: string; // Remains as optional if required
  isRecurring: boolean;
  recurrencePattern?: IRecurrencePattern
  currentOccurrenceDate?: Date; // Handles the specific occurrence date
  onBack: () => void;
  onEdit: (mid?: string, option?: 'this' | 'thisAndFollowing' | 'all', currentOccurrenceDate?: Date) => void;
  onDelete: (mid: string, deleteOption?: 'this' | 'thisAndFollowing' | 'all', currentOccurrenceDate?: Date) => void;
};

const ViewMeetingDetails: React.FC<ViewMeetingDetailsProps> = ({
  mid,
  title,
  modeType,
  description,
  creator,
  group,
  startDateTime,
  endDateTime,
  email,
  zoomAccount,
  zoomLink,
  zid,
  calType,
  room,
  recurrence,
  isRecurring,
  recurrencePattern,
  currentOccurrenceDate, // This is the selected date from the calendar view
  onBack,
  onEdit,
  onDelete,
}) => {
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringActionType, setRecurringActionType] = useState<'delete' | 'edit'>('delete');

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
      if (!(recurrencePattern.daysOfWeek ?? []).includes(dayOfWeek)) {
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

  const handleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // For edit, we directly go to the edit sidebar without showing the modal
    onEdit(mid, undefined, currentOccurrenceDate);
  };
  
  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRecurring) {
      setRecurringActionType('delete');
      setShowRecurringModal(true);
    } else {
      onDelete(mid); // normal delete if not recurring
    }
  };  

  const handleRecurringModalConfirm = (mid: string, option: 'this' | 'thisAndFollowing' | 'all', currentOccurrenceDate?: Date) => {
    if (recurringActionType === 'delete') {
      console.log("Deleting with option:", option);
      onDelete(mid, option, currentOccurrenceDate);
    } else if (recurringActionType === 'edit') {
      console.log("Editing with option:", option);
      onEdit(mid, option, currentOccurrenceDate);
    }
    setShowRecurringModal(false);
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

  // Convert the display dates to EST/EDT for rendering
  const displayStartDateEST = convertUTCToET(displayStartDate.toISOString());
  const displayEndDateEST = convertUTCToET(displayEndDate.toISOString());

  const formatTime = (estString: string): string => {
    const timePart = estString.split(',')[1]?.trim(); // "10:45:00 AM"
    if (!timePart) return "";
    
    const [hh, mm] = timePart.split(':');
    const ampm = timePart.split(' ')[1];
    return `${hh}:${mm} ${ampm}`; // returns "10:45 AM"
  };

  return (
    <div className={styles.meetingDetails}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>←</button>
        <h1>{title}</h1>
        <span className={styles.settingLabel}>{modeType}</span>
        <div className={styles.moreOptions}>
          <button>⋮</button>
          <div className={styles.optionsMenu}>
            <button onClick={handleEdit}>Edit Meeting</button>
            <button onClick={handleDelete}>Delete Meeting</button>
          </div>
        </div>
      </div>
      <div className={styles.details}>
      <p style={{ color: 'gray' }}>
          <CalendarTodayIcon />&nbsp;
          {displayStartDateEST.split(',')[0]} 
        </p>
        <p style={{ color: 'gray' }}>
          <AccessTimeIcon />&nbsp;{`${formatTime(displayStartDateEST)} - ${formatTime(displayEndDateEST)}`}
        </p>

        {isRecurring && (
          <p className={styles.recurringInfo}>
            {getRecurrenceText()}
          </p>
        )}

        <hr className={styles.divider} />

        <p><strong>Email:</strong>&nbsp;{email}</p>
        <p><strong>Meeting Mode:</strong>&nbsp;{modeType}</p>
        <p><strong>Calendar:</strong>&nbsp;{calType}</p>
        <p><strong>Location:</strong>&nbsp;{room}</p>
        {zoomAccount && <p><strong>Zoom Account:</strong>&nbsp;{zoomAccount}</p>}
        {zoomLink && <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}> 
          <VideoCameraFrontIcon /> {zoomLink}
        </a>}

        <hr className={styles.divider} />

        {description && <p className={styles.placeholderText}>{description}</p>}
        <hr className={styles.divider} />

      </div>
      <RecurringModal
      isOpen={showRecurringModal}
      onClose={() => setShowRecurringModal(false)}
      onConfirm={handleRecurringModalConfirm}
      mid={mid}
      currentOccurrenceDate={currentOccurrenceDate}
      actionType={recurringActionType}
      />
    </div>
  );
};

export default ViewMeetingDetails;