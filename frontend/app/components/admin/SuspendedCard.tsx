"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "./Card";
import TopLoadingBar from "../atoms/TopLoadingBar";
import ResumeMeetingModal from "../meeting-form/ResumeMeetingModal";
import { formatSuspensionStatusText } from "../../../util/suspensionText";
import styles from "../../../styles/components/admin/DiagnosticsTab.module.scss";

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
      await load();
    } catch (err) {
      console.error("Error resuming meeting:", err);
      alert(`Error: could not resume the meeting${err instanceof Error ? ` (${err.message})` : ""}`);
    } finally {
      setResumingMid((current) => (current === mid ? null : current));
    }
  };

  if (error) return <Card data-testid="diagnostics-suspended-panel">{error}</Card>;
  if (!suspendedMeetings) {
    return (
      <Card data-testid="diagnostics-suspended-panel">
        <TopLoadingBar active={loading} />
        Loading suspended meetings…
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="diagnostics-suspended-panel">
        <TopLoadingBar active={loading} />
        <div className={styles.panelHeader}>⏸ Suspended ({total})</div>
        <div className={styles.panelSubhead}>
          Meetings currently suspended, or with a suspension scheduled for a future date. Active
          ones are hidden from the live calendar and Google Calendar; scheduled ones still show
          normally until their start date arrives. All remain in the system and can be reactivated
          (or have a scheduled suspension cancelled) here or from the meeting itself.
        </div>
        {suspendedMeetings.length === 0 ? (
          <div className={styles.emptyState}>No suspended meetings.</div>
        ) : (
          suspendedMeetings.map((meeting) => (
            <div key={meeting.mid} className={styles.meetingRow}>
              <div className={styles.syncIssueRow}>
                <div>
                  <span className={styles.meetingTitle}>{meeting.title}</span>{" "}
                  <span className={styles.meetingTags}>({meeting.calType.join(", ")})</span>
                  <div className={styles.meetingMeta}>
                    {meeting.room} · {meeting.modeType} · {meeting.calType.join(", ")}
                  </div>
                  <div className={styles.issueLine}>
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
          ))
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
