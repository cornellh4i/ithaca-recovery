import React, { useState } from 'react';
import styles from '../../../styles/components/organisms/ViewMeeting.module.scss';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DeleteRecurringModal from '../molecules/DeleteRecurringModal';
import DeleteMeetingModal from '../molecules/DeleteMeetingModal';

import { IRecurrencePattern } from '../../../util/models';
import { convertUTCToET } from "../../../util/timeUtils";
import { formatCompactTimeRange } from "../../../util/timeFormat";
import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "../../../util/filterColors";
import { formatDayColumn } from "../../../util/recurrenceDisplay";

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what formatCompactTimeRange expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', hour12: false,
});


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
  zoomRoom?: string | null; // Maps to 'zoomRoom' in the model (optional)
  zoomLink?: string | null; // Maps to 'zoomLink' in the model (optional)
  zid?: string | null; // Maps to 'zid' in the model (optional)
  zoomHost?: string | null; // Pooled Zoom account this meeting's Zoom meeting is running under (optional)
  calType: string[]; // Maps to 'calType' in the model
  room: string; // Maps to 'room' in the model
  recurrence?: string; // Remains as optional if required
  isRecurring: boolean;
  recurrencePattern?: IRecurrencePattern
  currentOccurrenceDate?: Date; // Handles the specific occurrence date
  syncStatus?: string | null;
  zoomSyncStatus?: string | null;
  zoomSyncError?: string | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: (mid: string, deleteOption?: 'this' | 'thisAndFollowing' | 'all') => void;
  onSyncSuccess?: () => void;
};

