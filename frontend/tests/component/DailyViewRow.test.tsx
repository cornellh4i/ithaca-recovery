import React from "react";
import { render, screen } from "@testing-library/react";
import DailyViewRow from "../../app/components/calendar/desktop/DailyViewRow";

// Regression test for a bug where uniformHeight (used by DayLandscapeView's subcompact rows)
// forced every meeting wrapper to top:0/height:100%, ignoring layoutOverlappingMeetings' own
// lane assignment -- two meetings overlapping the same time slot rendered on top of each
// other instead of split into separate lanes.
const overlappingMeetings = [
  { id: "m1", title: "Meeting A", startTime: "09:00", endTime: "10:00", positionIndex: 0, totalOverlapping: 2 },
  { id: "m2", title: "Meeting B", startTime: "09:00", endTime: "10:00", positionIndex: 1, totalOverlapping: 2 },
];

describe("DailyViewRow", () => {
  it("keeps two overlapping meetings in separate lanes when uniformHeight is set", () => {
    render(
      <DailyViewRow
        roomColor="#cc3366"
        meetings={overlappingMeetings}
        selectedMeetingID={null}
        setSelectedMeetingID={jest.fn()}
        setSelectedNewMeeting={jest.fn()}
        setAnchorEl={jest.fn()}
        columnDate={new Date()}
        hourWidth={100}
        rowHeight={100}
        uniformHeight
      />
    );

    const cardA = screen.getByTestId("meeting-card-m1").parentElement as HTMLElement;
    const cardB = screen.getByTestId("meeting-card-m2").parentElement as HTMLElement;

    expect(cardA.style.top).not.toBe(cardB.style.top);
    expect(cardA.style.height).not.toBe("100px");
    expect(cardB.style.height).not.toBe("100px");
  });
});
