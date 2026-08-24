import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import MeetingSchedules, { type MeetingSchedulesProps } from "../../app/components/meeting-form/MeetingSchedules";
import type { IRecurrencePattern } from "../../types/models";

const weeklyPattern: IRecurrencePattern = {
  type: "weekly",
  startDate: new Date("2026-08-03T04:00:00.000Z"),
  daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  firstDayOfWeek: "Sunday",
  interval: 1,
};

const scheduleInstants = {
  startDateTime: new Date("2026-08-03T13:00:00.000Z"), // 9:00 AM ET
  endDateTime: new Date("2026-08-03T14:00:00.000Z"), // 10:00 AM ET
};

const renderSchedules = (overrides: Partial<MeetingSchedulesProps> = {}) => {
  const props: MeetingSchedulesProps = {
    recurrenceEditor: <div data-testid="recurrence-editor">recurrence editor</div>,
    isConfirmed: true,
    onEditSchedule: jest.fn(),
    onConfirmSchedule: jest.fn(),
    modeType: "Hybrid",
    recurrencePattern: weeklyPattern,
    isRecurring: true,
    scheduleInstants,
    room: "Serenity Room",
    zoomRoom: "Serenity Room - Zoom",
    draft: null,
    isDraftConfirmed: false,
    onAddSchedule: jest.fn(),
    onSelectDraftMode: jest.fn(),
    onSelectDraftRoom: jest.fn(),
    onSelectDraftZoomRoom: jest.fn(),
    onToggleDraftDay: jest.fn(),
    onDiscardDraft: jest.fn(),
    onConfirmDraft: jest.fn(),
    onEditDraft: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<MeetingSchedules {...props} />) };
};

const addTrigger = () => screen.queryByRole("button", { name: /Add another mode for other days/ });

describe("MeetingSchedules collapse and second schedule", () => {
  // One click, not two: the trigger is reachable straight from the open editor, and taking it is
  // what collapses this meeting's schedule into its card.
  it("offers a second schedule from the still-open recurrence editor", () => {
    renderSchedules({ isConfirmed: false });

    expect(screen.getByTestId("recurrence-editor")).toBeInTheDocument();
    expect(screen.queryByText(/Mon-Fri · 9 - 10 AM/)).not.toBeInTheDocument();
    expect(addTrigger()).toBeInTheDocument();
  });

  it("summarises the collapsed schedule and still offers a second one", () => {
    renderSchedules();

    expect(screen.getByText("Mon-Fri · 9 - 10 AM")).toBeInTheDocument();
    expect(addTrigger()).toBeInTheDocument();
  });

  // Nothing to collapse into and nothing for the linked schedule to inherit.
  it("offers no second schedule while the weekly pattern has no day", () => {
    renderSchedules({
      isConfirmed: false,
      recurrencePattern: { ...weeklyPattern, daysOfWeek: [] },
    });
    expect(addTrigger()).not.toBeInTheDocument();
  });

  it("offers no second schedule while the Date or Time field is unreadable", () => {
    renderSchedules({ isConfirmed: false, scheduleInstants: null });
    expect(addTrigger()).not.toBeInTheDocument();
  });

  it("keeps the recurrence editor mounted while collapsed, so its state survives", () => {
    // Unmounting it would reseed the recurrence controls from the stored pattern on re-expand,
    // silently discarding everything edited in this session.
    renderSchedules();
    expect(screen.getByTestId("recurrence-editor")).toBeInTheDocument();
  });

  it("reopens the editor through 'Edit this schedule'", () => {
    const onEditSchedule = jest.fn();
    renderSchedules({ onEditSchedule });

    fireEvent.click(screen.getByRole("button", { name: "Edit this schedule" }));
    expect(onEditSchedule).toHaveBeenCalled();
  });

  it("offers no second schedule for a meeting that doesn't repeat weekly", () => {
    renderSchedules({ isRecurring: false, recurrencePattern: null });
    expect(addTrigger()).not.toBeInTheDocument();
  });

  it("starts the draft in a mode the meeting doesn't already run", () => {
    const onAddSchedule = jest.fn();
    renderSchedules({ onAddSchedule });

    fireEvent.click(addTrigger()!);
    expect(onAddSchedule).toHaveBeenCalledWith("In Person");
  });

  it("disables the trigger and says why a second schedule can't be started", () => {
    renderSchedules({ addBlockedNote: "Save this meeting's changes first." });

    expect(addTrigger()).toBeDisabled();
    expect(screen.getByText("Save this meeting's changes first.")).toBeInTheDocument();
  });
});

