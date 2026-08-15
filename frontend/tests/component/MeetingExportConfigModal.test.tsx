import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MeetingExportConfigModal from "../../app/components/admin/export/MeetingExportConfigModal";
import { ALL_MEETING_EXPORT_FIELD_KEYS } from "../../util/meetings/meetingExportFields";

describe("MeetingExportConfigModal", () => {
  it("renders accessible dialog semantics", () => {
    render(<MeetingExportConfigModal initialFields={ALL_MEETING_EXPORT_FIELD_KEYS} onCancel={jest.fn()} onSave={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Configure meeting export");
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<MeetingExportConfigModal initialFields={ALL_MEETING_EXPORT_FIELD_KEYS} onCancel={onCancel} onSave={jest.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Cancel click", () => {
    const onCancel = jest.fn();
    render(<MeetingExportConfigModal initialFields={ALL_MEETING_EXPORT_FIELD_KEYS} onCancel={onCancel} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSave with the checked fields when Save is clicked", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<MeetingExportConfigModal initialFields={ALL_MEETING_EXPORT_FIELD_KEYS} onCancel={jest.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(ALL_MEETING_EXPORT_FIELD_KEYS));
  });
});
