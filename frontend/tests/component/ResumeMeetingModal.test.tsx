import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ResumeMeetingModal from "../../app/components/meeting-form/ResumeMeetingModal";

const baseProps = {
  title: "Weekly Standup",
  onCancel: jest.fn(),
  onConfirm: jest.fn(),
};

describe("ResumeMeetingModal", () => {
  it("renders nothing when closed", () => {
    render(<ResumeMeetingModal isOpen={false} {...baseProps} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible dialog semantics, keeps its e2e testid, and focuses the first radio option on open", () => {
    render(<ResumeMeetingModal isOpen {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Resume this meeting?");
    // tests/e2e/14-meeting-suspension.spec.ts scopes locators off this testid.
    expect(screen.getByTestId("resume-meeting-modal")).toBeInTheDocument();
    // First focusable in DOM order is the "Immediately (today)" radio (options precede the
    // button row) -- non-destructive, so this is still a safe initial-focus target.
    expect(screen.getByRole("radio", { name: "Immediately (today)" })).toHaveFocus();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<ResumeMeetingModal isOpen {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm(null) for immediate resume", () => {
    const onConfirm = jest.fn();
    render(<ResumeMeetingModal isOpen {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume", exact: true }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });
});
