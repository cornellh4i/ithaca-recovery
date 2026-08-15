import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SuspendMeetingModal from "../../app/components/meeting-form/SuspendMeetingModal";

const baseProps = {
  title: "Weekly Standup",
  effectiveDateText: "Aug 15, 2026",
  effectiveDate: "2026-08-15T00:00:00.000Z",
  onCancel: jest.fn(),
  onConfirm: jest.fn(),
};

describe("SuspendMeetingModal", () => {
  it("renders nothing when closed", () => {
    render(<SuspendMeetingModal isOpen={false} {...baseProps} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible dialog semantics and focuses the first radio option on open", () => {
    render(<SuspendMeetingModal isOpen {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Suspend this meeting?");
    // First focusable in DOM order is the "Indefinitely" radio (options precede the button
    // row) -- non-destructive, so this is still a safe initial-focus target.
    expect(screen.getByRole("radio", { name: "Indefinitely" })).toHaveFocus();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<SuspendMeetingModal isOpen {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm(null) for an indefinite suspension", () => {
    const onConfirm = jest.fn();
    render(<SuspendMeetingModal isOpen {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });
});
