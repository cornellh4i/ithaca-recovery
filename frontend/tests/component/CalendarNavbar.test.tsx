import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CalendarNavbar from "../../app/components/calendar/desktop/CalendarNavbar";
import { formatETDateString, addDaysToETDateString } from "../../util/date/timeUtils";

// Wraps CalendarNavbar with the controlled selectedDate state a real parent would own, so
// clicking Today/arrows and re-rendering with the updated date exercises the same loop the
// real app does, not just the callback's argument in isolation. Renders selectedDate as text
// (ET date string) so the test can assert on it without reaching into CalendarNavbar's
// internals.
const Harness: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  return (
    <>
      <div data-testid="selected-date">{formatETDateString(selectedDate)}</div>
      <CalendarNavbar selectedDate={selectedDate} onDateChange={setSelectedDate} onViewChange={() => {}} />
    </>
  );
};

// Regression test for a bug where clicking "Today" force-set the view dropdown's internal
// selectedView to "Day" without telling the parent (onViewChange was never called) -- this
// desynced shiftSelectedDate's own day-vs-week step from whatever view (e.g. Week) was
// actually still rendered, so the arrows silently started moving a Week view by a single day
// instead of by a week after Today was clicked.
test("clicking Today while in Week view keeps arrow navigation stepping by week, not by day", () => {
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: "Day" }));
  fireEvent.click(screen.getByRole("option", { name: "Week" }));

  fireEvent.click(screen.getByText("Today"));
  const today = screen.getByTestId("selected-date").textContent;

  fireEvent.click(screen.getByAltText("Right Arrow"));

  const afterOneClick = screen.getByTestId("selected-date").textContent;
  expect(afterOneClick).toBe(addDaysToETDateString(today as string, 7));
  expect(afterOneClick).not.toBe(addDaysToETDateString(today as string, 1));

  // The view dropdown itself must still read "Week" -- proves Today never silently reset it
  // to "Day" in the first place, which is the actual root cause the arrow-step above depends on.
  expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
});
