import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRetrySync } from "../../hooks/useRetrySync";
import { ToastProvider } from "../../app/components/shared/ToastProvider";
import { retryMeetingSync } from "../../services/syncMeeting";

jest.mock("../../services/syncMeeting", () => ({
  retryMeetingSync: jest.fn(),
}));

const mockRetry = retryMeetingSync as jest.Mock;

const Harness: React.FC<{ onSyncSuccess?: () => void }> = ({ onSyncSuccess }) => {
  const { googleSyncStatus, zoomSyncStatus, googleSyncError, zoomSyncError, syncing, handleRetrySync } =
    useRetrySync({
      mid: "m-1",
      initialGoogleSyncStatus: "error",
      initialGoogleSyncError: "Insufficient permissions.",
      onSyncSuccess,
    });
  return (
    <div>
      <div data-testid="google-status">{googleSyncStatus ?? "null"}</div>
      <div data-testid="google-error">{googleSyncError ?? "null"}</div>
      <div data-testid="zoom-status">{zoomSyncStatus ?? "null"}</div>
      <div data-testid="zoom-error">{zoomSyncError ?? "null"}</div>
      <div data-testid="syncing">{String(syncing)}</div>
      <button onClick={handleRetrySync}>Retry</button>
    </div>
  );
};

const renderHarness = (onSyncSuccess?: () => void) =>
  render(
    <ToastProvider>
      <Harness onSyncSuccess={onSyncSuccess} />
    </ToastProvider>
  );

afterEach(() => {
  jest.clearAllMocks();
});

describe("useRetrySync", () => {
  it("initializes state from the initial*/error props", () => {
    renderHarness();
    expect(screen.getByTestId("google-status")).toHaveTextContent("error");
    expect(screen.getByTestId("google-error")).toHaveTextContent("Insufficient permissions.");
    expect(screen.getByTestId("syncing")).toHaveTextContent("false");
  });

  it("updates status and calls onSyncSuccess once every applicable channel is synced", async () => {
    mockRetry.mockResolvedValue({ googleSyncStatus: "synced", googleSyncError: null, zoomSyncStatus: null, zoomSyncError: null });
    const onSyncSuccess = jest.fn();
    renderHarness(onSyncSuccess);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("synced")).toBeInTheDocument();
    expect(onSyncSuccess).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Sync retried successfully.")).toBeInTheDocument();
    expect(screen.getByTestId("syncing")).toHaveTextContent("false");
  });

  it("treats a null googleSyncStatus response as not-applicable, not an error", async () => {
    // Mirrors zoomSyncStatus's existing null-for-a-meeting-that-doesn't-need-Zoom meaning --
    // previously the stored status defaulted null to 'error' while the success check already
    // treated null as fine, so this response fired onSyncSuccess/a success toast while
    // MeetingSyncStatusBand simultaneously rendered "Failed to sync" from the stored 'error'.
    mockRetry.mockResolvedValue({ googleSyncStatus: null, googleSyncError: null, zoomSyncStatus: null, zoomSyncError: null });
    const onSyncSuccess = jest.fn();
    renderHarness(onSyncSuccess);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("Sync retried successfully.");
    expect(onSyncSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("google-status")).toHaveTextContent("null");
  });

  it("does not call onSyncSuccess when one channel is still failing", async () => {
    mockRetry.mockResolvedValue({
      googleSyncStatus: "synced",
      googleSyncError: null,
      zoomSyncStatus: "error",
      zoomSyncError: "Meeting ID no longer exists.",
    });
    const onSyncSuccess = jest.fn();
    renderHarness(onSyncSuccess);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText(/Retry failed: Zoom/)).toBeInTheDocument();
    expect(onSyncSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("zoom-status")).toHaveTextContent("error");
  });

  it("falls back to an error status and toast when the retry request itself throws", async () => {
    mockRetry.mockRejectedValue(new Error("network down"));
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Could not retry the sync.")).toBeInTheDocument();
    expect(screen.getByTestId("google-status")).toHaveTextContent("error");
    expect(screen.getByTestId("google-error")).toHaveTextContent("null");
    expect(screen.getByTestId("syncing")).toHaveTextContent("false");
  });
});
