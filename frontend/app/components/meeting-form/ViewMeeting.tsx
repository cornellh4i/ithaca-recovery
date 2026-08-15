import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import styles from './ViewMeeting.module.scss';
import DeleteRecurringModal from './DeleteRecurringModal';
import DeleteMeetingModal from './DeleteMeetingModal';
import SuspendMeetingModal from './SuspendMeetingModal';
import ResumeMeetingModal from './ResumeMeetingModal';
import TagList from '../ui/displays/TagList';
import BottomSheet from '../ui/overlays/BottomSheet';
import Icon from '../ui/displays/Icon';

import { IRecurrencePattern } from '../../../types/models';
import { formatCompactTimeRange, formatMeetingDateLine } from "../../../util/date/timeFormat";
import { formatETDateString } from "../../../util/date/timeUtils";
import { retryMeetingSync } from "../../../services/syncMeeting";
import { useToast } from "../shared/ToastProvider";
import { formatSuspensionStatusText } from "../../../util/meetings/suspensionText";
import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "../../../util/rooms/filterColors";
import { formatRecurrencePattern } from "../../../util/meetings/recurrenceDisplay";
import { isZoomRoomMismatched } from "../../../util/rooms/rooms";
import { linkify } from "../../../util/common/linkify";
import { zoomHostLabel } from "../../../util/rooms/zoomHosts";
import { MODE_ICON_NAME } from "../../../util/rooms/modeIcons";
import { useZoomHostPool } from "../../../hooks/useZoomHostPool";

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what formatCompactTimeRange expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

const stripZoomSuffix = (name: string): string => name.replace(/ - Zoom$/, '');

