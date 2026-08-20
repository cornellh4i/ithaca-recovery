"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "../shared/Card";
import Icon from "../../ui/displays/Icon";
import TopLoadingBar from "../../ui/displays/TopLoadingBar";
import DiagnosticsCardError from "./DiagnosticsCardError";
import ResumeMeetingModal from "../../meeting-form/ResumeMeetingModal";
import { useToast } from "../../shared/ToastProvider";
import { invalidateAllDayCache } from "../../calendar/desktop/DayView";
import { invalidateAllWeekCache } from "../../../../hooks/useWeekMeetings";
import { formatSuspensionStatusText } from "../../../../util/meetings/suspensionText";
import styles from "./DiagnosticsTab.module.scss";

interface SuspendedRow {
  mid: string;
  title: string;
  group: string;
  room: string;
  modeType: string;
  calType: string[];
  updatedAt: string | null;
  resumesAt: string | null;
  suspendedSince: string | null;
  suspensionActive: boolean;
}

const SuspendedCard: React.FC = () => {
  const { showToast } = useToast();
  const [suspendedMeetings, setSuspendedMeetings] = useState<SuspendedRow[] | null>(null);
  // Uncapped count -- suspendedMeetings itself is sliced to the 20 most recently updated by
  // the API, so the header can't just use suspendedMeetings.length once that cap is hit.
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which row's "Resume"/"Cancel" is in flight, so only that row shows "Resuming…" instead of
  // every row disabling at once.
  const [resumingMid, setResumingMid] = useState<string | null>(null);
  // The row currently showing its ResumeMeetingModal (Immediately vs. On a date), if any --
  // { mid, title } rather than just the id since the modal needs the title too.
  const [resumeModalMeeting, setResumeModalMeeting] = useState<{ mid: string; title: string; suspendedSince: string | null; suspensionActive: boolean } | null>(null);
  // Guards against out-of-order resolution: resuming two different rows back-to-back fires two
  // independent load() calls, so a slower first resume's response could otherwise land after
  // (and clobber) a faster second resume's fresher one.
  const latestRequestId = useRef(0);

  const load = async () => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/diagnostics/suspended");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { suspendedMeetings: SuspendedRow[]; total: number } = await response.json();
      if (requestId === latestRequestId.current) {
        setSuspendedMeetings(json.suspendedMeetings);
        setTotal(json.total);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching suspended meetings:", err);
      if (requestId === latestRequestId.current) setError("Failed to load suspended meetings.");
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Same endpoint ViewMeeting.tsx's kebab-menu "Reactivate" calls -- reused here so a suspended
  // meeting can be resumed straight from the Diagnostics panel too. `on` is omitted for an
  // immediate resume, or an ISO date string to schedule the resume instead (see
  // ResumeMeetingModal / the resume route's `on` branch). Only reloads this card, not the other
  // Diagnostics panels.
  const resumeMeeting = async (mid: string, on: string | null) => {
    setResumingMid(mid);
    try {
      const response = await fetch("/api/update/meeting/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(on ? { mid, on } : { mid }),
      });
      if (!response.ok) {
        // Previously silent on failure (console.error only) -- a rejected date (e.g. "on" before
        // the suspension's own start) would just close the modal with no visible feedback at all.
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `HTTP error! status: ${response.status}`);
      }
      // This resume happened outside the calendar route entirely, so its Day/Week views
      // (if open in another tab, or navigated back to later) would otherwise keep serving
      // this meeting as still-suspended from their own module-level cache until that cache's
      // next unrelated fetch happens to overwrite it.
      invalidateAllDayCache();
      invalidateAllWeekCache();
      await load();
      showToast({ variant: "success", title: "Meeting resumed successfully." });
    } catch (err) {
      console.error("Error resuming meeting:", err);
      showToast({
        variant: "error",
        title: `Could not resume the meeting${err instanceof Error ? ` (${err.message})` : ""}`,
      });
    } finally {
      setResumingMid((current) => (current === mid ? null : current));
    }
  };

  if (error) {
    return (
      <Card accent="suspended" data-testid="diagnostics-suspended-panel">
        <DiagnosticsCardError message={error} onRetry={load} />
      </Card>
    );
  }
  if (!suspendedMeetings) {
    return (
      <Card accent="suspended" data-testid="diagnostics-suspended-panel">
        <TopLoadingBar active={loading} label="Loading suspended meetings" />
        Loading suspended meetings…
      </Card>
    );
  }

  return (
    <>
      <Card accent="suspended" data-testid="diagnostics-suspended-panel">
        <TopLoadingBar active={loading} label="Loading suspended meetings" />
        <div className={styles.panelHeader}>
          <Icon name="pause" className={`${styles.panelIcon} ${styles.panelIconSuspended}`} />
          Suspended ({total})
        </div>
        <div className={styles.panelSubhead}>
          Suspended now, or scheduled to be. Active suspensions are hidden from the live Google 
          calendars; scheduled ones show normally until their start date. Nothing is deleted yet, 
          you can resume or delete permanently here.
        </div>
        {suspendedMeetings.length === 0 ? (
          <div className={styles.emptyState}>No suspended meetings.</div>
        ) : (
          <div className={styles.meetingListBox}>
            {suspendedMeetings.map((meeting) => (
              <div key={meeting.mid} className={styles.meetingRow}>
                <div className={styles.syncIssueRow}>
                  <div>
                    <span className={styles.meetingTitle}>{meeting.title}</span>
                    <div className={styles.meetingMeta}>
                      {[meeting.room, meeting.modeType, meeting.calType.join(", ")].filter(Boolean).join(" · ")}
                    </div>
                    <div className={`${styles.issueLine} ${styles.navyText}`}>
                      {formatSuspensionStatusText(meeting.suspendedSince, meeting.resumesAt, meeting.suspensionActive)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => setResumeModalMeeting({ mid: meeting.mid, title: meeting.title, suspendedSince: meeting.suspendedSince, suspensionActive: meeting.suspensionActive })}
                    disabled={resumingMid === meeting.mid}
                  >
                    {resumingMid === meeting.mid ? "Resuming…" : meeting.suspensionActive ? "Resume" : "Cancel"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ResumeMeetingModal
        isOpen={resumeModalMeeting !== null}
        title={resumeModalMeeting?.title ?? ""}
        suspendedSince={resumeModalMeeting?.suspendedSince}
        isActive={resumeModalMeeting?.suspensionActive ?? true}
        onCancel={() => setResumeModalMeeting(null)}
        onConfirm={(on) => {
          if (resumeModalMeeting) resumeMeeting(resumeModalMeeting.mid, on);
          setResumeModalMeeting(null);
        }}
      />
    </>
  );
};

export default SuspendedCard;