const ViewMeetingDetails: React.FC<ViewMeetingDetailsProps> = ({
  mid,
  title,
  modeType,
  description,
  startDateTime,
  endDateTime,
  email,
  zoomRoom,
  zoomLink,
  zoomHost,
  calType,
  room,
  isRecurring,
  recurrencePattern,
  currentOccurrenceDate,
  syncStatus: initialSyncStatus,
  zoomSyncStatus: initialZoomSyncStatus,
  zoomSyncError: initialZoomSyncError,
  onBack,
  onEdit,
  onDelete,
  onSyncSuccess,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [syncStatus, setSyncStatus] = useState(initialSyncStatus ?? null);
  const [zoomSyncStatus, setZoomSyncStatus] = useState(initialZoomSyncStatus ?? null);
  const [zoomSyncError, setZoomSyncError] = useState(initialZoomSyncError ?? null);
  const [syncing, setSyncing] = useState(false);

  const handleRetrySync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/update/meeting/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mid }),
      });
      const data = await res.json();
      setSyncStatus(data.syncStatus ?? 'error');
      setZoomSyncStatus(data.zoomSyncStatus ?? null);
      setZoomSyncError(data.zoomSyncError ?? null);
      if (data.syncStatus === 'synced' || data.zoomSyncStatus === 'synced') onSyncSuccess?.();
    } catch {
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

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

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRecurring) {
      setShowDeleteModal(true);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleModalDelete = (option: 'this' | 'thisAndFollowing' | 'all') => {
    console.log("Deleting recurring meeting with option:", option);
    onDelete(mid, option);
    setShowDeleteModal(false);
  };

  const handleConfirmDelete = () => {
    onDelete(mid);
    setShowDeleteConfirm(false);
  };

  // Reuses the Export XLSX's "Day" column formatting (util/recurrenceDisplay.ts) so a
  // pattern like "M-W, F" or "2nd Tu" reads the same here and in the export.
  const getRecurrenceText = () => {
    if (!recurrencePattern) return "Repeats regularly";

    const day = formatDayColumn({
      type: recurrencePattern.type,
      weekOfMonth: recurrencePattern.weekOfMonth ?? null,
      dayOfMonth: recurrencePattern.dayOfMonth ?? null,
      daysOfWeek: recurrencePattern.daysOfWeek ?? [],
    });

    if (recurrencePattern.type === "monthly") {
      return day ? `Monthly · ${day}` : "Monthly";
    }

    const { interval } = recurrencePattern;
    let intervalText = "Weekly";
    if (interval === 2) intervalText = "Biweekly";
    else if (interval === 3) intervalText = "Triweekly";
    else if (interval > 1) intervalText = `Every ${interval} weeks`;

    return day ? `${intervalText} · ${day}` : intervalText;
  };

  console.log("Rendering ViewMeetingDetails with dates:", {
    startDateTime,
    endDateTime,
    displayStartDate,
    displayEndDate,
    currentOccurrenceDate,
    doesOccur: currentOccurrenceDate ? doesMeetingOccurOnDate(currentOccurrenceDate) : false
  });

  const startDateEST = convertUTCToET(startDateTime.toISOString());

  const timeRangeText = formatCompactTimeRange(
    etTimeFmt.format(startDateTime),
    etTimeFmt.format(endDateTime)
  );

  const primaryColor = ROOM_COLORS[room] ?? ZOOM_ROOM_COLOR;

  return (
    <div className={styles.meetingDetails}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>←</button>
        <h1>{title}</h1>
        <span
          className={styles.settingLabel}
          style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
        >
          {modeType}
        </span>
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
          {startDateEST.split(',')[0]} 
        </p>
        <p style={{ color: 'gray' }}>
          <AccessTimeIcon />&nbsp;{timeRangeText}
        </p>

        {isRecurring && (
          <p className={styles.recurringInfo}>
            {getRecurrenceText()}
          </p>
        )}

        <hr className={styles.divider} />

        <p><strong>Email:</strong>&nbsp;{email}</p>
        <p><strong>Meeting Mode:</strong>&nbsp;{modeType}</p>
        <p><strong>Calendar:</strong>&nbsp;{Array.isArray(calType) ? calType.join(', ') : calType}</p>
        {syncStatus === 'synced' && (
          <p style={{ color: '#3a9e3a', fontSize: '13px', margin: '2px 0 8px' }}>
            Synced to Google Calendar ✓
          </p>
        )}
        {syncStatus === 'error' && (
          <p style={{ color: '#e07000', fontSize: '13px', margin: '2px 0 4px' }}>
            Google Calendar sync failed ⚠
          </p>
        )}
        {zoomSyncStatus === 'synced' && (
          <p style={{ color: '#3a9e3a', fontSize: '13px', margin: '2px 0 8px' }}>
            Synced to Zoom ✓
          </p>
        )}
        {zoomSyncStatus === 'error' && (
          <p style={{ color: '#e07000', fontSize: '13px', margin: '2px 0 4px' }}>
            Zoom sync failed ⚠{zoomSyncError ? `: ${zoomSyncError}` : ''}
          </p>
        )}
        {(syncStatus === 'error' || zoomSyncStatus === 'error') && (
          <button
            onClick={handleRetrySync}
            disabled={syncing}
            style={{
              fontSize: '12px', padding: '3px 10px', marginBottom: '8px',
              cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing ? 'Retrying…' : 'Retry sync'}
          </button>
        )}
        {room && <p><strong>Location:</strong>&nbsp;{room}</p>}
        {zoomRoom && <p><strong>Zoom:</strong>&nbsp;{zoomRoom.replace(/ - Zoom$/, '')}</p>}
        {zoomLink && <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}>
          <img src="/svg/zoom-icon.svg" alt="Zoom" /> {zoomLink}
        </a>}
        {zoomHost && <p><strong>Zoom Host:</strong>&nbsp;{zoomHost}</p>}

        <hr className={styles.divider} />

        {description && <p className={styles.placeholderText}>{description}</p>}
        <hr className={styles.divider} />

      </div>
      <DeleteRecurringModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDelete={handleModalDelete}
      />
      <DeleteMeetingModal
        isOpen={showDeleteConfirm}
        title={title}
        timeRangeText={timeRangeText}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default ViewMeetingDetails;
