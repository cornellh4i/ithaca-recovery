import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../app/components/shared/ToastProvider";
import EditMeetingSidebar from "../../app/components/meeting-form/EditMeeting";
import { IMeeting } from "../../types/models";

// Mocked (not the real fetch-driven poll loop) so the parent-vs-newMid polling tests below can
// assert exactly which mid(s) got polled, with what expectations, without waiting out real
// POLL_INTERVAL_MS ticks -- see the "scoped-edit poll target" describe block.
jest.mock("../../services/syncMeeting", () => ({
  pollMeetingSyncStatus: jest.fn(),
  describeSyncFailure: jest.fn(),
}));
import { pollMeetingSyncStatus, describeSyncFailure } from "../../services/syncMeeting";

// The series' anchor row -- what retrieve/meeting/[id] returns and what the form seeds Date/
// Time from. A recurring meeting's clicked occurrence is usually weeks away from this date;
// that gap is exactly what the re-anchoring fix under test corrects for.
const anchorMeeting: IMeeting = {
  mid: "m-1",
  title: "Recurring Series",
  description: "",
  creator: "Creator",
  group: "Group",
  startDateTime: new Date("2026-07-05T22:00:00.000Z"), // Sun Jul 5, 2026, 6:00 PM ET
  endDateTime: new Date("2026-07-05T23:00:00.000Z"), // 7:00 PM ET
  email: "seed@test.icr",
  calType: ["AA"],
  modeType: "In Person",
  room: "Serenity Room",
  status: "Active",
  isRecurring: true,
  recurrencePattern: {
    mid: "m-1",
    type: "weekly",
    startDate: new Date("2026-07-05T00:00:00.000Z"),
    daysOfWeek: ["Sunday"],
    firstDayOfWeek: "Sunday",
    interval: 1,
    excludedDates: [],
  },
};

// The occurrence the user actually clicked on the calendar -- a later Sunday, same time-of-day.
const occurrenceDate = new Date("2026-08-09T22:00:00.000Z"); // Sun Aug 9, 2026, 6:00 PM ET

// ZoomHostField's useZoomHostPool fires a fetch effect on mount -- stubbed the same way
// NewMeeting.test.tsx/ViewMeeting.test.tsx do, since nothing here exercises a specific host
// list. update/meeting itself is mocked per-test via jest.Mock.mockResolvedValueOnce where a
// distinct response matters.
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hosts: [], mid: "m-1" }),
  }) as jest.Mock;
  // Default: resolves as "nothing to report" so the fire-and-forget .then() in every other
  // test's save flow doesn't throw -- tests that care about the actual poll targets/results
  // override this themselves.
  (pollMeetingSyncStatus as jest.Mock).mockResolvedValue({
    settled: false, googleSyncStatus: null, googleSyncError: null, zoomSyncStatus: null, zoomSyncError: null,
  });
  (describeSyncFailure as jest.Mock).mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const renderEdit = (occurrenceDateProp: Date | null = occurrenceDate) =>
  render(
    <ToastProvider>
      <EditMeetingSidebar
        meeting={anchorMeeting}
        onClose={jest.fn()}
        onUpdateSuccess={jest.fn()}
        occurrenceDate={occurrenceDateProp}
      />
    </ToastProvider>
  );

function lastUpdateMeetingBody(): Record<string, unknown> {
  const call = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === "/api/update/meeting");
  return JSON.parse(call![1].body);
}

