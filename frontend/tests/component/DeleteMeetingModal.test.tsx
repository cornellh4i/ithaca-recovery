import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteMeetingModal from "../../app/components/meeting-form/DeleteMeetingModal";

const baseProps = {
  title: "Weekly Standup",
  timeRangeText: "9:00 - 9:30 AM",
  effectiveDateText: "Aug 15, 2026",
  onCancel: jest.fn(),
  onConfirm: jest.fn(),
};

describe("DeleteMeetingModal", () => {
  it("renders nothing when closed", () => {
    render(<DeleteMeetingModal isOpen={false} {...baseProps} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible dialog semantics and focuses Cancel on open", () => {
    render(<DeleteMeetingModal isOpen {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Delete this meeting?");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<DeleteMeetingModal isOpen {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Delete is clicked", () => {
    const onConfirm = jest.fn();
    render(<DeleteMeetingModal isOpen {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // This modal only ever confirms deleting a one-time meeting (recurring meetings go through
  // DeleteRecurringModal instead) -- the copy must read as a single event, not "starting X",
  // which implies an ongoing series.
  it("phrases the confirmation as a single meeting on a single date, not a recurring series", () => {
    render(<DeleteMeetingModal isOpen {...baseProps} />);
    const dialogText = screen.getByRole("dialog").textContent ?? "";
    expect(dialogText).toMatch(/Weekly Standup on Aug 15, 2026/);
    expect(dialogText).not.toMatch(/starting/i);
  });
});
