import { useCallback, useEffect, useRef } from "react";
import { IMeeting } from "../types/models";

export interface UseMeetingDetailsSyncOptions {
  selectedMeetingID: string | null;
  // Bumped by the 30s calendar auto-poll (see page.tsx) and by successful writes (delete,
  // suspend, resume, a meeting update, a sync retry) -- both a genuine selection change and a
  // background refresh of the same selection flow through here.
  refreshTrigger: number;
  setSelectedMeeting: (meeting: IMeeting | null) => void;
  setShowEditMeeting: (show: boolean) => void;
  setLastClickedDate: (date: Date | null) => void;
}

// Keeps `selectedMeeting` in sync with `selectedMeetingID`, refreshing it on every
// `refreshTrigger` bump too (a successful retry-sync can adopt a live Zoom passcode/link
// server-side; the popup must re-render from the fresh row). Only a genuine change of *which*
// meeting is selected resets `showEditMeeting` back to View mode -- a background refresh of the
// meeting an admin already has open in Edit must never silently discard their in-progress
// changes by force-closing the panel out from under them.
export function useMeetingDetailsSync({
  selectedMeetingID,
  refreshTrigger,
  setSelectedMeeting,
  setShowEditMeeting,
  setLastClickedDate,
}: UseMeetingDetailsSyncOptions): void {
  const fetchMeetingDetails = useCallback(async (meetingId: string, resetEditState: boolean) => {
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: "GET" });
      if (response.ok) {
        const data: IMeeting = await response.json();
        // Batched: keeps the old panel on screen until the new meeting is ready.
        if (resetEditState) setShowEditMeeting(false);
        setSelectedMeeting(data);
      } else {
        console.error("Failed to fetch meeting details");
      }
    } catch (error) {
      console.error("Error fetching meeting details:", error);
    }
    // setSelectedMeeting/setShowEditMeeting are setState functions from the caller's own
    // useState -- stable across renders, safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fires only when the *selected meeting itself* changes -- a genuinely new selection
  // legitimately drops back to View mode rather than silently continuing to edit whatever the
  // previous selection was.
  useEffect(() => {
    if (selectedMeetingID) {
      // Async fetch-then-set; the lint rule can't see the setState calls sit after an
      // await, so this is a false positive for the standard "load on ID change" pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchMeetingDetails(selectedMeetingID, true);
    } else {
      setShowEditMeeting(false);
      setSelectedMeeting(null);
      // lastClickedDate is set directly by the calendar box's own click handler -- it already
      // knows which specific occurrence's column/row was clicked, which the globally-selected
      // calendar date does not. Left unset here for the deep-link (?mid=) path, which has no
      // click to attribute a date to.
      setLastClickedDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeetingID, fetchMeetingDetails]);

  // Re-fetches the same open meeting's data on a background refresh (the 30s auto-poll, or a
  // successful retry-sync) without resetting showEditMeeting -- unlike the effect above, this is
  // never a new selection, just fresher data for the current one. Guarded on selectedMeetingID
  // so it doesn't fire before anything is selected.
  const prevRefreshTrigger = useRef(refreshTrigger);
  useEffect(() => {
    // Every effect runs once on mount regardless of its dependency values -- skip any run where
    // refreshTrigger didn't actually change, since the effect above already fetches on mount
    // (with resetEditState: true); without this guard, selecting a meeting would fire two
    // redundant fetches back to back. Compared against the previous value rather than a "skip
    // first run" flag so the guard stays correct under dev-mode StrictMode effect replays,
    // which re-run effects while refs keep their values.
    if (prevRefreshTrigger.current === refreshTrigger) return;
    prevRefreshTrigger.current = refreshTrigger;
    if (!selectedMeetingID) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMeetingDetails(selectedMeetingID, false);
    // selectedMeetingID/fetchMeetingDetails deliberately excluded -- this effect's only trigger
    // is refreshTrigger; the effect above already handles a selectedMeetingID change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);
}