describe("EditMeetingSidebar mid-series occurrence hint", () => {
  it("shows a hint when the clicked occurrence differs from the series' start date", async () => {
    renderEdit();
    await act(async () => {});
    // The whole sentence must be ONE element (a span inside the flex hint): bare text
    // children of the flex <p> become separate anonymous flex items, and the spaces at
    // their boundaries (around the date) collapse away visually.
    const sentence = screen.getByText(/You opened this meeting from its August 9, 2026 occurrence\./);
    expect(sentence.tagName).toBe("SPAN");
  });

  it("shows no hint when there's no occurrence context", async () => {
    renderEdit(null);
    await act(async () => {});
    expect(screen.queryByText(/You opened this meeting from its/)).not.toBeInTheDocument();
  });

  it("shows no hint when the clicked occurrence is the series' own start date", async () => {
    // anchorMeeting.startDateTime is Sun Jul 5, 2026, 6:00 PM ET -- same ET calendar day as
    // the occurrence clicked here, just a different time-of-day.
    render(
      <ToastProvider>
        <EditMeetingSidebar
          meeting={anchorMeeting}
          onClose={jest.fn()}
          onUpdateSuccess={jest.fn()}
          occurrenceDate={new Date("2026-07-05T23:00:00.000Z")}
        />
      </ToastProvider>
    );
    await act(async () => {});
    expect(screen.queryByText(/You opened this meeting from its/)).not.toBeInTheDocument();
  });
});

