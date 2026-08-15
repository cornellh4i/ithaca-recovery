import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import OverlapMeetingsModal from "../../app/components/calendar/shared/OverlapMeetingsModal";

const meetings = [
  { id: "m1", title: "Morning AA", startTime: "09:00", endTime: "10:00", room: "Serenity Room" },
  { id: "m2", title: "Morning Al-Anon", startTime: "09:30", endTime: "10:30", room: "Unity Room" },
];

describe("OverlapMeetingsModal", () => {
  it("renders nothing when closed", () => {
    render(<OverlapMeetingsModal isOpen={false} meetings={meetings} onClose={jest.fn()} onSelectMeeting={jest.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible dialog semantics naming the meeting count", () => {
    render(<OverlapMeetingsModal isOpen meetings={meetings} onClose={jest.fn()} onSelectMeeting={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/2 Meetings/);
    expect(screen.getByText("Morning AA")).toBeInTheDocument();
    expect(screen.getByText("Morning Al-Anon")).toBeInTheDocument();
  });

  it("calls onClose on Escape and on the Close button", () => {
    const onClose = jest.fn();
    render(<OverlapMeetingsModal isOpen meetings={meetings} onClose={onClose} onSelectMeeting={jest.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("calls onSelectMeeting when a meeting row is clicked, without also closing via bubbling", () => {
    const onSelectMeeting = jest.fn();
    const onClose = jest.fn();
    render(<OverlapMeetingsModal isOpen meetings={meetings} onClose={onClose} onSelectMeeting={onSelectMeeting} />);
    fireEvent.click(screen.getByText("Morning AA"));
    expect(onSelectMeeting).toHaveBeenCalledWith("m1");
    expect(onClose).not.toHaveBeenCalled();
  });
});
