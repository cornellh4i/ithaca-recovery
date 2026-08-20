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

  it("desktop: renders the meeting title once an anchorEl is present, inside a named dialog", async () => {
    renderViewMeeting({ ...baseProps, anchorEl: makeAnchorEl(), isPhone: false });
    expect(await screen.findByText("Serenity Group")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Serenity Group" });
    // Deliberately not aria-modal: focus isn't trapped and the page behind stays interactive,
    // so announcing it as modal would misdescribe it to screen readers.
    expect(dialog).not.toHaveAttribute("aria-modal");
  });

  describe("desktop dismissal", () => {
    const openPopup = async () => {
      const anchorEl = makeAnchorEl();
      const onBack = jest.fn();
      renderViewMeeting({ ...baseProps, anchorEl, isPhone: false, onBack });
      await screen.findByText("Serenity Group");
      return { anchorEl, onBack };
    };

    it("closes on Escape", async () => {
      const { onBack } = await openPopup();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("closes on an outside click, but not on a click on its own anchor", async () => {
      const { anchorEl, onBack } = await openPopup();
      fireEvent.mouseDown(anchorEl);
      expect(onBack).not.toHaveBeenCalled();

      fireEvent.mouseDown(document.body);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("closes the kebab menu first on Escape, and the popup only on the second press", async () => {
      const { onBack } = await openPopup();
      fireEvent.click(screen.getByRole("button", { name: "Meeting options" }));
      expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(onBack).not.toHaveBeenCalled();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("closes only the kebab menu when the click lands elsewhere inside the popup", async () => {
      const { onBack } = await openPopup();
      fireEvent.click(screen.getByRole("button", { name: "Meeting options" }));

      fireEvent.mouseDown(screen.getByRole("heading", { level: 1, name: "Serenity Group" }));
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(onBack).not.toHaveBeenCalled();
    });

    it("does not close on a click inside a modal it opened", async () => {
      const { onBack } = await openPopup();
      fireEvent.click(screen.getByRole("button", { name: "Meeting options" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      // The modal portals to document.body as a DOM *sibling* of this popup, so containment
      // alone would misread a click on its buttons as an outside click.
      const dialogs = screen.getAllByRole("dialog");
      const modal = dialogs[dialogs.length - 1];
      fireEvent.mouseDown(modal);
      expect(onBack).not.toHaveBeenCalled();
    });
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
    // doesMeetingOccurOnDate diffs ET calendar days (daysBetweenET), not raw instants --
    // date (noon-ET-anchored) and startDateTime aren't at the same time-of-day, so a raw
    // getTime() diff can undercount and miscompute diffWeeks for interval > 1 patterns.
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

    // currentOccurrenceDate is an optional prop with no upstream parseability guarantee beyond
    // an existence check. doesMeetingOccurOnDate guards it before running any ET-safe helper
    // on it, since those throw a RangeError on an invalid Date.
    it("does not crash on an invalid currentOccurrenceDate, and falls back to the series' start date", async () => {
      renderViewMeeting({ ...biweeklyProps, currentOccurrenceDate: new Date("not-a-date") });
      expect(await screen.findByText(/July 15/)).toBeInTheDocument();
    });
  });

  describe("Zoom drift notice", () => {
    const zoomProps = {
      ...baseProps,
      modeType: "Remote",
      room: "",
      zid: "70000000905",
      zoomLink: "http://zoom.test/j/70000000905?pwd=old",
      isPhone: false,
    };

    // Routes the two fetches this flow makes: the drift check (re-queried after every
    // successful retry, mirroring the real server whose adoption clears the drift), and the
    // retry-sync POST the "Sync from Zoom" button fires.
    const mockFetchWithDrift = (drift: boolean, { syncSucceeds = true } = {}) => {
      let liveDrift = drift;
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (String(url).includes("/api/admin/zoom-drift/")) {
          return Promise.resolve({ ok: true, json: async () => ({ drift: liveDrift }) });
        }
        if (String(url).includes("/api/update/meeting/sync")) {
          if (!syncSucceeds) {
            return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
          }
          liveDrift = false;
          return Promise.resolve({
            ok: true,
            json: async () => ({ googleSyncStatus: "synced", googleSyncError: null, zoomSyncStatus: "synced", zoomSyncError: null }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ hosts: [] }) });
      }) as jest.Mock;
    };

    it("shows the drift notice with its own action when the live Zoom settings differ", async () => {
      mockFetchWithDrift(true);
      renderViewMeeting({ ...zoomProps, anchorEl: makeAnchorEl() });
      expect(await screen.findByText(/changed outside the app/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync from Zoom" })).toBeInTheDocument();
    });

    it("clears the notice after a successful sync-from-Zoom", async () => {
      mockFetchWithDrift(true);
      renderViewMeeting({ ...zoomProps, anchorEl: makeAnchorEl() });
      fireEvent.click(await screen.findByRole("button", { name: "Sync from Zoom" }));
      await waitFor(() => expect(screen.queryByText(/changed outside the app/)).not.toBeInTheDocument());
    });

    it("keeps the notice when the retry itself fails", async () => {
      mockFetchWithDrift(true, { syncSucceeds: false });
      renderViewMeeting({ ...zoomProps, anchorEl: makeAnchorEl() });
      fireEvent.click(await screen.findByRole("button", { name: "Sync from Zoom" }));
      // The failure toast settles first; the drift notice must survive it.
      await screen.findByText(/Could not retry the sync/);
      expect(screen.getByText(/changed outside the app/)).toBeInTheDocument();
    });

    it("renders no notice when the live settings match", async () => {
      mockFetchWithDrift(false);
      renderViewMeeting({ ...zoomProps, anchorEl: makeAnchorEl() });
      await screen.findByText("Serenity Group");
      expect(screen.queryByText(/changed outside the app/)).not.toBeInTheDocument();
    });

    it("never even checks for drift for a non-admin viewer", async () => {
      mockFetchWithDrift(true);
      renderViewMeeting({ ...zoomProps, isAdmin: false, anchorEl: makeAnchorEl() });
      await screen.findByText("Serenity Group");
      expect(screen.queryByText(/changed outside the app/)).not.toBeInTheDocument();
      const driftCalls = (global.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("zoom-drift"));
      expect(driftCalls).toHaveLength(0);
    });
  });
});
