import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConflictOverrideModal from "../../app/components/meeting-form/ConflictOverrideModal";
import { ConflictListRow } from "../../util/conflictDisplay";

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
    const { container } = render(
      <ConflictOverrideModal isOpen conflicts={conflicts} onCancel={jest.fn()} onConfirm={jest.fn()} />,
    );
    expect(screen.getByText("Scheduling conflict")).toBeInTheDocument();
    // "Room:" and its value render as separate text/element siblings within .conflictMeta, so
    // check the container's full text rather than an exact single-node match.
    expect(container.textContent).toContain("Room:");
    expect(screen.getByText("Fellowship Room")).toBeInTheDocument();
    expect(screen.getByText("New Meeting")).toBeInTheDocument();
    expect(screen.getByText("Busy Meeting")).toBeInTheDocument();
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
