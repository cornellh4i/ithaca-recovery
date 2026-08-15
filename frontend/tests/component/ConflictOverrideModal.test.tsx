import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConflictOverrideModal from "../../app/components/meeting-form/ConflictOverrideModal";
import { ConflictListRow } from "../../util/meetings/conflictDisplay";

const conflicts: ConflictListRow[] = [
  {
    field: "room",
    value: "Fellowship Room",
    overlap: { start: "2026-09-01T18:00:00.000Z", end: "2026-09-01T19:00:00.000Z" },
    meetings: [
      {
        mid: "m-candidate",
        title: "New Meeting",
        calType: ["AA"],
        isRecurring: false,
        recurrencePattern: null,
        occurrence: { start: "2026-09-01T18:00:00.000Z", end: "2026-09-01T19:00:00.000Z" },
      },
      {
        mid: "m-busy",
        title: "Busy Meeting",
        calType: ["AA"],
        isRecurring: false,
        recurrencePattern: null,
        occurrence: { start: "2026-09-01T18:00:00.000Z", end: "2026-09-01T19:00:00.000Z" },
      },
    ],
  },
];

describe("ConflictOverrideModal", () => {
  it("renders nothing when closed", () => {
    render(<ConflictOverrideModal isOpen={false} conflicts={conflicts} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.queryByText("Scheduling conflict")).not.toBeInTheDocument();
  });

  it("lists the conflicting meetings by field and title when open", () => {
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.getByText("Scheduling conflict")).toBeInTheDocument();
    // "Room:" and its value render as separate text/element siblings within .conflictMeta, and
    // ConflictOverrideModal now renders via Modal's createPortal (to document.body, not RTL's
    // own container div), so check the dialog's own text rather than an exact single-node match
    // or the render() container.
    expect(screen.getByRole("dialog").textContent).toContain("Room:");
    expect(screen.getByText("Fellowship Room")).toBeInTheDocument();
    expect(screen.getByText("New Meeting")).toBeInTheDocument();
    expect(screen.getByText("Busy Meeting")).toBeInTheDocument();
  });

  it("renders accessible dialog semantics", () => {
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Scheduling conflict");
  });

  it("focuses Go back (the non-destructive default) on open", () => {
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Go back" })).toHaveFocus();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={onCancel} onConfirm={jest.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel on Escape while confirming", () => {
    const onCancel = jest.fn();
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={onCancel} onConfirm={jest.fn()} isConfirming />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when Go back is clicked", () => {
    const onCancel = jest.fn();
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={onCancel} onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Save anyway is clicked", () => {
    const onConfirm = jest.fn();
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={jest.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while confirming", () => {
    render(<ConflictOverrideModal isOpen conflicts={conflicts} onCancel={jest.fn()} onConfirm={jest.fn()} isConfirming />);
    expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
