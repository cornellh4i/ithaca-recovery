import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { useMeetingDetailsSync } from "../../hooks/useMeetingDetailsSync";
import { IMeeting } from "../../types/models";

const meeting = (mid: string): IMeeting => ({
  mid,
  title: `Meeting ${mid}`,
  description: "",
  creator: "Creator",
  group: "Group",
  startDateTime: new Date("2026-08-24T18:00:00.000Z"),
  endDateTime: new Date("2026-08-24T19:00:00.000Z"),
  email: "seed@test.icr",
  calType: ["AA"],
  modeType: "In Person",
  room: "Serenity Room",
  status: "Active",
  isRecurring: false,
});

const Harness: React.FC<{
  selectedMeetingID: string | null;
  refreshTrigger: number;
  setSelectedMeeting: (meeting: IMeeting | null) => void;
  setShowEditMeeting: (show: boolean) => void;
  setLastClickedDate: (date: Date | null) => void;
}> = (props) => {
  useMeetingDetailsSync(props);
  return null;
};

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useMeetingDetailsSync", () => {
  it("fetches and resets showEditMeeting when a new meeting is selected", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => meeting("m-1"),
    });
    const setSelectedMeeting = jest.fn();
    const setShowEditMeeting = jest.fn();
    const setLastClickedDate = jest.fn();

    render(
      <Harness
        selectedMeetingID="m-1"
        refreshTrigger={0}
        setSelectedMeeting={setSelectedMeeting}
        setShowEditMeeting={setShowEditMeeting}
        setLastClickedDate={setLastClickedDate}
      />
    );

    await waitFor(() => expect(setSelectedMeeting).toHaveBeenCalledWith(meeting("m-1")));
    expect(setShowEditMeeting).toHaveBeenCalledWith(false);
  });

  it("clears selection state when selectedMeetingID becomes null", () => {
    const setSelectedMeeting = jest.fn();
    const setShowEditMeeting = jest.fn();
    const setLastClickedDate = jest.fn();

    render(
      <Harness
        selectedMeetingID={null}
        refreshTrigger={0}
        setSelectedMeeting={setSelectedMeeting}
        setShowEditMeeting={setShowEditMeeting}
        setLastClickedDate={setLastClickedDate}
      />
    );

    expect(setShowEditMeeting).toHaveBeenCalledWith(false);
    expect(setSelectedMeeting).toHaveBeenCalledWith(null);
    expect(setLastClickedDate).toHaveBeenCalledWith(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Regression: a background refresh of the meeting an admin already has open in Edit
  // (the 30s calendar auto-poll, or a successful retry-sync) must refresh its data without
  // forcing the panel back to View mode -- that would silently discard an in-progress edit,
  // bypassing EditMeetingSidebar's own unsaved-changes confirmation entirely.
  it("refreshes the same meeting's data on a refreshTrigger bump without resetting showEditMeeting", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => meeting("m-1"),
    });
    const setSelectedMeeting = jest.fn();
    const setShowEditMeeting = jest.fn();
    const setLastClickedDate = jest.fn();

    const { rerender } = render(
      <Harness
        selectedMeetingID="m-1"
        refreshTrigger={0}
        setSelectedMeeting={setSelectedMeeting}
        setShowEditMeeting={setShowEditMeeting}
        setLastClickedDate={setLastClickedDate}
      />
    );
    await waitFor(() => expect(setSelectedMeeting).toHaveBeenCalledTimes(1));
    setShowEditMeeting.mockClear();
    setSelectedMeeting.mockClear();

    await act(async () => {
      rerender(
        <Harness
          selectedMeetingID="m-1"
          refreshTrigger={1}
          setSelectedMeeting={setSelectedMeeting}
          setShowEditMeeting={setShowEditMeeting}
          setLastClickedDate={setLastClickedDate}
        />
      );
    });

    await waitFor(() => expect(setSelectedMeeting).toHaveBeenCalledWith(meeting("m-1")));
    expect(setShowEditMeeting).not.toHaveBeenCalled();
  });

  it("does not fetch on mount before any meeting is selected, even if refreshTrigger is nonzero", () => {
    const setSelectedMeeting = jest.fn();
    const setShowEditMeeting = jest.fn();
    const setLastClickedDate = jest.fn();

    render(
      <Harness
        selectedMeetingID={null}
        refreshTrigger={3}
        setSelectedMeeting={setSelectedMeeting}
        setShowEditMeeting={setShowEditMeeting}
        setLastClickedDate={setLastClickedDate}
      />
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
