import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../app/components/shared/ToastProvider";
import EditMeetingSidebar from "../../app/components/meeting-form/EditMeeting";
import { IMeeting } from "../../types/models";

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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hosts: [], mid: "m-1" }),
  }) as jest.Mock;
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

  it("skips the scope modal entirely when there's no occurrence context (e.g. Diagnostics mount sites)", async () => {
    renderEdit(null);
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Update Meeting" }));

    expect(screen.queryByLabelText("This event")).not.toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = lastUpdateMeetingBody();
    expect(body.editScope).toBeUndefined();
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
});
