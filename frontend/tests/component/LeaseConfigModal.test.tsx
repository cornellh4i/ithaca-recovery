import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LeaseConfigModal from "../../app/components/admin/export/LeaseConfigModal";
import type { ILeaseSettings } from "../../types/models";
import type { LeaseYearCycle } from "../../util/lease/leaseYearCycles";

const initial: ILeaseSettings = {
  leaseStartDate: new Date("2026-07-01"),
  leaseEndDate: new Date("2027-06-30"),
  rooms: [{ room: "Serenity Room", rate: 20, unit: "hr" }],
  agentFirstName: "Jane",
  agentLastName: "Doe",
  agentTitle: "Rental Agent",
  agentEmail: "jane@example.com",
  agentPhone: "555-0100",
  agentStreetAddress: "1 Main St",
  agentCity: "Ithaca",
  agentState: "NY",
  agentZip: "14850",
  emailTemplate: "Hello {group}",
};

const cycles: LeaseYearCycle[] = [
  { startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), label: "Jul 1, 2026 – Jun 30, 2027", status: "current" },
];

describe("LeaseConfigModal", () => {
  it("renders accessible dialog semantics", () => {
    render(<LeaseConfigModal initial={initial} cycles={cycles} onCancel={jest.fn()} onSave={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Configure PandaDocs lease export");
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<LeaseConfigModal initial={initial} cycles={cycles} onCancel={onCancel} onSave={jest.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Cancel click", () => {
    const onCancel = jest.fn();
    render(<LeaseConfigModal initial={initial} cycles={cycles} onCancel={onCancel} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSave with the current draft when Save is clicked", () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<LeaseConfigModal initial={initial} cycles={cycles} onCancel={jest.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });
});
