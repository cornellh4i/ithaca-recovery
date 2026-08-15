import React from "react";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import ViewMeetingDetails from "../../app/components/meeting-form/ViewMeeting";
import { ToastProvider } from "../../app/components/shared/ToastProvider";

// ViewMeeting's "Retry sync" button reads useToast() -- which throws outside a ToastProvider --
// so every render here needs one in the tree, not just the ones that click Retry.
const renderViewMeeting = (props: React.ComponentProps<typeof ViewMeetingDetails>) =>
  render(
    <ToastProvider>
      <ViewMeetingDetails {...props} />
    </ToastProvider>
  );

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hosts: [] }),
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const baseProps = {
  mid: "m-1",
  title: "Serenity Group",
  modeType: "In Person",
  creator: "Test Suite",
  group: "Test Group",
  startDateTime: new Date("2026-07-30T18:00:00Z"),
  endDateTime: new Date("2026-07-30T19:00:00Z"),
  email: "seed@test.icr",
  calType: ["AA"],
  room: "Serenity Room",
  isRecurring: false,
  isAdmin: true,
  onBack: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
};

// A real DOM node to anchor the desktop popup to.
const makeAnchorEl = (): HTMLElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

describe("ViewMeeting", () => {
  it("desktop: renders nothing without an anchorEl", async () => {
    renderViewMeeting({ ...baseProps, anchorEl: null, isPhone: false });
    // useZoomHostPool's fetch effect still resolves post-render; wait for it to settle
    // (inside act) rather than asserting synchronously and leaving it unflushed.
    await waitFor(() => expect(screen.queryByText("Serenity Group")).not.toBeInTheDocument());
  });

  it("desktop: renders the meeting title once an anchorEl is present, outside any dialog role", async () => {
    renderViewMeeting({ ...baseProps, anchorEl: makeAnchorEl(), isPhone: false });
    expect(await screen.findByText("Serenity Group")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mobile: renders inside a bottom sheet even with no anchorEl", async () => {
    renderViewMeeting({ ...baseProps, anchorEl: null, isPhone: true });
    const dialog = await screen.findByRole("dialog", { name: "Serenity Group" });
    expect(dialog).toBeInTheDocument();
    // ViewMeeting's own <h1> title, distinct from BottomSheet's visually-hidden duplicate
    // (kept in the DOM for the dialog's accessible name -- see hideTitleVisually).
    expect(within(dialog).getByRole("heading", { level: 1, name: "Serenity Group" })).toBeInTheDocument();
  });

  it("mobile: shows the same Edit/Delete kebab menu for an admin", async () => {
    renderViewMeeting({ ...baseProps, anchorEl: null, isPhone: true, isAdmin: true });
    expect(await screen.findByRole("button", { name: "Meeting options" })).toBeInTheDocument();
  });

  it("prefixes the mode label with its mode icon", async () => {
    renderViewMeeting({ ...baseProps, anchorEl: makeAnchorEl(), isPhone: false });
    const label = await screen.findByText("In Person");
    expect(label.querySelector("[data-icon-name]")).toHaveAttribute("data-icon-name", "location");
  });

  // BUG-022: the status band (sync-failure/conflict) must be admin-only -- a public/
  // unauthenticated viewer should never see it, only the Retry button used to be gated.
  describe("status band admin gating", () => {
    const withProblems = {
      ...baseProps,
      googleSyncStatus: "error",
      googleSyncError: "Insufficient permissions.",
      zoomSyncStatus: "error",
      zoomSyncError: "Meeting ID no longer exists.",
      conflictCount: 2,
    };

    it("shows the sync-failure and conflict blocks for an admin", async () => {
      renderViewMeeting({ ...withProblems, isAdmin: true, anchorEl: makeAnchorEl(), isPhone: false });
      expect(await screen.findByText("Failed to sync")).toBeInTheDocument();
      expect(screen.getByText(/Conflicts with 2 other meetings/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry sync" })).toBeInTheDocument();
    });

    it("hides the entire status band for a non-admin/public viewer", async () => {
      renderViewMeeting({ ...withProblems, isAdmin: false, anchorEl: makeAnchorEl(), isPhone: false });
      await screen.findByText("Serenity Group");
      expect(screen.queryByText("Failed to sync")).not.toBeInTheDocument();
      expect(screen.queryByText(/Conflicts with/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry sync" })).not.toBeInTheDocument();
    });

    it("hides the status band while the auth check is still pending (isAdmin === null)", async () => {
      renderViewMeeting({ ...withProblems, isAdmin: null, anchorEl: makeAnchorEl(), isPhone: false });
      await screen.findByText("Serenity Group");
      expect(screen.queryByText("Failed to sync")).not.toBeInTheDocument();
      expect(screen.queryByText(/Conflicts with/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry sync" })).not.toBeInTheDocument();
    });

    it("toggles the per-channel error details on the info button", async () => {
      renderViewMeeting({ ...withProblems, isAdmin: true, anchorEl: makeAnchorEl(), isPhone: false });
      const toggle = await screen.findByRole("button", { name: "Show sync error details" });
      expect(screen.queryByText(/Insufficient permissions/)).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(await screen.findByText(/Insufficient permissions/)).toBeInTheDocument();
      expect(screen.getByText(/Meeting ID no longer exists/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hide sync error details" })).toBeInTheDocument();
    });
  });

  describe("biweekly recurrence occurrence re-anchoring", () => {
    // Regression test for doesMeetingOccurOnDate's weekly-recurrence interval check, which used
    // to diff raw instants (Math.abs(date.getTime() - originalDate.getTime())) between a noon-ET-
    // anchored occurrence date and the meeting's actual (non-noon) start time. That could
    // undercount the day difference and miscompute diffWeeks for interval > 1 patterns, so a
    // real biweekly occurrence would fail the "does this meeting occur on this date" check and
    // the popup would fall back to showing the series' original start date instead of the
    // clicked occurrence's.
    const biweeklyProps = {
      ...baseProps,
      // Wednesday, July 15 2026, 6:00 PM ET (EDT, UTC-4).
      startDateTime: new Date("2026-07-15T22:00:00Z"),
      endDateTime: new Date("2026-07-15T23:00:00Z"),
      isRecurring: true,
      recurrencePattern: {
        type: "weekly",
        startDate: new Date("2026-07-15T04:00:00Z"),
        daysOfWeek: ["Wednesday"],
        firstDayOfWeek: "Sunday",
        interval: 2,
      },
      // Noon ET, Wednesday July 29 2026 -- exactly 2 ET calendar weeks after startDateTime,
      // noon-anchored the same way weekDates.ts's getDaysOfWeek/getFirstDayOfWeek build
      // occurrence dates in the real calendar views.
      currentOccurrenceDate: new Date("2026-07-29T16:00:00Z"),
      anchorEl: makeAnchorEl(),
      isPhone: false,
    };

    it("shows the clicked occurrence's date, not the series' original start date", async () => {
      renderViewMeeting(biweeklyProps);
      expect(await screen.findByText(/July 29/)).toBeInTheDocument();
      expect(screen.queryByText(/July 15/)).not.toBeInTheDocument();
    });

    // Regression test: doesMeetingOccurOnDate used to call formatETDateString/
    // formatETWeekdayLong/daysBetweenET on `date` (currentOccurrenceDate) with no validity
    // guard. currentOccurrenceDate is an optional prop with no upstream parseability guarantee
    // beyond an existence check -- an invalid Date used to throw a RangeError there (unlike the
    // local-getter comparisons this logic replaced, which just evaluated to false) and crash
    // the whole popup instead of falling back to the series' own start date.
    it("does not crash on an invalid currentOccurrenceDate, and falls back to the series' start date", async () => {
      renderViewMeeting({ ...biweeklyProps, currentOccurrenceDate: new Date("not-a-date") });
      expect(await screen.findByText(/July 15/)).toBeInTheDocument();
    });
  });
});
