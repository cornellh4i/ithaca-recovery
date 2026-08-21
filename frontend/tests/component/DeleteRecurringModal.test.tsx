import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteRecurringModal from "../../app/components/meeting-form/DeleteRecurringModal";

const baseProps = {
  title: "Weekly Standup",
  effectiveDateText: "Aug 15, 2026",
  onClose: jest.fn(),
  onDelete: jest.fn(),
};

describe("DeleteRecurringModal", () => {
  it("renders nothing when closed", () => {
    render(<DeleteRecurringModal isOpen={false} {...baseProps} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible dialog semantics and focuses the first radio option on open", () => {
    render(<DeleteRecurringModal isOpen {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Delete recurring event");
    // First focusable in DOM order is the "This event" radio (the options precede the button
    // row) -- non-destructive, so this is still a safe initial-focus target.
    expect(screen.getByLabelText("This event")).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = jest.fn();
    render(<DeleteRecurringModal isOpen {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onDelete with the selected option, then closes", () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    render(<DeleteRecurringModal isOpen {...baseProps} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("All events"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("all");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // disableScoped: the caller has no occurrence to scope 'this'/'thisAndFollowing' against
  // (e.g. ViewMeeting's deep-link (?mid=) path, which never sets currentOccurrenceDate) --
  // both scoped options are disabled and the choice is forced to 'all'.
  it("disables both scoped options and defaults to All events when there's no occurrence context", () => {
    render(<DeleteRecurringModal isOpen {...baseProps} disableScoped />);
    expect(screen.getByLabelText("This event")).toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeDisabled();
    expect(screen.getByLabelText("All events")).not.toBeDisabled();
    expect(screen.getByLabelText("All events")).toBeChecked();
    // Initial focus skips both disabled radios and lands on the only enabled option.
    expect(screen.getByLabelText("All events")).toHaveFocus();
    expect(screen.getByText(/Open the meeting from a calendar day/)).toBeInTheDocument();
  });

  it("only ever calls onDelete with 'all' while disableScoped is set", () => {
    const onDelete = jest.fn();
    render(<DeleteRecurringModal isOpen {...baseProps} onDelete={onDelete} disableScoped />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("all");
  });

  it("leaves both scoped options enabled when disableScoped is unset", () => {
    render(<DeleteRecurringModal isOpen {...baseProps} />);
    expect(screen.getByLabelText("This event")).not.toBeDisabled();
    expect(screen.getByLabelText("This and following events")).not.toBeDisabled();
    expect(screen.queryByText(/Open the meeting from a calendar day/)).not.toBeInTheDocument();
  });
});
