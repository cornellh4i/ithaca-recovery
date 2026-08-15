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
});