describe("EditMeetingSidebar recurring-scope re-anchoring", () => {
  it("re-anchors an untouched Date field onto the clicked occurrence for a scoped save", async () => {
    renderEdit();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));
    fireEvent.click(screen.getByLabelText("This event"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/update/meeting",
      expect.objectContaining({ method: "PUT" }),
    ));

    const body = lastUpdateMeetingBody();
    // Lands on the occurrence's calendar date (Aug 9), keeping the anchor row's 6 PM ET
    // time-of-day and 1-hour duration.
    expect(body.startDateTime).toBe(new Date("2026-08-09T22:00:00.000Z").toISOString());
    expect(body.endDateTime).toBe(new Date("2026-08-09T23:00:00.000Z").toISOString());
    expect(body.editScope).toBe("this");
    expect(body.recurrencePattern).toBeUndefined();
  });

  it("respects an explicitly edited Date field instead of re-anchoring", async () => {
    renderEdit();
    await act(async () => {});

    const dateInput = screen.getByPlaceholderText("MM/DD/YYYY");
    fireEvent.change(dateInput, { target: { value: "09/01/2026" } });
    fireEvent.blur(dateInput);

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));
    fireEvent.click(screen.getByLabelText("This event"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = lastUpdateMeetingBody();
    expect(new Date(body.startDateTime as string).toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("skips the scope modal and submits whole-series when recurrence is turned off", async () => {
    renderEdit();
    await act(async () => {});

    // Unchecks "This meeting is recurring" -- the form now reports isRecurring: false even
    // though the meeting it opened with was recurring.
    fireEvent.click(screen.getByText("This meeting is recurring", { exact: true }));

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    // No scope modal: the payload carries no recurrencePattern, so 'thisAndFollowing' would
    // 400 server-side and 'this' is already disabled by the recurrence change -- straight to
    // submit instead, same as any other non-recurring save.
    expect(screen.queryByLabelText("This event")).not.toBeInTheDocument();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = lastUpdateMeetingBody();
    expect(body.editScope).toBeUndefined();
    expect(body.occurrenceDate).toBeUndefined();
    expect(body.recurrencePattern).toBeUndefined();
    expect(body.isRecurring).toBe(false);
  });

  describe("post-save poll target", () => {
    // A scoped save ('this'/'thisAndFollowing') makes no Zoom call and never updates the
    // *parent* row's own sync status -- meetingResponse.mid is still the parent, so polling it
    // would just re-surface whatever zoomSyncStatus it already had before this edit (here, a
    // stale 'error' from something unrelated) as a false failure for a save that actually
    // succeeded. Only the new detached/tail row (newMid) reflects this edit's real outcome.
    const mockPollByMid = () => {
      (pollMeetingSyncStatus as jest.Mock).mockImplementation((mid: string) => {
        if (mid === "m-1") {
          // The parent's pre-existing, unrelated sync status -- must never be read for a
          // scoped save.
          return Promise.resolve({
            settled: true, googleSyncStatus: "synced", googleSyncError: null,
            zoomSyncStatus: "error", zoomSyncError: "stale failure",
          });
        }
        return Promise.resolve({
          settled: true, googleSyncStatus: "synced", googleSyncError: null, zoomSyncStatus: null, zoomSyncError: null,
        });
      });
      (describeSyncFailure as jest.Mock).mockImplementation((result) =>
        result.zoomSyncStatus === "error"
          ? `The meeting saved, but failed to sync: Zoom (${result.zoomSyncError}).`
          : null
      );
    };

    it("scoped save: skips the stale parent poll, polls only newMid, and shows no failure toast", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hosts: [], mid: "m-1", newMid: "m-2" }),
      }) as jest.Mock;
      mockPollByMid();

      renderEdit();
      await act(async () => {});

      fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));
      fireEvent.click(screen.getByLabelText("This event"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(pollMeetingSyncStatus).toHaveBeenCalled());
      expect(pollMeetingSyncStatus).toHaveBeenCalledTimes(1);
      expect(pollMeetingSyncStatus).toHaveBeenCalledWith("m-2", { expectGoogle: true, expectZoom: false });
      expect(pollMeetingSyncStatus).not.toHaveBeenCalledWith("m-1", expect.anything());

      await waitFor(() => expect(describeSyncFailure).toHaveBeenCalled());
      expect(screen.queryByText(/failed to sync/i)).not.toBeInTheDocument();
    });

    it("unscoped ('all') save: still polls the parent, unchanged -- a real Zoom failure still toasts", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hosts: [], mid: "m-1" }),
      }) as jest.Mock;
      mockPollByMid();

      renderEdit();
      await act(async () => {});

      fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));
      fireEvent.click(screen.getByLabelText("All events"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(pollMeetingSyncStatus).toHaveBeenCalledWith(
        "m-1", expect.objectContaining({ expectGoogle: true }),
      ));

      expect(await screen.findByText(/failed to sync: Zoom \(stale failure\)/)).toBeInTheDocument();
    });
  });

  // Regression: editing a recurring meeting from Diagnostics used to skip the scope modal
  // entirely and silently rewrite the whole series. It must now still show the modal, force an
  // explicit "All events" confirmation, and only submit once that's confirmed.
  it("shows the scope modal with scoped options disabled when there's no occurrence context (e.g. Sync Issues panel), and applies scope 'all' only after explicit confirmation", async () => {
    renderEdit(null);
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    const thisEventRadio = await screen.findByLabelText("This event");
    expect(thisEventRadio).toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeDisabled();
    expect(screen.getByLabelText("All events")).toBeChecked();
    expect(screen.getByText(/Open the meeting from a calendar day to edit specific occurrences/)).toBeInTheDocument();

    // No request fired yet -- the modal is a real gate, not just a display.
    expect(global.fetch).not.toHaveBeenCalledWith("/api/update/meeting", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/update/meeting",
      expect.objectContaining({ method: "PUT" }),
    ));
    const body = lastUpdateMeetingBody();
    expect(body.editScope).toBeUndefined();
    expect(body.occurrenceDate).toBeUndefined();
  });

  // Regression for a false-positive isRecurrenceDirty: a stored pattern with an empty
  // daysOfWeek (a real persisted shape -- e.g. tests/factories/meeting.ts's seedRecurringMeeting
  // default) makes RecurringMeeting.tsx's own "seed a default weekday" effect fire a *second*
  // mount-time report correcting daysOfWeek from [] to the meeting's actual weekday. Without the
  // settling window, that self-correction (no user input at all) used to read as a real
  // recurrence edit, wrongly disabling "This event".
  it("doesn't treat RecurringMeeting's own default-weekday self-seed as a user recurrence edit", async () => {
    const meetingWithEmptyDaysOfWeek: IMeeting = {
      ...anchorMeeting,
      recurrencePattern: { ...anchorMeeting.recurrencePattern!, daysOfWeek: [] },
    };
    render(
      <ToastProvider>
        <EditMeetingSidebar
          meeting={meetingWithEmptyDaysOfWeek}
          onClose={jest.fn()}
          onUpdateSuccess={jest.fn()}
          occurrenceDate={occurrenceDate}
        />
      </ToastProvider>,
    );
    // Lets both the mount-time report and its self-corrected follow-up (plus the settling
    // window's real setTimeout(0)) resolve before interacting, same as a real user would only
    // be able to click after the page has actually settled.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    const thisEventRadio = screen.getByLabelText("This event");
    expect(thisEventRadio).not.toBeDisabled();
    fireEvent.click(thisEventRadio);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = lastUpdateMeetingBody();
    expect(body.editScope).toBe("this");
  });

  // The server always applies a Mode change to the whole series (400s a scoped save that
  // carries one) -- the modal must force scope 'all' rather than let the user pick a scope
  // that's guaranteed to fail server-side.
  it("disables both scoped options and forces All events when Mode was changed", async () => {
    renderEdit();
    await act(async () => {});

    // anchorMeeting.modeType is "In Person" -- Remote needs no room/zoomRoom, so this change
    // alone doesn't trip validation (unlike switching to Hybrid, which would also require
    // filling in a Zoom Room first and conflate this test with a room/zoomRoom edit).
    fireEvent.click(screen.getByRole("button", { name: "Remote" }));
    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    expect(screen.getByLabelText("This event")).toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeDisabled();
    expect(screen.getByLabelText("All events")).toBeChecked();
    expect(screen.getByText(/Mode and host changes apply to the whole series/)).toBeInTheDocument();
  });

  // 'thisAndFollowing' with an edited Date field would give the child row a startDateTime from
  // the edited Date field while its RecurrencePattern.startDate comes from the clicked
  // occurrenceDate -- a divergent anchor. 'this' stays available (a date change unambiguously
  // means "move this one occurrence" there, and EditMeeting's re-anchor logic only applies when
  // the Date field is untouched, which it explicitly isn't here).
  it("disables only This and following when the Date field was changed", async () => {
    renderEdit();
    await act(async () => {});

    const dateInput = screen.getByPlaceholderText("MM/DD/YYYY");
    fireEvent.change(dateInput, { target: { value: "09/01/2026" } });
    fireEvent.blur(dateInput);

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    expect(screen.getByLabelText("This event")).not.toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeDisabled();
    expect(screen.getByLabelText("All events")).not.toBeDisabled();
    expect(screen.getByText(/Date changes apply to a single event or the whole series/)).toBeInTheDocument();
  });

  // zoomRoom changes are now honored for every scope (the child row takes the new Zoom Room) --
  // unlike Mode/Host, they must NOT disable the scoped options.
  it("does not gate scoped options when only the Zoom Room was changed", async () => {
    const hybridMeeting: IMeeting = {
      ...anchorMeeting,
      modeType: "Hybrid",
      room: "Serenity Room",
      zoomRoom: "Serenity Room - Zoom",
    };
    render(
      <ToastProvider>
        <EditMeetingSidebar
          meeting={hybridMeeting}
          onClose={jest.fn()}
          onUpdateSuccess={jest.fn()}
          occurrenceDate={occurrenceDate}
        />
      </ToastProvider>,
    );
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: /Serenity Room - Zoom/ }));
    fireEvent.click(screen.getByRole("option", { name: "Unity Room - Zoom" }));
    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    expect(screen.getByLabelText("This event")).not.toBeDisabled();
    expect(screen.getByLabelText("This and following events")).not.toBeDisabled();
  });
});

describe("EditMeetingSidebar stays open during ordinary field interaction", () => {
  const renderEditWithOnClose = () => {
    const onClose = jest.fn();
    render(
      <ToastProvider>
        <EditMeetingSidebar
          meeting={anchorMeeting}
          onClose={onClose}
          onUpdateSuccess={jest.fn()}
          occurrenceDate={occurrenceDate}
        />
      </ToastProvider>,
    );
    return onClose;
  };

  it("keeps the panel open after selecting a Room dropdown option", async () => {
    const onClose = renderEditWithOnClose();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: /Serenity Room/ }));
    fireEvent.click(screen.getByRole("option", { name: "Unity Room" }));

    expect(screen.getByRole("button", { name: "Update Meeting" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the panel open while typing digits into the Start time field", async () => {
    const onClose = renderEditWithOnClose();
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "09:15" } });

    expect(screen.getByRole("button", { name: "Update Meeting" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the panel open on a scroll event", async () => {
    const onClose = renderEditWithOnClose();
    await act(async () => {});

    fireEvent.scroll(window);

    expect(screen.getByRole("button", { name: "Update Meeting" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
