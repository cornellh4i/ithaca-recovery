import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { ToastProvider } from "../../app/components/shared/ToastProvider";

// uuid ships ESM-only (no CJS build as of v14) -- @swc/jest's transform doesn't cover
// node_modules by default, so importing the real module here fails to parse. Mocked rather
// than reconfiguring transformIgnorePatterns repo-wide for one test file's sake.
jest.mock("uuid", () => ({ v4: () => "test-uuid" }));

import NewMeetingSidebar, { type NewMeetingSidebarHandle } from "../../app/components/meeting-form/NewMeeting";

// ZoomHostField's useZoomHostPool fires a fetch effect on mount -- stub it the same way
// ViewMeeting.test.tsx does, since nothing here exercises a specific host list.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hosts: [] }),
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const renderNewMeeting = (ref: React.RefObject<NewMeetingSidebarHandle | null>, setIsNewMeetingOpen = jest.fn()) =>
  render(
    <ToastProvider>
      <NewMeetingSidebar
        ref={ref}
        setIsNewMeetingOpen={setIsNewMeetingOpen}
        triggerCalendarRefresh={jest.fn()}
        selectedDate={new Date("2026-08-20T00:00:00Z")}
        selectedView="week"
      />
    </ToastProvider>
  );

describe("NewMeetingSidebar", () => {
  // The mobile New Meeting sheet's Escape-to-close (MobileFullScreenSheet's onClose) calls
  // ref.current.requestClose() instead of a bare setIsNewMeetingOpen(false) -- see page.tsx --
  // specifically so it resets the form the same way the in-form Cancel/X button does, rather
  // than leaving stale field values visible while the sheet's exit animation plays out.
  it("requestClose (exposed via ref) resets the form before closing, same as Cancel/X", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    const setIsNewMeetingOpen = jest.fn();
    renderNewMeeting(ref, setIsNewMeetingOpen);
    // Lets ZoomHostField's own useZoomHostPool fetch effect settle before proceeding, same as
    // ViewMeeting.test.tsx's own beforeEach comment explains.
    await act(async () => {});

    const titleField = screen.getByPlaceholderText("Meeting title") as HTMLInputElement;
    fireEvent.change(titleField, { target: { value: "Serenity Group" } });
    expect(titleField.value).toBe("Serenity Group");

    // requestClose is invoked imperatively (not via a fireEvent user interaction, which RTL
    // wraps in act() automatically), so it needs its own act() to flush the state updates
    // before asserting on them.
    act(() => {
      ref.current?.requestClose();
    });

    // Filled-in fields are unsaved changes, so closing asks first rather than discarding.
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(setIsNewMeetingOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(titleField.value).toBe("");
    expect(setIsNewMeetingOpen).toHaveBeenCalledWith(false);
  });

  it("Cancel, the X, and requestClose all route through the same guarded close", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    const setIsNewMeetingOpen = jest.fn();
    renderNewMeeting(ref, setIsNewMeetingOpen);
    await act(async () => {});

    const titleField = screen.getByPlaceholderText("Meeting title") as HTMLInputElement;
    fireEvent.change(titleField, { target: { value: "Serenity Group" } });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(titleField.value).toBe("Serenity Group");
    expect(setIsNewMeetingOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(titleField.value).toBe("");
    expect(setIsNewMeetingOpen).toHaveBeenCalledWith(false);
  });

  it("closes straight away when nothing has been edited", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    const setIsNewMeetingOpen = jest.fn();
    renderNewMeeting(ref, setIsNewMeetingOpen);
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
    expect(setIsNewMeetingOpen).toHaveBeenCalledWith(false);
  });

  it("names its fields with real labels", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    renderNewMeeting(ref);
    await act(async () => {});

    expect(screen.getByLabelText(/^Meeting name/)).toBe(screen.getByPlaceholderText("Meeting title"));
    expect(screen.getByLabelText(/^Group contact email/)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/^Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
  });

  // An end time identical to the start would otherwise roll forward a day into a silent
  // 24-hour meeting -- an end *earlier* than the start stays valid (that's overnight).
  it("flags a start and end time that are the same, but not an overnight range", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    renderNewMeeting(ref);
    await act(async () => {});

    const startTime = screen.getByLabelText("Start time");
    const endTime = screen.getByLabelText("End time");

    fireEvent.change(startTime, { target: { value: "18:00" } });
    fireEvent.change(endTime, { target: { value: "18:00" } });
    expect(screen.getByText(/End time must differ from the start time/)).toBeInTheDocument();

    fireEvent.change(endTime, { target: { value: "01:00" } });
    expect(screen.queryByText(/End time must differ from the start time/)).not.toBeInTheDocument();
    expect(screen.getByText("Ends the next day.")).toBeInTheDocument();
  });
});

