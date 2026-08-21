import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import EditRecurringModal from "../../app/components/meeting-form/EditRecurringModal";

const baseProps = {
  title: "Weekly Standup",
  effectiveDateText: "Aug 15, 2026",
  onClose: jest.fn(),
  onSave: jest.fn(),
};

describe("EditRecurringModal", () => {
  it("renders nothing when closed", () => {
    render(<EditRecurringModal isOpen={false} {...baseProps} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible dialog semantics and focuses the first radio option on open", () => {
    render(<EditRecurringModal isOpen {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Edit recurring event");
    // First focusable in DOM order is the "This event" radio (the options precede the button
    // row) -- non-destructive, so this is still a safe initial-focus target.
    expect(screen.getByLabelText("This event")).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = jest.fn();
    render(<EditRecurringModal isOpen {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSave with the selected option, then closes", () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<EditRecurringModal isOpen {...baseProps} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("All events"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("all");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the This event option and defaults to This and following when recurrence was changed", () => {
    render(<EditRecurringModal isOpen {...baseProps} disableThis />);
    expect(screen.getByLabelText("This event")).toBeDisabled();
    expect(screen.getByLabelText("This and following events")).not.toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeChecked();
    // Initial focus skips the disabled radio and lands on the next focusable option instead.
    expect(screen.getByLabelText("This and following events")).toHaveFocus();
  });

  it("disables both scoped options and defaults to All events when Mode or Host changed", () => {
    render(<EditRecurringModal isOpen {...baseProps} disableScopedEdits />);
    expect(screen.getByLabelText("This event")).toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeDisabled();
    expect(screen.getByLabelText("All events")).toBeChecked();
    expect(screen.getByLabelText("All events")).toHaveFocus();
    expect(screen.getByText(/Mode and host changes apply to the whole series/)).toBeInTheDocument();
  });

  it("prefers the mode/host hint over the recurrence hint when both apply", () => {
    render(<EditRecurringModal isOpen {...baseProps} disableThis disableScopedEdits />);
    expect(screen.getByLabelText("This event")).toBeDisabled();
    expect(screen.getByLabelText("This and following events")).toBeDisabled();
    expect(screen.getByLabelText("All events")).toBeChecked();
    expect(screen.getByText(/Mode and host changes apply to the whole series/)).toBeInTheDocument();
    expect(screen.queryByText(/Recurrence changes apply to the whole series/)).not.toBeInTheDocument();
  });

  it("leaves both scoped options enabled when neither gate applies", () => {
    render(<EditRecurringModal isOpen {...baseProps} />);
    expect(screen.getByLabelText("This event")).not.toBeDisabled();
    expect(screen.getByLabelText("This and following events")).not.toBeDisabled();
  });
});
