import React from "react";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import ViewMeetingDetails from "../../app/components/meeting-form/ViewMeeting";

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
    render(<ViewMeetingDetails {...baseProps} anchorEl={null} isPhone={false} />);
    // useZoomHostPool's fetch effect still resolves post-render; wait for it to settle
    // (inside act) rather than asserting synchronously and leaving it unflushed.
    await waitFor(() => expect(screen.queryByText("Serenity Group")).not.toBeInTheDocument());
  });

  it("desktop: renders the meeting title once an anchorEl is present, outside any dialog role", async () => {
    render(<ViewMeetingDetails {...baseProps} anchorEl={makeAnchorEl()} isPhone={false} />);
    expect(await screen.findByText("Serenity Group")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mobile: renders inside a bottom sheet even with no anchorEl", async () => {
    render(<ViewMeetingDetails {...baseProps} anchorEl={null} isPhone />);
    const dialog = await screen.findByRole("dialog", { name: "Serenity Group" });
    expect(dialog).toBeInTheDocument();
    // ViewMeeting's own <h1> title, distinct from BottomSheet's visually-hidden duplicate
    // (kept in the DOM for the dialog's accessible name -- see hideTitleVisually).
    expect(within(dialog).getByRole("heading", { level: 1, name: "Serenity Group" })).toBeInTheDocument();
  });

  it("mobile: shows the same Edit/Delete kebab menu for an admin", async () => {
    render(<ViewMeetingDetails {...baseProps} anchorEl={null} isPhone isAdmin />);
    expect(await screen.findByRole("button", { name: "Meeting options" })).toBeInTheDocument();
  });

  it("prefixes the mode label with its mode icon", async () => {
    render(<ViewMeetingDetails {...baseProps} anchorEl={makeAnchorEl()} isPhone={false} />);
    const label = await screen.findByText("In Person");
    expect(label.querySelector("img")).toHaveAttribute("src", "/svg/location-icon.svg");
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
      render(<ViewMeetingDetails {...withProblems} isAdmin anchorEl={makeAnchorEl()} isPhone={false} />);
      expect(await screen.findByText("Failed to sync")).toBeInTheDocument();
      expect(screen.getByText(/Conflicts with 2 other meetings/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry sync" })).toBeInTheDocument();
    });

    it("hides the entire status band for a non-admin/public viewer", async () => {
      render(<ViewMeetingDetails {...withProblems} isAdmin={false} anchorEl={makeAnchorEl()} isPhone={false} />);
      await screen.findByText("Serenity Group");
      expect(screen.queryByText("Failed to sync")).not.toBeInTheDocument();
      expect(screen.queryByText(/Conflicts with/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry sync" })).not.toBeInTheDocument();
    });

    it("toggles the per-channel error details on the info button", async () => {
      render(<ViewMeetingDetails {...withProblems} isAdmin anchorEl={makeAnchorEl()} isPhone={false} />);
      const toggle = await screen.findByRole("button", { name: "Show sync error details" });
      expect(screen.queryByText(/Insufficient permissions/)).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(await screen.findByText(/Insufficient permissions/)).toBeInTheDocument();
      expect(screen.getByText(/Meeting ID no longer exists/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hide sync error details" })).toBeInTheDocument();
    });
  });
});
