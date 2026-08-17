import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import OverlapMeetingsPopover from "../../app/components/calendar/shared/OverlapMeetingsPopover";

const meetings = [
  { id: "m1", title: "Morning AA", startTime: "09:00", endTime: "10:00", room: "Serenity Room" },
  { id: "m2", title: "Morning Al-Anon", startTime: "09:30", endTime: "10:30", room: "Unity Room" },
];

const renderPopover = (overrides: Partial<React.ComponentProps<typeof OverlapMeetingsPopover>> = {}) => {
  const anchorEl = document.createElement("button");
  document.body.appendChild(anchorEl);
  return render(
    <OverlapMeetingsPopover
      isOpen
      meetings={meetings}
      anchorEl={anchorEl}
      onClose={jest.fn()}
      onSelectMeeting={jest.fn()}
      {...overrides}
    />,
  );
};

describe("OverlapMeetingsPopover", () => {
  it("renders nothing when closed", () => {
    renderPopover({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog semantics named by the cluster's time window, with the count as subtitle", () => {
    renderPopover();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The window spans the earliest start to the latest end across the cluster.
    expect(dialog).toHaveAccessibleName("9 - 10:30 AM");
    // Sentence case ("2 meetings", not "2 Meetings").
    expect(screen.getByText("2 meetings")).toBeInTheDocument();
    expect(screen.getByText("Morning AA")).toBeInTheDocument();
    expect(screen.getByText("Morning Al-Anon")).toBeInTheDocument();
  });

  it("shows each row's room and time on one line, falling back to 'Remote' for room-less meetings", () => {
    renderPopover({
      meetings: [
        ...meetings,
        { id: "m3", title: "Danby Tosspots", startTime: "09:00", endTime: "10:00", tags: ["Remote", "AA"] },
      ],
    });
    expect(screen.getByText("Serenity Room · 9 - 10 AM")).toBeInTheDocument();
    expect(screen.getByText("Remote · 9 - 10 AM")).toBeInTheDocument();
  });

  it("counts double-booked meetings in the subtitle and marks their rows (admin-only conflictMids)", () => {
    renderPopover({ conflictMids: new Set(["m1", "m2"]) });
    expect(screen.getByText("2 meetings · 2 double-booked")).toBeInTheDocument();
    expect(screen.getByText("Double-booked in Serenity Room")).toBeInTheDocument();
    expect(screen.getByText("Double-booked in Unity Room")).toBeInTheDocument();
  });

  it("shows no conflict UI without conflictMids (public viewers)", () => {
    renderPopover();
    expect(screen.queryByText(/double-booked/i)).not.toBeInTheDocument();
  });

  it("calls onClose on Escape and on the Close button", () => {
    const onClose = jest.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("calls onSelectMeeting when a meeting row is clicked, without also closing via bubbling", () => {
    const onSelectMeeting = jest.fn();
    const onClose = jest.fn();
    renderPopover({ onSelectMeeting, onClose });
    fireEvent.click(screen.getByText("Morning AA"));
    expect(onSelectMeeting).toHaveBeenCalledWith("m1");
    expect(onClose).not.toHaveBeenCalled();
  });
});
