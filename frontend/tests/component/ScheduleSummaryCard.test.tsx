import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ScheduleSummaryCard, { ScheduleSummary, formatScheduleLine } from "../../app/components/meeting-form/ScheduleSummaryCard";

// A Saturday Zoom-only half of a linked family: 9-10 AM ET, one weekday, its own Zoom room.
const saturdaySchedule: ScheduleSummary = {
  modeType: "Remote",
  recurrencePattern: {
    type: "weekly",
    weekOfMonth: null,
    dayOfMonth: null,
    daysOfWeek: ["Saturday"],
  },
  startDateTime: new Date("2026-09-12T13:00:00.000Z"), // 9:00 AM ET
  endDateTime: new Date("2026-09-12T14:00:00.000Z"), // 10:00 AM ET
  room: "",
  zoomRoom: "Unity Room - Zoom",
  googleSyncStatus: "synced",
  zoomSyncStatus: "synced",
};

describe("ScheduleSummaryCard", () => {
  it("names the mode, its icon, the days it meets and its ET time range", () => {
    render(<ScheduleSummaryCard schedule={saturdaySchedule} />);

    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect(document.querySelector('[data-icon-name="video-call"]')).toBeInTheDocument();
    expect(screen.getByText("Sat · 9 - 10 AM")).toBeInTheDocument();
  });

  it("shows the schedule's own room and Zoom room, without the Zoom room's ' - Zoom' suffix", () => {
    render(<ScheduleSummaryCard schedule={{ ...saturdaySchedule, modeType: "Hybrid", room: "Serenity Room" }} />);

    expect(screen.getByText("Serenity Room · Unity Room")).toBeInTheDocument();
  });

  // A schedule created while the Zoom host pool was exhausted has no calendar events at all
  // yet and is waiting on a retry sync -- the card has to say so rather than presenting it as
  // a live schedule.
  it("reports a schedule that is still waiting on both services", () => {
    render(
      <ScheduleSummaryCard
        schedule={{ ...saturdaySchedule, googleSyncStatus: "pending", zoomSyncStatus: "error" }}
      />,
    );

    expect(screen.getByText(/Waiting to sync with Google Calendar and Zoom/)).toBeInTheDocument();
  });

  it("names only the service that is actually outstanding", () => {
    render(
      <ScheduleSummaryCard
        schedule={{ ...saturdaySchedule, googleSyncStatus: "synced", zoomSyncStatus: "pending" }}
      />,
    );

    expect(screen.getByText(/Waiting to sync with Zoom —/)).toBeInTheDocument();
    expect(screen.queryByText(/Google Calendar/)).not.toBeInTheDocument();
  });

  // A backfilled legacy row reports no sync status at all -- that's silence, not an
  // outstanding write.
  it("says nothing about syncing for a fully synced schedule, or one with no status at all", () => {
    const { rerender } = render(<ScheduleSummaryCard schedule={saturdaySchedule} />);
    expect(screen.queryByText(/Waiting to sync/)).not.toBeInTheDocument();

    rerender(
      <ScheduleSummaryCard
        schedule={{ ...saturdaySchedule, googleSyncStatus: null, zoomSyncStatus: null }}
      />,
    );
    expect(screen.queryByText(/Waiting to sync/)).not.toBeInTheDocument();
  });

  it("links to the schedule's own form when given one, and omits the line otherwise", () => {
    const { rerender } = render(
      <ScheduleSummaryCard schedule={saturdaySchedule} editHref="/?mid=m-linked&edit=1" />,
    );

    expect(screen.getByRole("link", { name: "Open this schedule" })).toHaveAttribute(
      "href",
      "/?mid=m-linked&edit=1",
    );

    rerender(<ScheduleSummaryCard schedule={saturdaySchedule} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers Remove only when the host wired an action up, and blocks a second click while one is in flight", () => {
    const onRemove = jest.fn();
    const { rerender } = render(<ScheduleSummaryCard schedule={saturdaySchedule} />);
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();

    rerender(<ScheduleSummaryCard schedule={saturdaySchedule} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(<ScheduleSummaryCard schedule={saturdaySchedule} onRemove={onRemove} removeDisabled />);
    expect(screen.getByRole("button", { name: /Remove/ })).toBeDisabled();
  });

  it("falls back to the time range alone for a schedule with no recurrence", () => {
    render(<ScheduleSummaryCard schedule={{ ...saturdaySchedule, recurrencePattern: null }} />);

    // formatDayColumn calls an absent pattern "One-time" rather than blank, so the line still
    // says what kind of schedule this is.
    expect(screen.getByText("One-time · 9 - 10 AM")).toBeInTheDocument();
  });

  it("formats the same line the card shows for callers outside it", () => {
    expect(formatScheduleLine(saturdaySchedule)).toBe("Sat · 9 - 10 AM");
  });
});