describe("MeetingSchedules cap of two schedules", () => {
  it("offers no third schedule once one is already saved", () => {
    renderSchedules({
      savedSchedules: [{ modeType: "Remote", recurrencePattern: { daysOfWeek: ["Saturday"] } }],
    });
    expect(addTrigger()).not.toBeInTheDocument();
  });

  it("offers no third schedule while one is still only a draft", () => {
    renderSchedules({
      draft: { mid: "draft-1", modeType: "Remote", daysOfWeek: ["Saturday"], room: "", zoomRoom: "" },
    });
    expect(addTrigger()).not.toBeInTheDocument();
  });
});

describe("MeetingSchedules linked-schedule locking", () => {
  const draft = { mid: "draft-1", modeType: "Remote", daysOfWeek: [] as string[], room: "", zoomRoom: "" };

  it("disables the mode this meeting already runs", () => {
    renderSchedules({ draft });

    expect(screen.getByRole("button", { name: /Hybrid/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /In Person/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Remote/ })).toBeEnabled();
  });

  it("disables the weekdays this meeting already meets on", () => {
    renderSchedules({ draft });

    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      expect(screen.getByRole("button", { name: day })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Saturday" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sunday" })).toBeEnabled();
  });

  it("also locks out a day a saved second schedule claims", () => {
    renderSchedules({
      draft,
      savedSchedules: [{ modeType: "Remote", recurrencePattern: { daysOfWeek: ["Saturday"] } }],
    });
    expect(screen.getByRole("button", { name: "Saturday" })).toBeDisabled();
  });

  it("echoes the time and repeat the linked schedule inherits, with no fields to change them", () => {
    renderSchedules({ draft });

    expect(screen.getByText(/9 - 10 AM · every week/)).toBeInTheDocument();
    // The linked schedule never picks its own host: it joins the meeting's Zoom meeting.
    expect(screen.getByText(/Shares this meeting's Zoom host and join link\./)).toBeInTheDocument();
  });

  // An In Person meeting has no Zoom meeting to share, so this schedule is the one that mints the
  // family's -- the single case that consumes Zoom host capacity.
  it("says the schedule books its own Zoom host when the meeting is in person", () => {
    renderSchedules({ modeType: "In Person", zoomRoom: "", draft: { ...draft, modeType: "Hybrid" } });

    expect(screen.getByText(/Books its own Zoom host and join link/)).toBeInTheDocument();
    expect(screen.queryByText(/Shares this meeting's Zoom host/)).not.toBeInTheDocument();
  });

  it("discards the draft on Cancel", () => {
    const onDiscardDraft = jest.fn();
    renderSchedules({ draft, onDiscardDraft });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiscardDraft).toHaveBeenCalled();
  });
});

describe("MeetingSchedules linked-schedule fields", () => {
  const draftIn = (modeType: string) => ({ mid: "draft-1", modeType, daysOfWeek: ["Saturday"], room: "", zoomRoom: "" });

  it("shows only the fields the picked mode uses", () => {
    // A Remote schedule has nowhere physical to be and picks no Zoom room -- it only joins the
    // family's one Zoom meeting.
    const { rerender, props } = renderSchedules({ draft: draftIn("Remote") });
    expect(screen.queryByText("Room")).not.toBeInTheDocument();
    expect(screen.queryByText("Zoom room")).not.toBeInTheDocument();
    expect(screen.getByText(/Shares this meeting's Zoom host/)).toBeInTheDocument();

    rerender(<MeetingSchedules {...props} draft={draftIn("In Person")} />);
    expect(screen.getByText("Room")).toBeInTheDocument();
    expect(screen.queryByText("Zoom room")).not.toBeInTheDocument();
    expect(screen.queryByText(/Shares this meeting's Zoom host/)).not.toBeInTheDocument();
  });

  it("shows the Zoom room only for a Hybrid schedule", () => {
    renderSchedules({ modeType: "In Person", zoomRoom: "", draft: draftIn("Hybrid") });
    expect(screen.getByText("Room")).toBeInTheDocument();
    expect(screen.getByText("Zoom room")).toBeInTheDocument();
    expect(screen.getByText(/Books its own Zoom host/)).toBeInTheDocument();
  });
});

describe("MeetingSchedules linked-schedule draft confirmation", () => {
  const remoteDraft = { mid: "draft-1", modeType: "Remote", daysOfWeek: ["Saturday"], room: "", zoomRoom: "" };
  const doneButton = () => screen.getByTestId("linked-schedule-done");

  it("won't collapse a draft that has no day yet", () => {
    renderSchedules({ draft: { ...remoteDraft, daysOfWeek: [] } });
    expect(doneButton()).toBeDisabled();
  });

  it("won't collapse a Hybrid draft still missing a room", () => {
    const hybrid = { ...remoteDraft, modeType: "Hybrid" };
    const { rerender, props } = renderSchedules({ modeType: "In Person", zoomRoom: "", draft: hybrid });
    expect(doneButton()).toBeDisabled();

    rerender(<MeetingSchedules {...props} draft={{ ...hybrid, room: "Serenity Room" }} />);
    expect(doneButton()).toBeDisabled();

    rerender(
      <MeetingSchedules
        {...props}
        draft={{ ...hybrid, room: "Serenity Room", zoomRoom: "Serenity Room - Zoom" }}
      />,
    );
    expect(doneButton()).toBeEnabled();
  });

  it("collapses a complete draft on Done", () => {
    const onConfirmDraft = jest.fn();
    renderSchedules({ draft: remoteDraft, onConfirmDraft });

    fireEvent.click(doneButton());
    expect(onConfirmDraft).toHaveBeenCalled();
  });

  it("summarises the confirmed draft instead of its editor", () => {
    renderSchedules({ draft: remoteDraft, isDraftConfirmed: true });

    expect(screen.queryByTestId("linked-schedule-draft")).not.toBeInTheDocument();
    expect(screen.getByText("Sat · 9 - 10 AM")).toBeInTheDocument();
  });

  it("reopens the confirmed draft's editor and drops it on Remove", () => {
    const onEditDraft = jest.fn();
    const onDiscardDraft = jest.fn();
    renderSchedules({ draft: remoteDraft, isDraftConfirmed: true, onEditDraft, onDiscardDraft });

    // Two schedules are on screen at once, so the linked one's link visibly names its mode.
    fireEvent.click(screen.getByRole("button", { name: "Edit the Remote schedule" }));
    expect(onEditDraft).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove the Remote schedule" }));
    expect(onDiscardDraft).toHaveBeenCalled();
  });

  it("keeps the editor open while there's no readable time range to summarise", () => {
    renderSchedules({ draft: remoteDraft, isDraftConfirmed: true, scheduleInstants: null });
    expect(screen.getByTestId("linked-schedule-draft")).toBeInTheDocument();
  });

  // Otherwise Done is a dead click: the flag flips but no card can be built from an unreadable
  // Date/Time, so the editor stays open with nothing to show for the press.
  it("won't collapse a draft while the Date or Time field is unreadable", () => {
    renderSchedules({ draft: remoteDraft, scheduleInstants: null });
    expect(doneButton()).toBeDisabled();
  });
});

describe("MeetingSchedules linked-schedule discard notice", () => {
  it("says where the draft went when the meeting stopped repeating weekly", () => {
    renderSchedules({ isRecurring: false, recurrencePattern: null, draft: null, draftDiscardedNote: true });

    expect(screen.getByTestId("linked-schedule-discarded-note")).toHaveTextContent(
      "The linked schedule was removed because this meeting no longer repeats weekly.",
    );
  });

  // The live region itself stays mounted so the message is announced when it appears; only its
  // text is conditional.
  it("says nothing while no draft has been dropped", () => {
    renderSchedules();
    expect(screen.getByTestId("linked-schedule-discarded-note")).toBeEmptyDOMElement();
  });
});

describe("MeetingSchedules own-schedule confirmation", () => {
  const doneButton = () => screen.getByTestId("schedule-done");

  it("collapses the expanded editor through Done", () => {
    const onConfirmSchedule = jest.fn();
    renderSchedules({ isConfirmed: false, onConfirmSchedule });
    fireEvent.click(doneButton());
    expect(onConfirmSchedule).toHaveBeenCalled();
  });

  it("won't collapse a weekly series that meets on no day", () => {
    renderSchedules({
      isConfirmed: false,
      recurrencePattern: { ...weeklyPattern, daysOfWeek: [] },
    });
    expect(doneButton()).toBeDisabled();
  });

  it("won't collapse while the Date or Time field is unreadable", () => {
    renderSchedules({ isConfirmed: false, scheduleInstants: null });
    expect(doneButton()).toBeDisabled();
  });

  it("is withheld once collapsed, and for a one-time meeting", () => {
    renderSchedules({ isConfirmed: true });
    expect(screen.queryByTestId("schedule-done")).not.toBeInTheDocument();
    renderSchedules({ isConfirmed: false, isRecurring: false, recurrencePattern: null });
    expect(screen.queryByTestId("schedule-done")).not.toBeInTheDocument();
  });
});
