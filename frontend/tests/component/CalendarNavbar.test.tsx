import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CalendarNavbar, { computeHeadingTransitionKey } from "../../app/components/calendar/desktop/CalendarNavbar";
import { formatETDateString, addDaysToETDateString } from "../../util/date/timeUtils";
import { getFirstDayOfWeek } from "../../util/date/weekDates";

// Wraps CalendarNavbar with the controlled selectedDate/selectedView state a real parent would
// own, so clicking Today/arrows/the view dropdown and re-rendering with the updated values
// exercises the same loop the real app does, not just the callback's argument in isolation.
// selectedView in particular: CalendarNavbar no longer owns this as local state (see its own
// comment on why), so a harness that ignored onViewChange would silently pass no matter what
// the component did with it.
const Harness: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedView, setSelectedView] = useState('Day');
  return (
    <>
      <div data-testid="selected-date">{formatETDateString(selectedDate)}</div>
      <CalendarNavbar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        selectedView={selectedView}
        onViewChange={setSelectedView}
      />
    </>
  );
};

// Regression test for a bug where clicking "Today" used to force-reset the view dropdown's
// (then-local) selectedView to "Day" without telling the parent (onViewChange was never
// called) -- this desynced shiftSelectedDate's own day-vs-week step from whatever view (e.g.
// Week) was actually still rendered, so the arrows silently started moving a Week view by a
// single day instead of by a week after Today was clicked. selectedView is now a controlled
// prop (see CalendarNavbar's own comment) which makes this class of bug structurally harder to
// reintroduce, but the test still guards handleToday's actual contract: it must never call
// onViewChange.
test("clicking Today while in Week view keeps arrow navigation stepping by week, not by day", () => {
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: "Day" }));
  fireEvent.click(screen.getByRole("option", { name: "Week" }));

  fireEvent.click(screen.getByText("Today"));
  const today = screen.getByTestId("selected-date").textContent;

  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  const afterOneClick = screen.getByTestId("selected-date").textContent;
  expect(afterOneClick).toBe(addDaysToETDateString(today as string, 7));
  expect(afterOneClick).not.toBe(addDaysToETDateString(today as string, 1));

  // The view dropdown itself must still read "Week" -- proves Today never silently reset it
  // to "Day" in the first place, which is the actual root cause the arrow-step above depends on.
  expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
});

// Regression test: handleViewChange always resets selectedDate to today, so a Day<->Week
// toggle on a Sunday (getFirstDayOfWeek(today) === today) previously produced the identical
// ET date string on both sides of the toggle, and the animated heading (keyed on this string)
// silently skipped its transition even though the displayed text (day line vs. week line)
// really did change. Fixed by prefixing the key with the view name.
test("heading transition key differs between Day and Week when today is the start of the week", () => {
  const sunday = new Date("2026-08-16T12:00:00-04:00"); // an ET Sunday
  expect(formatETDateString(getFirstDayOfWeek(sunday))).toBe(formatETDateString(sunday));

  const dayKey = computeHeadingTransitionKey("Day", sunday);
  const weekKey = computeHeadingTransitionKey("Week", sunday);
  expect(dayKey).not.toBe(weekKey);
});

test("heading transition key stays the same for a different day within the same visible week", () => {
  const sunday = new Date("2026-08-16T12:00:00-04:00");
  const wednesday = new Date("2026-08-19T12:00:00-04:00");
  expect(computeHeadingTransitionKey("Week", sunday)).toBe(computeHeadingTransitionKey("Week", wednesday));
});

// Regression test for CalendarNavbar previously always initializing its own local selectedView
// to "Day" (useState('Day')) regardless of what a caller wanted rendered underneath it --
// /signage?view=week seeded WeekView from the URL but the navbar still believed it was in Day
// view, so the dropdown/heading showed Day-formatted text and the arrows stepped by 1 day
// instead of 7. Mounts directly in Week view (no interaction first, unlike the Today test
// above) to prove the controlled prop is respected from the very first render, not just after
// the dropdown is clicked.
test("mounting directly in Week view renders week controls and steps by week, not by day", () => {
  const WeekHarness: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(new Date("2026-08-19T12:00:00-04:00")); // a Wednesday
    return (
      <>
        <div data-testid="selected-date">{formatETDateString(selectedDate)}</div>
        <CalendarNavbar
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedView="Week"
          onViewChange={() => {}}
        />
      </>
    );
  };
  render(<WeekHarness />);

  expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();

  const start = screen.getByTestId("selected-date").textContent as string;
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const afterOneClick = screen.getByTestId("selected-date").textContent;

  expect(afterOneClick).toBe(addDaysToETDateString(start, 7));
  expect(afterOneClick).not.toBe(addDaysToETDateString(start, 1));
});