describe("NewMeetingSidebar linked schedule", () => {
  // Everything a create needs, before the second schedule is composed: an In Person Mon meeting.
  const fillPrimaryMeeting = () => {
    fireEvent.change(screen.getByPlaceholderText("Meeting title"), { target: { value: "One Day at a Time" } });
    fireEvent.click(screen.getByRole("button", { name: /In Person/ }));
    const dateInput = screen.getByPlaceholderText("MM/DD/YYYY");
    fireEvent.change(dateInput, { target: { value: "09/07/2026" } }); // a Monday
    fireEvent.blur(dateInput);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "odaat@test.icr" } });
    fireEvent.click(screen.getByText("This meeting is recurring", { exact: true }));
  };

  it("carries the second schedule into the create request", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    renderNewMeeting(ref);
    await act(async () => {});

    fillPrimaryMeeting();
    fireEvent.click(screen.getByRole("button", { name: /Add another mode for other days/ }));

    const draft = screen.getByTestId("linked-schedule-draft");
    fireEvent.click(within(draft).getByRole("button", { name: /Remote/ }));
    fireEvent.click(within(draft).getByRole("button", { name: "Saturday" }));

    // Room, category and the rest of this meeting's own fields are still validated normally --
    // fill in what's left through the same form.
    fireEvent.click(screen.getByLabelText("AA"));
    fireEvent.click(screen.getByRole("button", { name: /Select Room/ }));
    fireEvent.click(screen.getAllByRole("option")[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Meeting" }));
    });

    const call = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === "/api/write/meeting");
    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body);
    expect(body.modeType).toBe("In Person");
    expect(body.linkedSchedule).toMatchObject({
      modeType: "Remote",
      room: null,
      zoomRoom: null,
      recurrencePattern: { type: "weekly", daysOfWeek: ["Saturday"], interval: 1 },
    });
  });

  // The draft's Room dropdown stays mounted across every mode still selectable, so a room can be
  // picked while the draft is Remote -- a mode that uses none. Sending it would advisory-lock,
  // conflict-check and publish a physical room for a Zoom-only schedule.
  it("drops a room the second schedule's chosen mode doesn't use", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    renderNewMeeting(ref);
    await act(async () => {});

    fillPrimaryMeeting();
    fireEvent.click(screen.getByRole("button", { name: /Add another mode for other days/ }));

    const draft = screen.getByTestId("linked-schedule-draft");
    fireEvent.click(within(draft).getByRole("button", { name: /Remote/ }));
    fireEvent.click(within(draft).getByRole("button", { name: "Saturday" }));
    fireEvent.click(within(draft).getByRole("button", { name: /Select linked schedule room/ }));
    fireEvent.click(within(draft).getAllByRole("option")[0]);

    fireEvent.click(screen.getByLabelText("AA"));
    fireEvent.click(screen.getByRole("button", { name: /Select Room/ }));
    fireEvent.click(screen.getAllByRole("option")[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Meeting" }));
    });

    const call = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === "/api/write/meeting");
    const body = JSON.parse(call![1].body);
    expect(body.linkedSchedule).toMatchObject({ modeType: "Remote", room: null, zoomRoom: null });
  });

  it("locks the second schedule out of this meeting's own mode and days", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    renderNewMeeting(ref);
    await act(async () => {});

    fillPrimaryMeeting();
    fireEvent.click(screen.getByRole("button", { name: /Add another mode for other days/ }));

    const draft = screen.getByTestId("linked-schedule-draft");
    expect(within(draft).getByRole("button", { name: /In Person/ })).toBeDisabled();
    // The recurrence editor seeds the meeting's own weekday from its Date field.
    expect(within(draft).getByRole("button", { name: "Monday" })).toBeDisabled();
    expect(within(draft).getByRole("button", { name: "Saturday" })).toBeEnabled();
  });
});
