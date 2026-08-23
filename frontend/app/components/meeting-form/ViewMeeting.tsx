import React, { useState, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './ViewMeeting.module.scss';
import DeleteRecurringModal from './DeleteRecurringModal';
import DeleteMeetingModal from './DeleteMeetingModal';
import SuspendMeetingModal from './SuspendMeetingModal';
import ResumeMeetingModal from './ResumeMeetingModal';
import MeetingSyncStatusBand from './MeetingSyncStatusBand';
import TagList from '../ui/displays/TagList';
import BottomSheet from '../ui/overlays/BottomSheet';
import Icon from '../ui/displays/Icon';

import ScheduleSummaryCard from './ScheduleSummaryCard';

import { ILinkedSchedule, IRecurrencePattern, ISharedZoomRow } from '../../../types/models';
import { formatCompactTimeRange, formatMeetingDateLine } from "../../../util/date/timeFormat";
import {
  convertETToUTC,
  formatETDateString,
  formatETLongDate,
  getETTimeOfDay,
  isDstGapError,
} from "../../../util/date/timeUtils";
import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "../../../util/rooms/filterColors";
import { formatRecurrencePattern } from "../../../util/meetings/recurrenceDisplay";
import { matchesRecurrencePattern } from "../../../util/meetings/recurrenceMatch";
import { isZoomRoomMismatched } from "../../../util/rooms/rooms";
import { linkify } from "../../../util/common/linkify";
import { zoomHostLabel } from "../../../util/rooms/zoomHosts";
import { MODE_ICON_NAME } from "../../../util/rooms/modeIcons";
import { useZoomHostPool } from "../../../hooks/useZoomHostPool";
import { usePopupPosition, POPUP_WIDTH } from "../../../hooks/usePopupPosition";
import { useRetrySync } from "../../../hooks/useRetrySync";
import { useDismissibleLayer } from "../../../hooks/useDismissibleLayer";

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
  lastEditedBy?: string | null; // Server-managed: session email of the last admin to save an edit
  zoomManaged?: boolean; // false = ICR-owned/external Zoom meeting the app only points at
  // Other active rows on the same Zoom link (shared legacy meetings) -- admin-only, like the
  // rest of the contact group it renders in.
  sharedWith?: ISharedZoomRow[];
  // Those rows' schedules disagree, so Zoom is holding its current schedule until they match.
  // A pending state, not a failure: the app and Google calendars already follow this row.
  zoomScheduleDiverged?: boolean;
  // The meeting's OTHER schedules -- one meeting the group runs on different days in a
  // different mode. Admin-only, like sharedWith. Read-only here: removing one is an Edit
  // action, and each is edited from its own form.
  linkedSchedules?: ILinkedSchedule[];
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
  creator,
  lastEditedBy,
  zoomManaged,
  sharedWith,
  zoomScheduleDiverged = false,
  linkedSchedules,
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
  // Admin-only, one Zoom GET per opened meeting -- deliberately NOT part of the calendar
  // retrieve payloads (bulk, public, hot path); see /api/admin/zoom-drift. After a successful
  // retry the server is re-asked rather than assumed clear: a retry can report synced while
  // the credential fetch inside it failed, leaving the stored copy still stale.
  const [zoomDrift, setZoomDrift] = useState(false);
  const [driftCheckNonce, setDriftCheckNonce] = useState(0);
  useEffect(() => {
    if (!isAdmin || !zid) return;
    let cancelled = false;
    fetch(`/api/admin/zoom-drift/${mid}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setZoomDrift(!!data.drift); })
      .catch(() => { /* fail quiet -- drift detection is best-effort */ });
    return () => { cancelled = true; };
  }, [isAdmin, zid, mid, driftCheckNonce]);
  const {
    googleSyncStatus,
    googleSyncError,
    zoomSyncStatus,
    zoomSyncError,
    syncing,
    handleRetrySync,
  } = useRetrySync({
    mid,
    initialGoogleSyncStatus,
    initialGoogleSyncError,
    initialZoomSyncStatus,
    initialZoomSyncError,
    onSyncSuccess: () => {
      setDriftCheckNonce((n) => n + 1);
      onSyncSuccess?.();
    },
  });
  const [kebabOpen, setKebabOpen] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [isDescTruncated, setIsDescTruncated] = useState(false);
  const zoomHostPool = useZoomHostPool();

  const kebabRef = useRef<HTMLDivElement>(null);
  const kebabFirstItemRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // Ref *callback* rather than a plain useRef -- it fires exactly once when the paragraph
  // actually mounts (the portal renders nothing until popupPosition is set, so a plain ref
  // wouldn't be attached yet on the render where we'd otherwise want to measure it), and,
  // unlike a dependency on popupPosition, does NOT re-fire on every reposition.
  const [descNode, setDescNode] = useState<HTMLParagraphElement | null>(null);
  const { popupRef, popupPosition } = usePopupPosition(anchorEl);

  // Desktop only: popupRef is never attached on phone (that branch renders inside BottomSheet,
  // not the ref={popupRef} div below), so every click -- including ones inside the sheet itself
  // -- would read as "outside". BottomSheet provides its own dialog/dismissal behavior there.
  useDismissibleLayer({
    isOpen: !isPhone && !!anchorEl && !!popupPosition,
    onDismiss: onBack,
    contentRef: popupRef,
    // Clicks on the anchor box are left alone -- that box's own onClick already handles
    // re-selecting/toggling it.
    ignoreEl: anchorEl,
  });

  // A layer of its own, stacked above the popup: the first Escape closes just this menu, and an
  // outside click inside the popup body closes the menu without dismissing the popup too.
  useDismissibleLayer({
    isOpen: kebabOpen,
    onDismiss: () => setKebabOpen(false),
    contentRef: kebabRef,
    initialFocusRef: kebabFirstItemRef,
  });

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

  const doesMeetingOccurOnDate = (date: Date): boolean => {
    // date is currentOccurrenceDate, an optional prop with no upstream validity guarantee
    // beyond an existence check at the call site below -- guard first, since the ET-safe
    // Intl.DateTimeFormat-based helpers below throw a RangeError on an invalid Date.
    if (isNaN(date.getTime())) return false;
    if (!isRecurring || !recurrencePattern) {
      const meetingDate = new Date(startDateTime);
      return formatETDateString(meetingDate) === formatETDateString(date);
    }

    // Shared with the server (matchesRecurrencePattern lives in recurrenceMatch.ts, re-exported
    // by the server-only meetingOccurrences.ts) so this popup can't disagree with what the
    // calendar actually rendered as an occurrence -- see recurrenceMatch.ts's file header.
    const etDateStr = formatETDateString(date);
    const [etYear, etMonth, etDay] = etDateStr.split('-').map(Number);
    const localDate = new Date(Date.UTC(etYear, etMonth - 1, etDay));

    return matchesRecurrencePattern(
      {
        type: recurrencePattern.type,
        startDate: recurrencePattern.startDate,
        endDate: recurrencePattern.endDate ?? null,
        interval: recurrencePattern.interval,
        daysOfWeek: recurrencePattern.daysOfWeek ?? [],
        weekOfMonth: recurrencePattern.weekOfMonth ?? null,
        dayOfMonth: recurrencePattern.dayOfMonth ?? null,
        excludedDates: recurrencePattern.excludedDates ?? [],
      },
      etDateStr,
      localDate,
    );
  };

  // Also drives DeleteRecurringModal's disableScoped below -- the deep-link (?mid=) path into a
  // recurring meeting never sets currentOccurrenceDate (there's no click to attribute a date
  // to), and a stale/mismatched one wouldn't validate server-side either; either way there's no
  // real occurrence to scope 'this'/'thisAndFollowing' against. recurrencePattern is checked
  // separately from isRecurring -- doesMeetingOccurOnDate's own `!isRecurring || !recurrencePattern`
  // branch is the *non-recurring* fallback (a plain date match), but it also fires for a
  // malformed isRecurring:true row with no pattern at all; without this extra check, that plain
  // date match against startDateTime would read as "yes, a known occurrence" and enable scoped
  // delete for a row the server 400s (scoped ops require an actual pattern).
  const hasKnownOccurrence =
    isRecurring && !!recurrencePattern && !!currentOccurrenceDate && doesMeetingOccurOnDate(currentOccurrenceDate);

  let displayStartDate = startDateTime;
  let displayEndDate = endDateTime;

  if (hasKnownOccurrence && currentOccurrenceDate) {
    // Keeps startDateTime's ET time-of-day, moved onto currentOccurrenceDate's ET calendar
    // day -- via convertETToUTC so this is correct regardless of the viewer's own timezone.
    const occurrenceDateStr = formatETDateString(currentOccurrenceDate);
    const { hour, minute, second } = getETTimeOfDay(startDateTime);
    try {
      // convertETToUTC's time-part parsing tolerates unpadded numbers, so no padStart needed.
      const newStartDate = new Date(convertETToUTC(`${occurrenceDateStr}T${hour}:${minute}:${second}`));
      // Milliseconds have no timezone component -- getETTimeOfDay doesn't carry them, so restore
      // directly from startDateTime rather than losing sub-second precision on the re-anchor.
      newStartDate.setUTCMilliseconds(startDateTime.getUTCMilliseconds());

      displayStartDate = newStartDate;

      const duration = endDateTime.getTime() - startDateTime.getTime();
      displayEndDate = new Date(displayStartDate.getTime() + duration);
    } catch (err) {
      // currentOccurrenceDate re-anchored onto this meeting's time-of-day lands in the DST
      // spring-forward gap -- not currently reachable in practice (getMeetingsForRange already
      // filters gap occurrences out before a date reaches this popup), guarded defensively so a
      // future caller can't crash here. Falls back to the meeting's own stored start/end.
      if (!isDstGapError(err)) throw err;
      console.warn(`Could not re-anchor onto ${occurrenceDateStr}: ${err.message}`);
    }
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

  // Recurrence's own copy never surfaced when (or whether) the series ends -- only its
  // frequency. endDate is the inclusive last day of the series (see IRecurrencePattern), null
  // meaning it runs indefinitely.
  const getRecurrenceEndText = (): string =>
    // new Date() wrap: pattern fields come off a JSON fetch, so endDate is a string at runtime
    // despite IRecurrencePattern's Date type -- Intl.format throws on it unwrapped.
    recurrencePattern?.endDate ? `Ends ${formatETLongDate(new Date(recurrencePattern.endDate))}` : "No end date";

  const timeRangeText = formatCompactTimeRange(
    etTimeFmt.format(displayStartDate),
    etTimeFmt.format(displayEndDate)
  );

  const primaryColor = ROOM_COLORS[room] ?? ZOOM_ROOM_COLOR;
  const primaryLocation = room || (zoomRoom ? stripZoomSuffix(zoomRoom) : '');
  const showZoomMismatchRow = !!(room && zoomRoom && isZoomRoomMismatched(room, zoomRoom));
  const sharedRows = sharedWith ?? [];
  const linkedRows = linkedSchedules ?? [];
  const sharedWithText = sharedRows.map((row) => `${row.title} (${row.modeType})`).join(', ');

  const content = (
    <div className={styles.meetingDetails}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <Icon name="back-arrow" ariaLabel="Back" />
        </button>
        <h1 id={titleId}>{title}</h1>
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
                <button ref={kebabFirstItemRef} onClick={() => { setKebabOpen(false); onEdit(); }}>Edit</button>
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
        <MeetingSyncStatusBand
          isAdmin={isAdmin}
          googleSyncStatus={googleSyncStatus}
          googleSyncError={googleSyncError}
          zoomSyncStatus={zoomSyncStatus}
          zoomSyncError={zoomSyncError}
          zoomDrift={zoomDrift}
          sharedScheduleDiverged={zoomScheduleDiverged && sharedRows.length > 0}
          sharedWithText={sharedWithText}
          syncing={syncing}
          onRetrySync={handleRetrySync}
          conflictCount={conflictCount}
          hasSuspension={hasSuspension}
          suspendedSince={suspendedSince}
          resumesAt={resumesAt}
          suspensionActive={suspensionActive}
        />

        <div className={styles.scheduleGroup}>
          <p className={styles.scheduleTime}>
            <Icon name="clock" />
            <span>{formatMeetingDateLine(displayStartDate)} · {timeRangeText}</span>
          </p>

          {isRecurring && (
            <p className={styles.recurrenceLine}>
              <Icon name="repeat" />
              <span>{getRecurrenceText()} · {getRecurrenceEndText()}</span>
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

        {isAdmin && linkedRows.length > 0 && (
          <div className={styles.linkedScheduleGroup}>
            <p className={styles.linkedScheduleHeading}>Also meets</p>
            {linkedRows.map((schedule) => (
              <ScheduleSummaryCard
                key={schedule.mid}
                schedule={schedule}
                // A full navigation, not a client-side route change: page.tsx reads ?mid= once
                // on mount to resolve a deep link.
                editHref={`/?mid=${encodeURIComponent(schedule.mid)}&edit=1`}
              />
            ))}
          </div>
        )}

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

        {isAdmin && (email || zoomHost || sharedRows.length > 0) && (
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
            {sharedRows.length > 0 && (
              <p className={styles.contactRow}>
                <Icon name="link" />
                <span>Zoom link shared with {sharedWithText}</span>
              </p>
            )}
            {zoomManaged === false && (
              <p className={styles.contactRow}>
                <Icon name="lock" />
                <span>External Zoom link; the app keeps calendars in sync but never changes the Zoom host.</span>
              </p>
            )}
            {/* Provenance is only shown when it's a real session email -- meetings created
                before creator was server-set carry a literal placeholder ("Creator"). */}
            {(creator?.includes("@") || lastEditedBy) && (
              <p className={styles.contactRow}>
                <Icon name="clock" />
                <span>
                  {creator?.includes("@") ? `Entered by ${creator}` : null}
                  {creator?.includes("@") && lastEditedBy ? " · " : null}
                  {lastEditedBy ? `Last edited by ${lastEditedBy}` : null}
                </span>
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
        disableScoped={!hasKnownOccurrence}
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
      role="dialog"
      aria-labelledby={titleId}
    >
      {content}
      {modals}
    </div>,
    document.body
  );
};

export default ViewMeetingDetails;
