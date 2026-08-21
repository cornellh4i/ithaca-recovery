import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import ConflictList from "../../app/components/admin/diagnostics/ConflictList";
import { ConflictListRow } from "../../util/meetings/conflictDisplay";
import { IMeeting } from "../../types/models";

// Stubbed to a prop-capturing shell -- this file is about what occurrenceDate ConflictList
// hands to the real EditMeetingSidebar, not the sidebar's own edit-scope behavior (covered by
// EditMeeting.test.tsx).
jest.mock("../../app/components/meeting-form/EditMeeting", () => ({
  __esModule: true,
  default: ({ occurrenceDate }: { occurrenceDate?: Date | null }) => (
    <div data-testid="edit-meeting-sidebar">
      occurrenceDate: {occurrenceDate ? occurrenceDate.toISOString() : "none"}
    </div>
  ),
}));

// A room double-booked by two recurring meetings -- each meeting's own conflicting occurrence
// (not the overlap intersection) is what ConflictList must hand off as occurrenceDate.
const conflictRow: ConflictListRow = {
  field: "room",
  value: "Serenity Room",
  overlap: { start: "2026-08-09T22:00:00.000Z", end: "2026-08-09T23:00:00.000Z" },
  meetings: [
    {
      mid: "m-1",
      title: "Recurring Series A",
      calType: ["AA"],
      isRecurring: true,
      recurrencePattern: { type: "weekly", interval: 1, daysOfWeek: ["Sunday"], weekOfMonth: null, dayOfMonth: null },
      // This meeting's own conflicting occurrence -- weeks after its series anchor date.
      occurrence: { start: "2026-08-09T22:00:00.000Z", end: "2026-08-09T23:00:00.000Z" },
    },
    {
      mid: "m-2",
      title: "One-time Meeting B",
      calType: ["NA"],
      isRecurring: false,
      recurrencePattern: null,
      occurrence: { start: "2026-08-09T22:30:00.000Z", end: "2026-08-09T23:30:00.000Z" },
    },
  ],
};

const meetingDetails: Record<string, IMeeting> = {
  "m-1": {
    mid: "m-1",
    title: "Recurring Series A",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: new Date("2026-07-05T22:00:00.000Z"),
    endDateTime: new Date("2026-07-05T23:00:00.000Z"),
    email: "seed@test.icr",
    calType: ["AA"],
    modeType: "In Person",
    room: "Serenity Room",
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      mid: "m-1",
      type: "weekly",
      startDate: new Date("2026-07-05T00:00:00.000Z"),
      daysOfWeek: ["Sunday"],
      firstDayOfWeek: "Sunday",
      interval: 1,
      excludedDates: [],
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn((url: string) => {
    if (url === "/api/retrieve/zoom-hosts") {
      return Promise.resolve({ ok: true, json: async () => ({ hosts: [] }) });
    }
    if (url === "/api/retrieve/meeting/m-1") {
      return Promise.resolve({ ok: true, json: async () => meetingDetails["m-1"] });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }) as unknown as typeof fetch;
});

describe("ConflictList edit panel occurrence context", () => {
  it("passes the conflicting meeting's own occurrence (not the overlap window) as occurrenceDate", async () => {
    render(<ConflictList conflicts={[conflictRow]} />);

    // Two meetings share this conflict row -- m-1 (the recurring one under test) is first.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await act(async () => {});

    await waitFor(() => expect(screen.getByTestId("edit-meeting-sidebar")).toBeInTheDocument());
    expect(screen.getByTestId("edit-meeting-sidebar")).toHaveTextContent(
      `occurrenceDate: ${new Date("2026-08-09T22:00:00.000Z").toISOString()}`,
    );
  });
});
