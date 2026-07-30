import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from '../../../styles/components/meeting-form/ViewMeeting.module.scss';
import DeleteRecurringModal from './DeleteRecurringModal';
import DeleteMeetingModal from './DeleteMeetingModal';
import TagList from '../atoms/TagList';

import { IRecurrencePattern } from '../../../util/models';
import { formatCompactTimeRange, formatMeetingDateLine } from "../../../util/timeFormat";
import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "../../../util/filterColors";
import { formatDayColumn } from "../../../util/recurrenceDisplay";
import { isZoomRoomMismatched } from "../../../util/rooms";
import { linkify } from "../../../util/linkify";
import { zoomHostLabel } from "../../../util/zoomHosts";
import { useZoomHostPool } from "../../../hooks/useZoomHostPool";

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what formatCompactTimeRange expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

const stripZoomSuffix = (name: string): string => name.replace(/ - Zoom$/, '');

// Fixed popup width; kept in sync with .meetingDetails's width in ViewMeeting.module.scss.
const POPUP_WIDTH = 380;
const POPUP_MARGIN = 8;
const ANCHOR_GAP = 12;

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
  zoomPasscode?: string | null; // Maps to 'zoomPasscode' in the model (optional)
  zoomInvitation?: string | null; // Zoom's auto-generated invitation text (optional)
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
  // How many other meetings this one currently conflicts with (room/zoomRoom/zoomHost) --
  // 0 or undefined renders nothing. Mirrors the calendar box's ⛔ conflict badge (BoxText.tsx),
  // which only signals *that* a conflict exists, not what it means.
  conflictCount?: number;
  // The clicked meeting box, so the popup can anchor itself beside it.
  anchorEl: HTMLElement | null;
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
  zid,
  zoomPasscode,
  zoomInvitation,
  zoomHost,
  calType,
  room,
  isRecurring,
  recurrencePattern,
  currentOccurrenceDate,
  syncStatus: initialSyncStatus,
  zoomSyncStatus: initialZoomSyncStatus,
  zoomSyncError: initialZoomSyncError,
  conflictCount = 0,
  anchorEl,
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
  const [kebabOpen, setKebabOpen] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [isDescTruncated, setIsDescTruncated] = useState(false);
  const zoomHostPool = useZoomHostPool();

  const popupRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  // Ref *callback* rather than a plain useRef -- it fires exactly once when the paragraph
  // actually mounts (the portal renders nothing until popupPosition is set, so a plain ref
  // wouldn't be attached yet on the render where we'd otherwise want to measure it), and,
  // unlike a dependency on popupPosition, does NOT re-fire on every reposition.
  const [descNode, setDescNode] = useState<HTMLParagraphElement | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);

  // Before the popup has ever mounted, popupRef.current is null, so the first calculation
  // below falls back to a capped estimate (min(80% of viewport, 600px)) for its height --
  // real popups are usually much shorter (e.g. ~350-400px for a non-recurring meeting with
  // no description), so that estimate over-clamps `top` upward far more than necessary,
  // landing the popup well away from the anchor box that was actually clicked. The
  // useLayoutEffect below corrects this once the real height is known post-mount.
  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.right + ANCHOR_GAP;
    if (left + POPUP_WIDTH > window.innerWidth - POPUP_MARGIN) {
      left = rect.left - POPUP_WIDTH - ANCHOR_GAP;
    }
    left = Math.max(POPUP_MARGIN, Math.min(left, window.innerWidth - POPUP_WIDTH - POPUP_MARGIN));
    // Clamp against the popup's own (measured, or capped-height-estimated pre-mount) height --
    // window.innerHeight alone is the viewport's bottom edge, not the popup's, so an anchor low
    // in the day grid would otherwise render the popup mostly off-screen.
    const popupHeight = popupRef.current?.offsetHeight ?? Math.min(0.8 * window.innerHeight, 600);
    const top = Math.max(POPUP_MARGIN, Math.min(rect.top, window.innerHeight - popupHeight - POPUP_MARGIN));
    setPopupPosition({ top, left });
  }, [anchorEl]);

  // Tracks the clicked box's on-screen position while the popup is open, so the portaled
  // popup (position:fixed) stays anchored beside it -- recomputed on scroll (capture:true
  // catches scrolling within any nested scroll container, not just the window) and resize.
  // Scrolling inside the popup's own content is ignored: the anchor box hasn't moved, so
  // recomputing there would just churn popupPosition with an equivalent-but-new object.
  useEffect(() => {
    if (!anchorEl) return;

    const handleScroll = (event: Event) => {
      if (popupRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };

    updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorEl, updatePosition]);

  // Runs once the popup's real DOM node exists (right after the first render above sets
  // popupPosition and the portal actually mounts) and corrects `top` using its real
  // offsetHeight in place of the pre-mount estimate -- see the comment on updatePosition.
  useLayoutEffect(() => {
    if (!popupPosition || !popupRef.current) return;
    updatePosition();
    // Deliberately excludes updatePosition/popupPosition to run only on the transition to
    // mounted, not on every position update updatePosition itself causes (which would still
    // be harmless/idempotent, just redundant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!popupPosition]);

  // Closes the whole popup on an outside click -- clicks on the anchor box itself are left
  // alone since that box's own onClick already handles re-selecting/toggling it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onBack();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onBack]);

  // Closes just the kebab dropdown on an outside click, independent of the popup-level one above.
  useEffect(() => {
    if (!kebabOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!kebabRef.current?.contains(event.target as Node)) {
        setKebabOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [kebabOpen]);

  // Measures whether the (clamped) description overflows 3 lines, so the "Show more" toggle
  // only appears when there's actually more to show. Runs once against descNode's initial
  // (clamped) layout -- not re-keyed on descExpanded, so later expanding/collapsing doesn't
  // re-measure against the now-unclamped height and wrongly conclude "not truncated".
  useLayoutEffect(() => {
    if (!description || !descNode) {
      setIsDescTruncated(false);
      return;
    }
    setIsDescTruncated(descNode.scrollHeight > descNode.clientHeight + 1);
  }, [description, descNode]);

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
      // Only report success once every *applicable* channel is synced -- zoomSyncStatus is
      // legitimately null for a meeting that doesn't need Zoom, so null shouldn't count against
      // it, but 'error' on either side must still block onSyncSuccess (previously an ||, which
      // fired as soon as just one side synced, even while the other was still failing).
      const calendarOk = data.syncStatus === 'synced';
      const zoomOk = data.zoomSyncStatus == null || data.zoomSyncStatus === 'synced';
      if (calendarOk && zoomOk) onSyncSuccess?.();
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
    setKebabOpen(false);
    if (isRecurring) {
      setShowDeleteModal(true);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleModalDelete = (option: 'this' | 'thisAndFollowing' | 'all') => {
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

  const timeRangeText = formatCompactTimeRange(
    etTimeFmt.format(displayStartDate),
    etTimeFmt.format(displayEndDate)
  );

  const primaryColor = ROOM_COLORS[room] ?? ZOOM_ROOM_COLOR;
  const primaryLocation = room || (zoomRoom ? stripZoomSuffix(zoomRoom) : '');
  const showZoomMismatchRow = !!(room && zoomRoom && isZoomRoomMismatched(room, zoomRoom));

  if (!anchorEl || !popupPosition) return null;

  return createPortal(
    <div
      ref={popupRef}
      className={styles.popupAnchor}
      style={{ top: popupPosition.top, left: popupPosition.left, width: POPUP_WIDTH }}
    >
      <div className={styles.meetingDetails}>
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onBack}>
            <img src="/svg/back-arrow.svg" alt="Back" />
          </button>
          <h1>{title}</h1>
          <span
            className={styles.settingLabel}
            style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          >
            {modeType}
          </span>
          <div className={styles.moreOptions} ref={kebabRef}>
            <button
              aria-label="Meeting options"
              aria-expanded={kebabOpen}
              onClick={() => setKebabOpen((open) => !open)}
            >
              ⋮
            </button>
            {kebabOpen && (
              <div className={styles.optionsMenu}>
                <button onClick={() => { setKebabOpen(false); onEdit(); }}>Edit</button>
                <button className={styles.deleteOption} onClick={handleDelete}>Delete</button>
              </div>
            )}
          </div>
        </div>

        <hr className={styles.divider} />

        <div className={styles.details}>
          {(syncStatus === 'error' || zoomSyncStatus === 'error') && (
            <p className={styles.dangerRow}>
              <img src="/svg/sync-error-icon.svg" alt="" />
              <span>
                {syncStatus === 'error' && zoomSyncStatus === 'error'
                  ? 'Failed to sync to Google Calendar and Zoom — use Retry sync below.'
                  : syncStatus === 'error'
                  ? 'Failed to sync to Google Calendar — this meeting may not appear there. Use Retry sync below.'
                  : `Failed to sync to Zoom${zoomSyncError ? `: ${zoomSyncError}` : ''} — use Retry sync below.`}
              </span>
            </p>
          )}

          {conflictCount > 0 && (
            <p className={styles.warningRow}>
              <img src="/svg/warning-icon.svg" alt="" />
              <span>
                Conflicts with {conflictCount} other meeting{conflictCount === 1 ? '' : 's'} —
                view the Admin Diagnostics page for more info.
              </span>
            </p>
          )}

          <p className={styles.row}>
            <img src="/svg/clock-icon.svg" alt="" />
            <span>
              {formatMeetingDateLine(displayStartDate)} ⋅ {timeRangeText}
              {isRecurring && <span className={styles.recurringInfo}>{getRecurrenceText()}</span>}
            </span>
          </p>

          {primaryLocation && (
            <p className={styles.row}>
              <img src="/svg/location-icon.svg" alt="" />
              <span>{primaryLocation}</span>
            </p>
          )}

          {syncStatus === 'synced' && (
            <p className={styles.syncSuccess}>Synced to Google Calendar ✓</p>
          )}
          {syncStatus === 'error' && (
            <p className={styles.syncError}>Google Calendar sync failed ⚠</p>
          )}

          {showZoomMismatchRow && (
            <p className={styles.row}>
              <img src="/svg/video-call-icon.svg" alt="" />
              <span>{stripZoomSuffix(zoomRoom as string)}</span>
            </p>
          )}

          {zoomLink && zid && (
            <div className={styles.zoomSection}>
              <img src="/svg/zoom-icon.svg" alt="" />
              <div className={styles.zoomInfo}>
                <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}>
                  Join Zoom Meeting
                </a>
                <span>ID: {zid}</span>
                {zoomPasscode && <span>Passcode: {zoomPasscode}</span>}
              </div>
              {zoomInvitation && (
                <button
                  className={styles.invitationToggle}
                  title={showInvitation ? "Hide conference details" : "View conference details"}
                  onClick={() => setShowInvitation((v) => !v)}
                >
                  <img
                    src={showInvitation ? "/svg/arrow-up-icon.svg" : "/svg/arrow-down-icon.svg"}
                    alt=""
                  />
                </button>
              )}
            </div>
          )}
          {zoomInvitation && showInvitation && (
            <pre className={styles.invitationText}>{linkify(zoomInvitation)}</pre>
          )}

          {zoomSyncStatus === 'synced' && (
            <p className={styles.syncSuccess}>Synced to Zoom ✓</p>
          )}
          {zoomSyncStatus === 'error' && (
            <p className={styles.syncError}>Zoom sync failed ⚠{zoomSyncError ? `: ${zoomSyncError}` : ''}</p>
          )}
          {(syncStatus === 'error' || zoomSyncStatus === 'error') && (
            <button
              onClick={handleRetrySync}
              disabled={syncing}
              className={styles.retryButton}
            >
              {syncing ? 'Retrying…' : 'Retry sync'}
            </button>
          )}

          <p className={styles.row}>
            <img src="/svg/mail-icon.svg" alt="" />
            <span>{email}</span>
          </p>

          {zoomHost && (
            <p className={styles.row}>
              <img src="/svg/person-icon.svg" alt="" />
              <span>Zoom host: {zoomHostLabel(zoomHost, zoomHostPool.indexOf(zoomHost))} — {zoomHost}</span>
            </p>
          )}

          {description && (
            <div className={styles.descriptionRow}>
              <img src="/svg/description-icon.svg" alt="" />
              <div className={styles.descriptionContent}>
                <p ref={setDescNode} className={descExpanded ? undefined : styles.descriptionClamped}>
                  {linkify(description)}
                </p>
                {isDescTruncated && (
                  <button className={styles.showMoreToggle} onClick={() => setDescExpanded((v) => !v)}>
                    {descExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>
          )}

          <hr className={styles.divider} />

          {calType && calType.length > 0 && (
            <TagList
              tags={calType}
              color={primaryColor}
              gap={4}
              tagStyle={{ padding: '2px 12px', fontSize: '12px', color: '#000' }}
            />
          )}
        </div>
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
    </div>,
    document.body
  );
};

export default ViewMeetingDetails;
