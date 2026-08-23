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
    modeType: "Hybrid",
    recurrencePattern: weeklyPattern,
    isRecurring: true,
    scheduleInstants,
    room: "Serenity Room",
    zoomRoom: "Serenity Room - Zoom",
    draft: null,
    onAddSchedule: jest.fn(),
    onSelectDraftMode: jest.fn(),
    onSelectDraftRoom: jest.fn(),
    onSelectDraftZoomRoom: jest.fn(),
    onToggleDraftDay: jest.fn(),
    onDiscardDraft: jest.fn(),
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

  it("mounts the union of every mode still selectable, not just the picked one", () => {
    // Under a Hybrid meeting the remaining choices are In Person and Remote: Room (In Person) and
    // Zoom host (Remote) are mounted, Zoom room isn't -- and none of that changes as the admin
    // toggles between the two, so nothing typed into a field disappears mid-edit.
    const { rerender, props } = renderSchedules({ draft: draftIn("Remote") });
    expect(screen.getByText("Room")).toBeInTheDocument();
    expect(screen.getByText(/Shares this meeting's Zoom host/)).toBeInTheDocument();
    expect(screen.queryByText("Zoom room")).not.toBeInTheDocument();

    rerender(<MeetingSchedules {...props} draft={draftIn("In Person")} />);
    expect(screen.getByText("Room")).toBeInTheDocument();
    expect(screen.getByText(/Shares this meeting's Zoom host/)).toBeInTheDocument();
    expect(screen.queryByText("Zoom room")).not.toBeInTheDocument();
  });

  it("mounts the Zoom room too when Hybrid is still selectable", () => {
    // An In Person meeting leaves Hybrid open, and Hybrid is the one mode that needs a Zoom room.
    renderSchedules({ modeType: "In Person", zoomRoom: "", draft: draftIn("Hybrid") });
    expect(screen.getByText("Zoom room")).toBeInTheDocument();
  });
});