// "the date the action takes effect" for Delete/Suspend modals -- the specific occurrence date
// clicked (displayStartDate below), not literally today: a recurring meeting clicked on a
// Thursday should read "starting Thursday", even though the suspend/delete call itself always
// fires immediately.
const formatEffectiveDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' })
    .format(date);

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
  googleSyncStatus?: string | null;
  googleSyncError?: string | null;
  zoomSyncStatus?: string | null;
  zoomSyncError?: string | null;
  // The most recent unresolved suspension's scheduled resume date, if any -- includes one
  // scheduled to start later, not just one already active. Null = indefinite, or no suspension
  // at all. Drives the kebab menu's Suspend/Reactivate/Cancel label and the "resumes on X" text.
  resumesAt?: Date | null;
  // That suspension's own start date. Null whenever resumesAt would also be null-for-that-reason
  // (no suspension at all).
  suspendedSince?: Date | null;
  // Whether the suspension described above has actually started (hiding the meeting from the
  // calendar right now) vs. is merely scheduled -- only meaningful when suspendedSince is set.
  suspensionActive?: boolean;
  // How many other meetings this one currently conflicts with (room/zoomRoom/zoomHost) --
  // 0 or undefined renders nothing. Mirrors the calendar box's ⛔ conflict badge (BoxText.tsx),
  // which only signals *that* a conflict exists, not what it means.
  conflictCount?: number;
  // The clicked meeting box, so the popup can anchor itself beside it.
  anchorEl: HTMLElement | null;
  // Renders inside a bottom sheet instead of the desktop anchor-positioned popup -- no
  // anchorEl/popupPosition math needed there (BottomSheet is always bottom-fixed).
  isPhone?: boolean;
  // Gates the email row, Zoom host row, and the Edit/Delete kebab menu -- all of them are
  // either PII or actions a non-admin viewer can't act on (the backend already rejects the
  // writes; this just stops the UI from offering them in the first place). null while the
  // caller's own auth check is still pending -- treated the same as false (hidden) below.
  isAdmin: boolean | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: (mid: string, deleteOption?: 'this' | 'thisAndFollowing' | 'all') => void;
  onSuspend?: (mid: string, resumesAt: string | null, from: string) => void;
  // `on` omitted (or null) resumes immediately; an ISO date string schedules the resume instead
  // (see ResumeMeetingModal / the resume route's `on` branch).
  onResume?: (mid: string, on?: string | null) => void;
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
  googleSyncStatus: initialGoogleSyncStatus,
  googleSyncError: initialGoogleSyncError,
  zoomSyncStatus: initialZoomSyncStatus,
  zoomSyncError: initialZoomSyncError,
  resumesAt,
  suspendedSince,
  suspensionActive,
  conflictCount = 0,
  anchorEl,
  isPhone = false,
  isAdmin,
  onBack,
  onEdit,
  onDelete,
  onSuspend,
  onResume,
  onSyncSuccess,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  // Not just `status === 'Suspended'` -- that flips true the instant a *future* suspension is
  // scheduled too (suspend/route.ts sets it synchronously regardless of `from`), which would
  // otherwise mislabel the kebab as "Reactivate" for a meeting that's still showing normally on
  // the calendar. hasSuspension covers both cases (something to manage at all); isSuspended is
  // specifically "hidden from the calendar right now."
  const hasSuspension = !!suspendedSince;
  const isSuspended = hasSuspension && !!suspensionActive;
  const hasPendingSuspension = hasSuspension && !isSuspended;
  const { showToast } = useToast();
  const [googleSyncStatus, setGoogleSyncStatus] = useState(initialGoogleSyncStatus ?? null);
  const [googleSyncError, setGoogleSyncError] = useState(initialGoogleSyncError ?? null);
  const [zoomSyncStatus, setZoomSyncStatus] = useState(initialZoomSyncStatus ?? null);
  const [zoomSyncError, setZoomSyncError] = useState(initialZoomSyncError ?? null);
  const [syncing, setSyncing] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
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
  // alone since that box's own onClick already handles re-selecting/toggling it. Desktop
  // only: popupRef is never attached on phone (that branch renders inside BottomSheet, not
  // the ref={popupRef} div below), so popupRef.current would always be null there --
  // treating *every* click, including ones inside the sheet's own kebab menu, as "outside"
  // and closing it immediately. BottomSheet already has its own correct backdrop-click-to-
  // close handling for the phone case, so this effect simply doesn't need to run there.
  useEffect(() => {
    if (isPhone) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      // DatePicker's own calendar popup (e.g. SuspendMeetingModal's "Until" field) is portaled
      // to document.body, so it's a DOM sibling of this popup, not a descendant -- without this
      // check, clicking a day on it reads as an outside click and closes the whole thing.
      if ((target as Element).closest?.('[data-datepicker-popup]')) return;
      onBack();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onBack, isPhone]);

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
      const data = await retryMeetingSync(mid);
      setGoogleSyncStatus(data.googleSyncStatus ?? 'error');
      setGoogleSyncError(data.googleSyncError ?? null);
      setZoomSyncStatus(data.zoomSyncStatus ?? null);
      setZoomSyncError(data.zoomSyncError ?? null);
      // Only report success once every *applicable* channel is synced -- zoomSyncStatus is
      // legitimately null for a meeting that doesn't need Zoom, so null shouldn't count against
      // it, but 'error' on either side must still block onSyncSuccess (previously an ||, which
      // fired as soon as just one side synced, even while the other was still failing).
      const calendarOk = data.googleSyncStatus == null || data.googleSyncStatus === 'synced';
      const zoomOk = data.zoomSyncStatus == null || data.zoomSyncStatus === 'synced';
      if (calendarOk && zoomOk) {
        onSyncSuccess?.();
        showToast({ variant: "success", title: "Sync retried successfully." });
      } else {
        const failures = [
          !calendarOk && `Google Calendar (${data.googleSyncError ?? 'sync failed'})`,
          !zoomOk && `Zoom (${data.zoomSyncError ?? 'sync failed'})`,
        ].filter(Boolean).join(', ');
        showToast({ variant: "error", title: `Retry failed: ${failures}` });
      }
    } catch {
      // Stale from a prior fetch/retry -- this failure is the request itself, not a specific
      // provider error, so clear it and let the details list fall back to "Sync failed.".
      setGoogleSyncStatus('error');
      setGoogleSyncError(null);
      showToast({ variant: "error", title: "Could not retry the sync." });
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

  // Suspend's effective start date is the clicked occurrence's date, clamped to never be
  // earlier than today -- it can't retroactively un-happen a past occurrence, so clicking one
  // just starts the suspension today, but clicking a genuinely future occurrence schedules it
  // to actually start then (see suspend/route.ts's matching clamp). When the clicked occurrence
  // is in the past, SuspendMeetingModal shows a note clarifying it starts today instead.
  const todayETStr = formatETDateString(new Date());
  const clickedETStr = formatETDateString(displayStartDate);
  const isClickedOccurrencePast = clickedETStr < todayETStr;
  const suspendEffectiveDate = clickedETStr > todayETStr ? displayStartDate : new Date();

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

  const handleSuspendClick = () => {
    setKebabOpen(false);
    setShowDeleteModal(false);
    setShowDeleteConfirm(false);
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = (resumesAtISO: string | null) => {
    onSuspend?.(mid, resumesAtISO, suspendEffectiveDate.toISOString());
    setShowSuspendModal(false);
  };

  const handleResumeClick = () => {
    setKebabOpen(false);
    setShowSuspendModal(false);
    setShowDeleteModal(false);
    setShowDeleteConfirm(false);
    setShowResumeModal(true);
  };

  const handleConfirmResume = (on: string | null) => {
    onResume?.(mid, on);
    setShowResumeModal(false);
  };

  // Reuses the Export XLSX's "Day"/frequency formatting (util/recurrenceDisplay.ts) so a
  // pattern like "Weekly · Mon, Wed" reads the same here and in the export.
  const getRecurrenceText = () => {
    if (!recurrencePattern) return "Repeats regularly";

    // formatRecurrencePattern only knows "weekly"/"monthly" -- other pattern types (e.g.
    // "daily") fall through to an empty string, so fall back rather than showing blank text.
    const formatted = formatRecurrencePattern({
      type: recurrencePattern.type,
      weekOfMonth: recurrencePattern.weekOfMonth ?? null,
      dayOfMonth: recurrencePattern.dayOfMonth ?? null,
      daysOfWeek: recurrencePattern.daysOfWeek ?? [],
    });
    return formatted || "Repeats regularly";
  };

  const timeRangeText = formatCompactTimeRange(
    etTimeFmt.format(displayStartDate),
    etTimeFmt.format(displayEndDate)
  );

  const primaryColor = ROOM_COLORS[room] ?? ZOOM_ROOM_COLOR;
  const primaryLocation = room || (zoomRoom ? stripZoomSuffix(zoomRoom) : '');
  const showZoomMismatchRow = !!(room && zoomRoom && isZoomRoomMismatched(room, zoomRoom));
  const hasSyncFailure = googleSyncStatus === 'error' || zoomSyncStatus === 'error';
  // Status band (sync-failure/conflict/suspension) is admin-only -- it references admin-only
  // actions (Retry sync) and pages (Admin Diagnostics) that a public viewer can't use anyway.
  const showStatusBand = isAdmin && (hasSyncFailure || conflictCount > 0 || hasSuspension);

  const content = (
    <div className={styles.meetingDetails}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <Icon name="back-arrow" ariaLabel="Back" />
        </button>
        <h1>{title}</h1>
        <span
          className={styles.settingLabel}
          style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
        >
          {MODE_ICON_NAME[modeType] && (
            <Icon name={MODE_ICON_NAME[modeType]} className={styles.settingLabelIcon} />
          )}
          {modeType}
        </span>
        {isAdmin && (
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
                {isSuspended ? (
                  <button className={styles.suspendOption} onClick={handleResumeClick}>Reactivate</button>
                ) : hasPendingSuspension ? (
                  <button className={styles.suspendOption} onClick={handleResumeClick}>Cancel scheduled suspension</button>
                ) : (
                  <button className={styles.suspendOption} onClick={handleSuspendClick}>Suspend</button>
                )}
                <button className={styles.deleteOption} onClick={handleDelete}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.details}>
        {showStatusBand && (
          <div className={styles.statusBand}>
            {hasSyncFailure && (
              <div className={styles.syncFailureBlock}>
                <div className={styles.syncFailureHeader}>
                  <Icon name="sync-error" />
                  <span>Failed to sync</span>
                  <button
                    className={styles.syncDetailsToggle}
                    aria-expanded={syncDetailsOpen}
                    aria-label={syncDetailsOpen ? "Hide sync error details" : "Show sync error details"}
                    onClick={() => setSyncDetailsOpen((v) => !v)}
                  >
                    <Icon name="danger-circle" />
                  </button>
                </div>
                {syncDetailsOpen && (
                  <div className={styles.syncDetailsList}>
                    {googleSyncStatus === 'error' && (
                      <div>Google Calendar: &quot;{googleSyncError ?? 'Sync failed.'}&quot;</div>
                    )}
                    {zoomSyncStatus === 'error' && (
                      <div>Zoom: &quot;{zoomSyncError ?? 'Sync failed.'}&quot;</div>
                    )}
                  </div>
                )}
                <button
                  onClick={handleRetrySync}
                  disabled={syncing}
                  className={styles.retryButton}
                >
                  {syncing ? 'Retrying…' : 'Retry sync'}
                </button>
              </div>
            )}

            {conflictCount > 0 && (
              <div className={styles.conflictBlock}>
                <Icon name="warning" />
                <span>
                  Conflicts with {conflictCount} other meeting{conflictCount === 1 ? '' : 's'} —{' '}
                  <Link href="/admin" className={styles.diagnosticsLink}>view the Admin Diagnostics page</Link> for more info.
                </span>
              </div>
            )}

            {hasSuspension && (
              <div className={styles.suspensionBlock}>
                <Icon name="pause" />
                <span>{formatSuspensionStatusText(suspendedSince, resumesAt, suspensionActive)}</span>
              </div>
            )}
          </div>
        )}

        <div className={styles.scheduleGroup}>
          <p className={styles.scheduleTime}>
            <Icon name="clock" />
            <span>{formatMeetingDateLine(displayStartDate)} · {timeRangeText}</span>
          </p>

          {isRecurring && (
            <p className={styles.recurrenceLine}>
              <Icon name="repeat" />
              <span>{getRecurrenceText()}</span>
            </p>
          )}

          {primaryLocation && (
            <p className={styles.roomLine}>
              <Icon name="location" />
              <span>{primaryLocation}</span>
            </p>
          )}

          {showZoomMismatchRow && (
            <p className={styles.roomLine}>
              <Icon name="video-call" />
              <span>{stripZoomSuffix(zoomRoom as string)}</span>
            </p>
          )}
        </div>

        {zoomLink && zid && (
          <div className={styles.zoomBlock}>
            <div className={styles.zoomTopRow}>
              <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}>
                <Icon name="zoom" />
                Join Zoom Meeting
              </a>
              {zoomSyncStatus === 'synced' && (
                <span className={styles.zoomSyncedBadge}>
                  <Icon name="check" />
                  Synced
                </span>
              )}
            </div>
            <div className={styles.zoomMetaRow}>
              <span>ID {zid}{zoomPasscode ? ` · Passcode ${zoomPasscode}` : ''}</span>
              {zoomInvitation && (
                <button
                  className={styles.invitationToggle}
                  onClick={() => setShowInvitation((v) => !v)}
                >
                  {showInvitation ? 'Hide details' : 'Show details'}
                </button>
              )}
            </div>
            {zoomInvitation && showInvitation && (
              <>
                <hr className={styles.zoomInvitationDivider} />
                <pre className={styles.invitationText}>{linkify(zoomInvitation)}</pre>
              </>
            )}
          </div>
        )}

        {isAdmin && (email || zoomHost) && (
          <div className={`${styles.contactGroup} ${description ? styles.withDivider : ''}`}>
            {email && (
              <p className={styles.contactRow}>
                <Icon name="mail" />
                <span>{email}</span>
              </p>
            )}
            {zoomHost && (
              <p className={styles.contactRow}>
                <Icon name="person" />
                <span>Host: {zoomHostLabel(zoomHost, zoomHostPool.indexOf(zoomHost))} — {zoomHost}</span>
              </p>
            )}
          </div>
        )}

        {description && (
          <div className={styles.descriptionRow}>
            <Icon name="description" />
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
  );

  const modals = (
    <React.Fragment>
      <DeleteRecurringModal
        isOpen={showDeleteModal}
        title={title}
        effectiveDateText={formatEffectiveDate(displayStartDate)}
        onClose={() => setShowDeleteModal(false)}
        onDelete={handleModalDelete}
        // Omitted whenever a suspension already exists (active or merely scheduled) -- offering
        // "Suspend instead" there would open a modal that can only 409 (the suspend route
        // already blocks creating a second unresolved suspension for the same meeting).
        onSuspendInstead={onSuspend && !hasSuspension ? handleSuspendClick : undefined}
      />
      <DeleteMeetingModal
        isOpen={showDeleteConfirm}
        title={title}
        timeRangeText={timeRangeText}
        effectiveDateText={formatEffectiveDate(displayStartDate)}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        // Omitted whenever a suspension already exists (active or merely scheduled) -- offering
        // "Suspend instead" there would open a modal that can only 409 (the suspend route
        // already blocks creating a second unresolved suspension for the same meeting).
        onSuspendInstead={onSuspend && !hasSuspension ? handleSuspendClick : undefined}
      />
      <SuspendMeetingModal
        isOpen={showSuspendModal}
        title={title}
        effectiveDateText={formatEffectiveDate(suspendEffectiveDate)}
        effectiveDate={suspendEffectiveDate}
        pastOccurrenceDateText={isClickedOccurrencePast ? formatEffectiveDate(displayStartDate) : undefined}
        onCancel={() => setShowSuspendModal(false)}
        onConfirm={handleConfirmSuspend}
      />
      <ResumeMeetingModal
        isOpen={showResumeModal}
        title={title}
        suspendedSince={suspendedSince}
        isActive={isSuspended}
        onCancel={() => setShowResumeModal(false)}
        onConfirm={handleConfirmResume}
      />
    </React.Fragment>
  );

  if (isPhone) {
    return (
      <React.Fragment>
        <BottomSheet isOpen onClose={onBack} title={title} hideTitleVisually>
          {content}
        </BottomSheet>
        {modals}
      </React.Fragment>
    );
  }

  if (!anchorEl || !popupPosition) return null;

  return createPortal(
    <div
      ref={popupRef}
      className={styles.popupAnchor}
      style={{ top: popupPosition.top, left: popupPosition.left, width: POPUP_WIDTH }}
    >
      {content}
      {modals}
    </div>,
    document.body
  );
};

export default ViewMeetingDetails;
